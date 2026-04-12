"""Live smoke test for a running SalesInsight environment.

Usage:
  python backend/scripts/smoke_live.py \
    --base-url http://127.0.0.1:8002 \
    --email swas@nyaaa.com \
    --password '...'

Optional:
  --frontend-url http://127.0.0.1:5175
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import requests


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Smoke test a live SalesInsight server")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--frontend-url", default=None)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--line", default="Travel")
    parser.add_argument("--period", type=int, default=12)
    return parser.parse_args()


def _record(results: list[tuple[str, bool, str]], name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))


def _json(resp: requests.Response) -> Any:
    ctype = resp.headers.get("content-type", "")
    return resp.json() if ctype.startswith("application/json") else None


def main() -> int:
    args = _parse_args()
    session = requests.Session()
    results: list[tuple[str, bool, str]] = []

    health = session.get(f"{args.base_url}/api/health", timeout=10)
    health_json = _json(health) or {}
    _record(
        results,
        "health",
        health.status_code == 200 and health_json.get("status") == "ok",
        f"status={health.status_code}",
    )

    login = session.post(
        f"{args.base_url}/api/auth/login",
        json={"email": args.email, "password": args.password},
        timeout=10,
    )
    login_json = _json(login) or {}
    token = login_json.get("token")
    _record(results, "login", login.status_code == 200 and bool(token), f"status={login.status_code}")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    overview = session.get(
        f"{args.base_url}/api/sales/dashboard/overview",
        params={"line": args.line, "period": args.period},
        headers=headers,
        timeout=120,
    )
    overview_json = _json(overview) or {}
    _record(
        results,
        "dashboard_overview",
        overview.status_code == 200
        and all(
            key in overview_json
            for key in (
                "summary",
                "leaders",
                "insights",
                "funnel",
                "slipping",
                "lead_sources",
                "close_speed",
                "targets",
                "achievement",
            )
        ),
        f"status={overview.status_code}",
    )

    targets = session.get(f"{args.base_url}/api/targets", headers=headers, timeout=30)
    targets_json = _json(targets) or {}
    _record(
        results,
        "targets",
        targets.status_code == 200 and "targets" in targets_json and "upload" in targets_json,
        f"status={targets.status_code} count={len(targets_json.get('targets', []))}",
    )

    achievement = session.get(
        f"{args.base_url}/api/targets/achievement",
        params={"line": args.line},
        headers=headers,
        timeout=120,
    )
    achievement_json = _json(achievement) or {}
    _record(
        results,
        "targets_achievement",
        achievement.status_code == 200
        and "current_month" in achievement_json
        and "yearly" in achievement_json,
        f"status={achievement.status_code}",
    )

    boundaries = session.get(f"{args.base_url}/api/territory/boundaries", timeout=60)
    boundaries_json = _json(boundaries) or {}
    _record(
        results,
        "territory_boundaries",
        boundaries.status_code == 200
        and "county_geojson" in boundaries_json
        and "zips" in boundaries_json,
        f"status={boundaries.status_code}",
    )

    census = session.get(
        f"{args.base_url}/api/territory/census-data",
        params={"level": "zip"},
        timeout=60,
    )
    census_json = _json(census) or {}
    _record(
        results,
        "territory_census",
        census.status_code == 200
        and census_json.get("level") == "zip"
        and isinstance(census_json.get("rows"), list),
        f"status={census.status_code}",
    )

    if args.frontend_url:
        frontend = session.get(args.frontend_url, timeout=10)
        body = frontend.text.lower()
        _record(
            results,
            "frontend_root",
            frontend.status_code == 200 and "<div id=\"root\"></div>" in body,
            f"status={frontend.status_code}",
        )

    failed = [name for name, ok, _ in results if not ok]
    for name, ok, detail in results:
        status = "PASS" if ok else "FAIL"
        print(f"{name}: {status} {detail}")

    if failed:
        print(f"FAILED: {failed}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
