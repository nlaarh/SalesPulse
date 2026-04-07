"""Salesforce REST client — OAuth2 with auto-refresh, rate limiting, pagination."""

import os, time, threading, logging, re
from concurrent.futures import ThreadPoolExecutor
import requests
from requests.adapters import HTTPAdapter
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=False)

log = logging.getLogger('sf_client')

# ── Connection-pooled HTTP session ──────────────────────────────────────────

_session = requests.Session()
_adapter = HTTPAdapter(pool_connections=10, pool_maxsize=20, max_retries=3)
_session.mount('https://', _adapter)
_session.mount('http://', _adapter)

# ── Auth (cached, auto-refresh) ─────────────────────────────────────────────

_auth = {}
_auth_lock = threading.Lock()


def _authenticate():
    """Get fresh Salesforce access token."""
    resp = _session.post(os.getenv('SF_TOKEN_URL'), data={
        'grant_type': 'password',
        'client_id': os.getenv('SF_CONSUMER_KEY'),
        'client_secret': os.getenv('SF_CONSUMER_SECRET'),
        'username': os.getenv('SF_USERNAME'),
        'password': os.getenv('SF_PASSWORD') + os.getenv('SF_SECURITY_TOKEN', ''),
    }, timeout=30).json()
    if 'access_token' not in resp:
        raise Exception(f"SF auth failed: {resp}")
    return resp['access_token'], resp['instance_url']


def _get_auth():
    """Get cached auth, refresh if expired."""
    with _auth_lock:
        if 'token' in _auth and time.time() < _auth.get('expires', 0):
            return _auth['token'], _auth['base']
        token, base = _authenticate()
        _auth['token'] = token
        _auth['base'] = base
        _auth['expires'] = time.time() + 7000  # ~2h, refresh before 2h SF expiry
        log.info(f"SF authenticated: {base}")
        return token, base


def _headers():
    token, _ = _get_auth()
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


def _base():
    _, base = _get_auth()
    return base


def sf_instance_url() -> str:
    """Return the Salesforce instance URL (e.g. https://nyaaa.lightning.force.com)."""
    return _base()



_rate_lock = threading.Lock()
_call_times = []
# 150 calls/min — SF Enterprise allows 1,000+ API calls/24h per user.
# Cold-start dashboard fires ~30 parallel queries; this gives ample headroom.
_RATE_LIMIT = 150
_RATE_WINDOW = 60
# Max seconds to block-wait before giving up (for burst scenarios)
_RATE_MAX_WAIT = 12


class RateLimitExceeded(Exception):
    """Raised when SF API rate limit is exceeded after exhausting retries."""
    pass


def _rate_check():
    """Block briefly if needed, then record call. Raises after _RATE_MAX_WAIT seconds."""
    deadline = time.time() + _RATE_MAX_WAIT
    while True:
        with _rate_lock:
            now = time.time()
            _call_times[:] = [t for t in _call_times if now - t < _RATE_WINDOW]
            if len(_call_times) < _RATE_LIMIT:
                _call_times.append(time.time())
                return
            wait = _RATE_WINDOW - (now - _call_times[0])
        if wait <= 0 or time.time() + min(wait, 2) > deadline:
            raise RateLimitExceeded(
                f"Salesforce rate limit exceeded. Retry in {max(0, wait):.0f}s."
            )
        log.info(f"SF rate limit: waiting {min(wait, 2):.1f}s before retry")
        time.sleep(min(wait, 2))


# ── Query functions ──────────────────────────────────────────────────────────

DML_RE = re.compile(r'^\s*(INSERT|UPDATE|DELETE|UPSERT|MERGE|UNDELETE)\s', re.IGNORECASE)


def _validate(query: str):
    q = query.strip()
    if DML_RE.match(q):
        raise ValueError("BLOCKED: DML not allowed. Read-only.")
    if not q.upper().startswith('SELECT'):
        raise ValueError(f"Only SELECT queries allowed. Got: {q[:60]}")


def sf_query(query: str, paginate: bool = True) -> dict:
    """Execute SOQL via REST API with auto-pagination. Returns {totalSize, records}."""
    _validate(query)
    _rate_check()
    try:
        from activity_logger import log_sf_query
        log_sf_query(query)
    except Exception:
        pass  # never block queries due to logging
    base = _base()
    url = f"{base}/services/data/v62.0/query/?q={requests.utils.quote(query)}"
    all_recs = []
    while url:
        r = _session.get(url, headers=_headers(), timeout=120)
        if r.status_code != 200:
            return {"error": r.text[:2000], "status": r.status_code}
        data = r.json()
        all_recs.extend(data.get('records', []))
        if paginate and not data.get('done', True):
            url = f"{base}{data['nextRecordsUrl']}"
        else:
            url = None
    # Clean SF metadata cruft
    clean = []
    for rec in all_recs:
        cr = {}
        for k, v in rec.items():
            if k == 'attributes':
                continue
            if isinstance(v, dict) and 'attributes' in v:
                v = {kk: vv for kk, vv in v.items() if kk != 'attributes'}
            cr[k] = v
        clean.append(cr)
    return {"totalSize": len(clean), "records": clean}


def sf_query_all(query: str) -> list:
    """Execute SOQL and return just the records list."""
    result = sf_query(query, paginate=True)
    if 'error' in result:
        log.error(f"SOQL error: {result['error'][:200]}")
        return []
    return result.get('records', [])


def sf_sosl(sosl_query: str) -> list:
    """Execute a SOSL full-text search and return the searchRecords list."""
    token, instance_url = _get_auth()
    headers = _headers()
    url = f"{instance_url}/services/data/v59.0/search/"
    try:
        resp = _session.get(url, headers=headers, params={'q': sosl_query}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        records = data.get('searchRecords', [])
        # Strip 'attributes' metadata like sf_query does
        clean = []
        for r in records:
            cr = {k: v for k, v in r.items() if k != 'attributes'}
            for k, v in cr.items():
                if isinstance(v, dict) and 'attributes' in v:
                    cr[k] = {kk: vv for kk, vv in v.items() if kk != 'attributes'}
            clean.append(cr)
        return clean
    except Exception as e:
        log.error(f"SOSL error: {e}")
        return []


class SFQueryError(Exception):
    """Raised when one or more Salesforce queries fail, to prevent caching bad data."""
    pass


def sf_parallel(**queries) -> dict:
    """Run multiple SOQL queries in parallel. Returns {name: records_list}.
    Raises SFQueryError if any query fails so callers (via cached_query) don't cache zeros.
    """
    results = {}
    errors = []

    def _run(name: str, q: str):
        result = sf_query(q, paginate=True)
        if 'error' in result:
            log.error(f"Parallel query '{name}' SF error: {result['error'][:200]}")
            return name, None  # None = SF error (distinct from empty [])
        return name, result.get('records', [])

    with ThreadPoolExecutor(max_workers=min(len(queries), 5)) as pool:
        futures = {pool.submit(_run, name, q): name for name, q in queries.items()}
        for future in futures:
            name = futures[future]
            try:
                _, res = future.result(timeout=120)
                if res is None:
                    errors.append(name)
                    results[name] = []
                else:
                    results[name] = res
            except RateLimitExceeded:
                raise  # propagate as-is — not a data error, don't cache zeros
            except Exception as e:
                log.error(f"Parallel query '{name}' exception: {e}")
                errors.append(name)
                results[name] = []

    if errors:
        raise SFQueryError(f"SF queries failed (not caching): {errors}")
    return results
