**Smoke Cases**
Use these after backend/frontend changes, before multi-user perf runs, and after deploys.

Backend/API smoke:
- `GET /api/health` returns `200` with `{"status":"ok"}`.
- `POST /api/auth/login` returns `200` and a bearer token for a seeded active user.
- `GET /api/sales/dashboard/overview` returns `200` and includes:
  `summary`, `leaders`, `insights`, `funnel`, `slipping`, `lead_sources`, `close_speed`, `targets`, `achievement`.
- `GET /api/targets` returns `200` with both `targets` and `upload`.
- `GET /api/targets/achievement` returns `200` with `current_month` and `yearly`.
- `GET /api/territory/boundaries` returns `200` with `county_geojson` and `zips`.
- `GET /api/territory/census-data?level=zip` returns `200` with `level=zip` and a `rows` array.

Cache/invalidation regressions:
- `GET /api/targets` once with no uploads should return empty.
- `POST /api/admin/targets/confirm` then `GET /api/targets` should show the new upload immediately.
- `PUT /api/admin/targets/monthly` should not require a restart for `/api/targets` to reflect current data.
- `DELETE /api/admin/targets/monthly/{year}/reseed` should not leave stale target payloads in `/api/targets`.
- `POST /api/admin/geo/refresh` should invalidate `territory/boundaries` and `territory/census-data` without waiting for TTL expiry.

Frontend smoke:
- Frontend root serves HTML with `<div id="root"></div>`.
- Login succeeds in browser and lands on dashboard.
- Dashboard loads without a `500` from `/api/sales/dashboard/overview`.
- Top Opportunities initial load does not trigger an automatic second AI fetch.

Multi-user/perf precheck:
- Run the backend smoke first.
- Confirm `_RATE_LIMIT` in `backend/sf_client.py` stays at `150`.
- Confirm local/dev servers are using the intended ports before Playwright or load scripts.

Runner:
- Live environment smoke script: [backend/scripts/smoke_live.py](/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend/scripts/smoke_live.py)
- Example:
```bash
python backend/scripts/smoke_live.py \
  --base-url http://127.0.0.1:8002 \
  --frontend-url http://127.0.0.1:5175 \
  --email swas@nyaaa.com \
  --password '...'
```
