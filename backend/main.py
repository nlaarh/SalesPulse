"""SalesInsight — FastAPI backend for AAA Travel & Insurance analytics."""

import os, sys, logging, time

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=False)

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
log = logging.getLogger('main')


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: backup DB, flush disk cache if code changed.
    Starts a 3 AM daily cache warm-up for heavy endpoints.
    """
    import cache, hashlib, asyncio, shutil
    from datetime import datetime, timedelta
    from database import DB_PATH, DB_DIR

    # ── Auto-backup DB on every startup (protects against deploy issues) ──
    if DB_PATH.exists():
        backup_dir = DB_DIR / 'backups'
        backup_dir.mkdir(exist_ok=True)
        ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        backup_file = backup_dir / f'salesinsight_{ts}.db'
        shutil.copy2(DB_PATH, backup_file)
        log.info(f"DB backup created: {backup_file} ({backup_file.stat().st_size // 1024}KB)")
        # Keep only last 5 backups
        backups = sorted(backup_dir.glob('salesinsight_*.db'), reverse=True)
        for old in backups[5:]:
            old.unlink(missing_ok=True)
            log.info(f"Pruned old backup: {old.name}")

    log.info(f"Database path: {DB_PATH} (exists={DB_PATH.exists()}, size={DB_PATH.stat().st_size // 1024 if DB_PATH.exists() else 0}KB)")
    from datetime import datetime, timedelta

    # Hash the key backend files that affect query logic / response shape
    backend_dir = Path(__file__).resolve().parent
    hasher = hashlib.md5()
    for pattern in ('*.py', 'routers/*.py'):
        for f in sorted(backend_dir.glob(pattern)):
            hasher.update(f.read_bytes())
    current_hash = hasher.hexdigest()

    version_file = cache._CACHE_DIR / '.deploy_hash'
    cache._CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stored_hash = version_file.read_text().strip() if version_file.exists() else ''

    if current_hash != stored_hash:
        # New deployment — flush stale cache so old query shapes don't persist
        flushed = sum(1 for f in cache._CACHE_DIR.glob('*.json') if (f.unlink(), True)[1])
        version_file.write_text(current_hash)
        log.info(f"New deployment detected: flushed {flushed} cache entries")
    else:
        log.info("Restart detected (same code): keeping existing cache")

    # Background scheduler: warm caches at 3 AM ET daily
    async def cache_warmer():
        from zoneinfo import ZoneInfo
        et = ZoneInfo('America/New_York')
        while True:
            now = datetime.now(et)
            next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            wait_secs = (next_run - now).total_seconds()
            log.info(f"Cache warmer: next run at {next_run.isoformat()} ({wait_secs/3600:.1f}h)")
            await asyncio.sleep(wait_secs)
            log.info("Cache warmer: flushing stale caches for daily refresh")
            try:
                # Clear L1 memory cache — next request will rebuild from SF
                cache._l1.clear()
                # Clear expired L2 disk entries so they refresh
                for f in cache._CACHE_DIR.glob('*.json'):
                    try:
                        f.unlink()
                    except OSError:
                        pass
                log.info("Cache warmer: caches cleared, next requests will fetch fresh data")
            except Exception as e:
                log.warning(f"Cache warmer failed: {e}")

    warmer_task = asyncio.create_task(cache_warmer())

    # ── Pre-warm expensive caches in background thread on startup ──
    import threading
    def _startup_warm():
        """Pre-fetch territory map + market pulse so first user doesn't wait 30s+."""
        import time
        time.sleep(2)  # let server finish startup first
        try:
            from routers.territory_map import territory_map_data
            from shared import resolve_dates
            sd, ed = resolve_dates(None, None, 4)
            log.info("Cache warm-up: fetching territory map data...")
            territory_map_data(period=4, start_date=sd, end_date=ed)
            log.info("Cache warm-up: territory map done")
        except Exception as e:
            log.warning(f"Cache warm-up territory failed: {e}")
        try:
            from routers.market_pulse import market_pulse
            log.info("Cache warm-up: fetching market pulse data...")
            market_pulse(period=6)
            log.info("Cache warm-up: market pulse done")
        except Exception as e:
            log.warning(f"Cache warm-up market pulse failed: {e}")

    threading.Thread(target=_startup_warm, daemon=True).start()

    yield  # app runs here

    warmer_task.cancel()


app = FastAPI(title="SalesInsight", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://salespulse-nyaaa.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_timing_middleware(request, call_next):
    """Capture API request durations for p50/p95 operational visibility."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000

    path = request.url.path
    # Only track API routes; avoid static assets/noisy paths.
    if not path.startswith('/api/'):
        return response

    # Skip self-ingest endpoint to avoid recursion/noise.
    if path.startswith('/api/perf/client-render'):
        return response

    try:
        from database import SessionLocal
        from models import ApiRequestMetric
        from auth import decode_token

        route = request.scope.get('route')
        normalized_path = getattr(route, 'path', path)

        user_id = None
        user_email = None
        auth_header = request.headers.get('authorization', '')
        if auth_header.lower().startswith('bearer '):
            token = auth_header.split(' ', 1)[1].strip()
            try:
                payload = decode_token(token)
                sub = payload.get('sub')
                if sub is not None:
                    user_id = int(sub)
                user_email = payload.get('email')
            except Exception:
                # Ignore auth parsing failures for timing telemetry.
                pass

        db = SessionLocal()
        try:
            db.add(ApiRequestMetric(
                method=request.method,
                path=normalized_path,
                raw_path=path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 3),
                user_id=user_id,
                user_email=user_email,
                source='middleware',
            ))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        log.debug(f"request_timing_middleware failed: {e}")

    return response

# ── Initialize database ──────────────────────────────────────────────────────

from database import init_db
init_db()

# ── Register routers ─────────────────────────────────────────────────────────

from routers import sales_advisor, sales_pipeline, sales_travel, sales_leads, sales_performance, sales_opportunities, sales_agent_profile, sales_narrative, users, activity_logs, advisor_targets, advisor_targets_monthly, advisor_targets_achievement, email_report, issues, ai_config, customer_profile, cross_sell, market_pulse, territory_map, ai_queries, performance_metrics, cache_admin

app.include_router(sales_advisor.router)
app.include_router(sales_pipeline.router)
app.include_router(sales_travel.router)
app.include_router(sales_leads.router)
app.include_router(sales_performance.router)
app.include_router(sales_opportunities.router)
app.include_router(sales_agent_profile.router)
app.include_router(sales_narrative.router)
app.include_router(users.router)
app.include_router(activity_logs.router)
app.include_router(advisor_targets.router)
app.include_router(advisor_targets_monthly.router)
app.include_router(advisor_targets_achievement.router)
app.include_router(email_report.router)
app.include_router(issues.router)
app.include_router(ai_config.router)
app.include_router(customer_profile.router)
app.include_router(cross_sell.router)
app.include_router(market_pulse.router)
app.include_router(territory_map.router)
app.include_router(ai_queries.router)
app.include_router(performance_metrics.router)
app.include_router(cache_admin.router)


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "SalesInsight"}


# ── Serve React SPA ──────────────────────────────────────────────────────────

_static_dir = Path(__file__).resolve().parent / "static"

if _static_dir.is_dir():
    _assets_dir = _static_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        file_path = _static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")
