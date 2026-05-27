"""
Cross-source data audit: validates every data source via the running API.

Checks:
  1. Agent Profile summary.commission == sum(months[].commission)    [internal consistency]
  2. Agent Profile summary.revenue   == sum(months[].revenue)         [internal consistency]
  3. Agent Profile monthly totals  == Monthly Report totals           [cross-endpoint]
  4. Leaderboard commission        ≈  Agent Profile commission        [PBI consistency]
  5. SF data (deals, leads)        present and non-zero for active advisors
  6. Targets (PostgreSQL)          annual_target > 0 for active advisors

Usage:
  python audit_data_sources.py [--line Travel|Insurance] [--year 2026] [--top N] [--delay S] [--token JWT]
"""

import sys, json, requests, argparse, time
from datetime import date

API_BASE = "http://127.0.0.1:8002"
TODAY    = date.today().isoformat()
CY       = date.today().year

RED  = "\033[91m"; GRN = "\033[92m"; YLW = "\033[93m"
RST  = "\033[0m";  BOLD= "\033[1m"

_SESSION = requests.Session()
_DELAY   = 2.0  # seconds between agent profile requests

def ok(m):   print(f"  {GRN}✓{RST} {m}")
def err(m):  print(f"  {RED}✗{RST} {m}")
def warn(m): print(f"  {YLW}!{RST} {m}")
def hdr(m):  print(f"\n{BOLD}{m}{RST}")

THRESH = 2.0  # % tolerance

def pct(a, b):
    if b == 0: return 0 if a == 0 else 999.9
    return abs(a - b) / b * 100

def api(path, _auth=False, **p):
    url = f"{API_BASE}{path}"
    r = _SESSION.get(url, params=p, timeout=90)
    if r.status_code == 403 and _auth:
        warn(f"{path} requires auth (--token JWT); skipping")
        return None
    r.raise_for_status()
    try:
        return r.json()
    except Exception as e:
        print(f"Error parsing JSON from {r.url}. Status: {r.status_code}. Response: {r.text[:500]}")
        raise e


# ─── 1. Get advisor list from leaderboard (PBI) ───────────────────────────────

def get_advisors(line, sd, ed, top_n):
    resp = api("/api/sales/advisors/leaderboard", line=line, start_date=sd, end_date=ed)
    rows = resp if isinstance(resp, list) else resp.get('advisors', resp.get('data', []))
    rows.sort(key=lambda r: r.get('commission', r.get('comm', 0)) or 0, reverse=True)
    return rows[:top_n]


# ─── 2. Agent profile audit ───────────────────────────────────────────────────

def audit_profile(line, sd, ed, name, lb_comm):
    """Check internal consistency of agent profile + cross vs leaderboard."""
    try:
        p = api("/api/sales/agent/profile", name=name, line=line, start_date=sd, end_date=ed)
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            warn(f"{name:<28} not in sales whitelist (404) — name mismatch?")
        else:
            warn(f"{name:<28} profile API error: {e}")
        return None
    except Exception as e:
        warn(f"{name:<28} profile API error: {e}")
        return None

    summary = p.get('summary', {})
    api_comm = summary.get('commission', 0) or 0
    api_rev  = summary.get('revenue', 0) or 0
    deals    = summary.get('deals', 0) or 0
    leads    = summary.get('leads', 0) or 0

    months = p.get('months', [])
    mo_comm = sum(m.get('commission', 0) or 0 for m in months)
    mo_rev  = sum(m.get('revenue', 0) or 0 for m in months)

    issues = []

    # a) internal: summary vs sum-of-months
    c_diff = pct(api_comm, mo_comm)
    r_diff = pct(api_rev, mo_rev)
    if c_diff > THRESH:
        issues.append(f"comm summary={api_comm:,.0f} vs months_sum={mo_comm:,.0f} ({c_diff:.1f}%)")
    if r_diff > THRESH:
        issues.append(f"rev summary={api_rev:,.0f} vs months_sum={mo_rev:,.0f} ({r_diff:.1f}%)")

    # b) cross: profile vs leaderboard
    if lb_comm is not None:
        lb_diff = pct(api_comm, lb_comm)
        if lb_diff > THRESH:
            issues.append(f"comm profile={api_comm:,.0f} vs leaderboard={lb_comm:,.0f} ({lb_diff:.1f}%)")

    # c) SF data present
    if deals == 0:
        issues.append("SF deals=0 (may be OK for new agent)")

    if issues:
        err(f"{name:<28} comm=${api_comm:>9,.0f}  rev=${api_rev:>10,.0f}  deals={deals:<4}  leads={leads:<4}")
        for iss in issues:
            print(f"           {RED}→ {iss}{RST}")
    else:
        ok(f"{name:<28} comm=${api_comm:>9,.0f}  rev=${api_rev:>10,.0f}  deals={deals:<4}  leads={leads:<4}  ✓")

    return {'name': name, 'comm': api_comm, 'rev': api_rev, 'issues': issues}


# ─── 3. Monthly report cross-check ───────────────────────────────────────────

def audit_monthly_report(line, year, profile_results):
    hdr(f"[B] MONTHLY REPORT vs AGENT PROFILE  ({line}, {year})")
    try:
        resp = api("/api/sales/performance/monthly", line=line, year=year)
        rows = resp if isinstance(resp, list) else resp.get('advisors', resp.get('data', []))
    except Exception as e:
        warn(f"Monthly report API not available: {e}"); return

    # build lookup {name_lower: total_commission}
    monthly_map = {}
    for r in rows:
        name = (r.get('name') or r.get('advisor_name') or '').strip()
        # sum all month columns
        total = sum(
            (r.get(f'm{m}') or r.get(str(m)) or {}).get('commission', 0) or 0
            for m in range(1, 13)
        )
        if not total:
            # try flat field
            total = r.get('total_commission') or r.get('ytd_commission') or 0
        monthly_map[name.lower()] = (name, total)

    for res in profile_results:
        if not res: continue
        name = res['name']
        key  = name.strip().lower()
        match = monthly_map.get(key)
        if not match:
            warn(f"{name:<28} not found in monthly report")
            continue
        _, mo_total = match
        diff = pct(res['comm'], mo_total)
        if diff > THRESH:
            err(f"{name:<28} profile=${res['comm']:>9,.0f}  monthly_report=${mo_total:>9,.0f}  diff={diff:.1f}%")
        else:
            ok(f"{name:<28} ${res['comm']:>9,.0f}  ✓ matches monthly report")


# ─── 4. Targets (PostgreSQL) spot-check ──────────────────────────────────────

def audit_targets(line, year, names):
    hdr(f"[C] ADVISOR TARGETS — PostgreSQL  ({line}, {year})")
    try:
        resp = api("/api/targets/with-actuals", _auth=True, line=line, year=year)
        if resp is None:
            return
        rows = resp if isinstance(resp, list) else resp.get('targets', resp.get('advisors', []))
    except Exception as e:
        warn(f"Targets API error: {e}"); return

    name_map = {(r.get('name') or '').strip().lower(): r for r in rows}
    for name in names:
        row = name_map.get(name.strip().lower())
        if not row:
            warn(f"{name:<28} no target record in PostgreSQL")
            continue
        ytd = row.get('annual_target') or row.get('ytd_target') or row.get('target_commission') or 0
        if ytd <= 0:
            err(f"{name:<28} annual_target=$0 — missing PostgreSQL target")
        else:
            ok(f"{name:<28} annual_target=${ytd:>9,.0f}  ✓ PostgreSQL record exists")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--line',  default='Travel')
    parser.add_argument('--year',  type=int,   default=CY)
    parser.add_argument('--top',   type=int,   default=20)
    parser.add_argument('--delay', type=float, default=2.0,
                        help='Seconds between agent profile requests (default 2s)')
    parser.add_argument('--token', default='',
                        help='JWT Bearer token for authenticated endpoints (targets)')
    args = parser.parse_args()

    global _DELAY
    _DELAY = args.delay
    if args.token:
        _SESSION.headers['Authorization'] = f'Bearer {args.token}'

    line = args.line
    year = args.year
    sd   = f"{year}-01-01"
    ed   = f"{year}-12-31" if year < CY else TODAY

    print(f"\n{BOLD}╔══════════════════════════════════════════════╗")
    print(f"║  SalesPulse Data Audit                       ║")
    print(f"║  Line={line:<12} Year={year}  {TODAY}  ║")
    print(f"╚══════════════════════════════════════════════╝{RST}")

    # Get top advisors from leaderboard
    hdr(f"[A] AGENT PROFILES — internal consistency + PBI cross-check  ({line}, {sd}→{ed})")
    print(f"  Fetching top {args.top} advisors from leaderboard...")
    try:
        lb_rows = get_advisors(line, sd, ed, args.top)
    except Exception as e:
        import traceback
        traceback.print_exc()
        warn(f"Leaderboard error: {e}")
        lb_rows = []

    _NOISE = ('misc', 'dept agent', 'group dept', 'aaa.com')
    def _is_noise(n): return any(f in n.lower() for f in _NOISE)
    lb_rows = [r for r in lb_rows if r.get('name') and not _is_noise(r['name'])]
    lb_map = {r.get('name', '').strip(): r.get('commission', r.get('comm', 0)) for r in lb_rows}
    names  = [r.get('name', '').strip() for r in lb_rows if r.get('name')]

    if not names:
        warn("No advisors found. Check API.")
        return

    print(f"  Got {len(names)} advisors. Checking profiles (delay={_DELAY}s between requests)...\n")
    results = []
    for i, name in enumerate(names):
        if i > 0:
            time.sleep(_DELAY)
        lb_comm = lb_map.get(name)
        res = audit_profile(line, sd, ed, name, lb_comm)
        results.append(res)

    # Cross-check with monthly report
    audit_monthly_report(line, year, [r for r in results if r])

    # PostgreSQL targets
    audit_targets(line, year, names)

    # Summary
    total   = len([r for r in results if r])
    failing = sum(1 for r in results if r and r['issues'])
    print(f"\n{BOLD}═══════════════════════════════════════════════")
    if failing == 0:
        print(f"  {GRN}ALL {total} advisors PASS — data sources consistent{RST}")
    else:
        print(f"  {RED}{failing}/{total} advisors have issues — see above{RST}")
    print(f"  Threshold: {THRESH}%  |  Line: {line}  |  Period: {sd}→{ed}")
    print(f"═══════════════════════════════════════════════{RST}\n")


if __name__ == '__main__':
    main()
