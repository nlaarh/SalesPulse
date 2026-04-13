"""Sequential cache warmer for heavy endpoints.

Runs nightly via main.py's 3 AM schedule + on-demand via /api/admin/cache/warm-now.
Designed to protect Salesforce from hammering: sequential, 2s between queries,
per-query 60s timeout, records every run to cache_warm_runs SQLite table.
"""
import json
import logging
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout

log = logging.getLogger('salesinsight.warmer')

PER_QUERY_TIMEOUT = 60.0      # seconds
SLEEP_BETWEEN_QUERIES = 2.0   # seconds — protect SF


def _run_warm_sequence(endpoints, trigger='nightly', sleep_between=SLEEP_BETWEEN_QUERIES):
    """Execute a list of (name, callable) sequentially with per-query timeout.

    Returns a summary dict. Does NOT write to DB — caller does that.
    """
    start = datetime.now(timezone.utc)
    log_entries = []
    success = 0
    failed = 0

    for name, fn in endpoints:
        q_start = time.time()
        try:
            exe = ThreadPoolExecutor(max_workers=1)
            try:
                fut = exe.submit(fn)
                fut.result(timeout=PER_QUERY_TIMEOUT)
            finally:
                # Don't block on hung threads — prevents stuck SF calls from stalling warmer
                exe.shutdown(wait=False, cancel_futures=True)
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': True,
                'duration_ms': duration_ms,
                'error': None,
            })
            success += 1
            log.info(f"Warm OK: {name} ({duration_ms}ms)")
        except FutTimeout:
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': False,
                'duration_ms': duration_ms,
                'error': f'timeout after {PER_QUERY_TIMEOUT}s',
            })
            failed += 1
            log.warning(f"Warm TIMEOUT: {name} ({duration_ms}ms)")
        except Exception as e:
            duration_ms = int((time.time() - q_start) * 1000)
            log_entries.append({
                'endpoint': name,
                'ok': False,
                'duration_ms': duration_ms,
                'error': str(e)[:500],
            })
            failed += 1
            log.warning(f"Warm FAIL: {name}: {e}")

        if sleep_between > 0:
            time.sleep(sleep_between)

    end = datetime.now(timezone.utc)
    total_ms = int((end - start).total_seconds() * 1000)

    if failed == 0:
        status = 'success'
    elif success == 0:
        status = 'failed'
    else:
        status = 'partial'

    return {
        'started_at': start,
        'ended_at': end,
        'trigger': trigger,
        'status': status,
        'endpoints_total': len(endpoints),
        'endpoints_success': success,
        'endpoints_failed': failed,
        'duration_ms': total_ms,
        'log': log_entries,
    }


def _persist_run(summary):
    """Write the run summary to cache_warm_runs table."""
    from database import SessionLocal
    from models import CacheWarmRun
    db = SessionLocal()
    try:
        row = CacheWarmRun(
            started_at=summary['started_at'],
            ended_at=summary['ended_at'],
            trigger=summary['trigger'],
            status=summary['status'],
            endpoints_total=summary['endpoints_total'],
            endpoints_success=summary['endpoints_success'],
            endpoints_failed=summary['endpoints_failed'],
            duration_ms=summary['duration_ms'],
            log_json=json.dumps(summary['log']),
        )
        db.add(row)
        db.commit()
    except Exception as e:
        log.error(f"Could not persist warm run: {e}")
    finally:
        db.close()


def _build_endpoint_list():
    """Build the list of (name, callable) for heavy endpoints.

    Each callable invokes the endpoint's fetch function directly (not via HTTP).
    This lets the warm loop benefit from cache.py's stampede protection —
    user requests in flight share the same fetch.

    NOTE: Endpoints that require FastAPI Depends() (auth, DB session) are
    excluded because they cannot be called directly outside a request context.
    Excluded: get_top_customers (auth), get_target_achievement (auth + db).
    """
    from routers.sales_performance import performance_monthly, performance_funnel
    from routers.sales_advisor import advisor_leaderboard, advisor_yoy
    from routers.sales_leads import leads_volume, agent_close_speed
    from routers.territory_map import territory_map_data
    from routers.market_pulse import market_pulse
    from routers.cross_sell import cross_sell_insights

    # IMPORTANT: FastAPI endpoints use Query(None) as default for optional params.
    # When called directly (not via HTTP), Python passes the Query object, not None.
    # We must pass explicit None for each Query-defaulted param (start_date, end_date).
    endpoints = []

    for line in ('Travel', 'Insurance'):
        endpoints.append((f'monthly_{line}',
            lambda l=line: performance_monthly(line=l, period=12, start_date=None, end_date=None)))
        endpoints.append((f'leaderboard_{line}',
            lambda l=line: advisor_leaderboard(line=l, period=12, start_date=None, end_date=None)))
        endpoints.append((f'yoy_{line}',
            lambda l=line: advisor_yoy(line=l, year=None)))
        endpoints.append((f'funnel_{line}',
            lambda l=line: performance_funnel(line=l, period=12, start_date=None, end_date=None)))
        endpoints.append((f'leads_volume_{line}',
            lambda l=line: leads_volume(line=l, period=12, start_date=None, end_date=None)))
        endpoints.append((f'close_speed_{line}',
            lambda l=line: agent_close_speed(line=l, period=12, start_date=None, end_date=None)))

    # Line-independent endpoints
    endpoints.append(('territory_map',
        lambda: territory_map_data(period=12, start_date=None, end_date=None)))
    endpoints.append(('market_pulse',
        lambda: market_pulse(period=6, start_date=None, end_date=None)))
    endpoints.append(('cross_sell',
        lambda: cross_sell_insights(period=12, start_date=None, end_date=None)))

    return endpoints


def warm_heavy_endpoints(trigger='nightly'):
    """Top-level entry: build endpoint list, run sequentially, persist result."""
    endpoints = _build_endpoint_list()
    summary = _run_warm_sequence(endpoints, trigger=trigger)
    _persist_run(summary)
    log.info(
        f"Warm {trigger} complete: {summary['endpoints_success']}/"
        f"{summary['endpoints_total']} ok in {summary['duration_ms']/1000:.1f}s"
    )
    return summary
