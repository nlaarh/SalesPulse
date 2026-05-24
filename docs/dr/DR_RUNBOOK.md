# SalesPulse — Disaster Recovery Runbook

**Contact:** nlaaroubi@nyaaa.com  
**Last updated:** 2026-05-24  
**RTO target:** ~15 minutes (manual procedure)  
**RPO target:** ~5 minutes (Azure PITR granularity)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRIMARY (active)                         │
│                                                                 │
│  salespulse-nyaaa.azurewebsites.net      West US 2              │
│  App Service Basic B2 · Python 3.12                             │
│       │                                                         │
│       │  PG_HOST=fslapp-pg.postgres.database.azure.com          │
│       ▼                                                         │
│  fslapp-pg.postgres.database.azure.com   East US 2              │
│  PG Flexible Server PG16 · 64 GiB                               │
│  Schema: sales  (shared with FSLAPP → core / optimizer)         │
└─────────────────────────────────────────────────────────────────┘

                         PITR restore (periodic)
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────┐
│                     DR STANDBY (idle until failover)            │
│                                                                 │
│  salespulse-nyaaa-dr.azurewebsites.net   West US 2              │
│  App Service P1v3 Premium · Python 3.12                         │
│       │                                                         │
│       │  PG_HOST=fslapp-pg-dr.postgres.database.azure.com       │
│       ▼                                                         │
│  fslapp-pg-dr.postgres.database.azure.com  East US 2            │
│  PG Flexible Server PG16 · 64 GiB  (independent PITR clone)    │
│  Schema: sales                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key architectural facts:**
- `fslapp-pg-dr` is a **PITR clone**, not a streaming replica. It is an independent server created by restoring from `fslapp-pg` at a point in time. There is no continuous replication and no "promote" command.
- The DR DB is **shared with FSLAPP** (same `fslapp-pg` server; FSLAPP uses schemas `core`/`optimizer`; SalesPulse uses schema `sales`). Failing over the DB means **both apps must be redirected simultaneously** — see [Cross-App Coordination](#cross-app-coordination).
- Auth uses Azure Entra managed identities — zero secrets in connection strings. The DR app's system-assigned managed identity must be an Entra user in the DR DB with grants on the `sales` schema.
- The DR App Service (`salespulse-nyaaa-dr`) is P1v3 Premium, which is **one tier above** the primary's Basic B2. This is intentional headroom for DR load.

---

## DR Resource Inventory

| Resource | Type | Region | Spec | URL / Hostname |
|---|---|---|---|---|
| `salespulse-nyaaa` | App Service (primary) | West US 2 | Basic B2, Python 3.12 | https://salespulse-nyaaa.azurewebsites.net |
| `salespulse-nyaaa-dr` | App Service (DR) | West US 2 | P1v3 Premium, Python 3.12 | https://salespulse-nyaaa-dr.azurewebsites.net |
| `fslapp-pg` | PG Flexible Server (primary) | East US 2 | PG16, Burstable B2s, 64 GiB | fslapp-pg.postgres.database.azure.com |
| `fslapp-pg-dr` | PG Flexible Server (DR clone) | East US 2 | PG16, Burstable B2s, 64 GiB | fslapp-pg-dr.postgres.database.azure.com |

**Subscription:** `e287db16-b6ae-415e-bd52-41c8ec5a8f08`  
**Resource group:** `rg-nlaaroubi-sbx-eus2-001`

---

## Normal Operations (Standby Mode)

In normal operation:
- `salespulse-nyaaa` serves all traffic, connected to `fslapp-pg` (schema `sales`).
- `salespulse-nyaaa-dr` is **running but idle** (or stopped to reduce cost). It receives no user traffic.
- `fslapp-pg-dr` is refreshed periodically (see [DR DB Refresh](#dr-db-refresh-procedure)).
- The DR DB is tested quarterly by performing a smoke-test failover.

**Estimated data lag:** Equals time since the last PITR refresh. Recommended refresh cadence: weekly.

---

## Pre-Failover Prerequisites

Verify these are in place before any incident (set up at DR creation time, not during):

### 1. DR App has code deployed

```bash
az webapp show \
  --name salespulse-nyaaa-dr \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "state" --output tsv
```

Expected: `Running`. If stopped:
```bash
az webapp start --name salespulse-nyaaa-dr --resource-group rg-nlaaroubi-sbx-eus2-001
```

### 2. DR App has system-assigned managed identity enabled

```bash
az webapp identity show \
  --name salespulse-nyaaa-dr \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "principalId" --output tsv
```

Expected: a non-empty GUID. If empty:
```bash
az webapp identity assign \
  --name salespulse-nyaaa-dr \
  --resource-group rg-nlaaroubi-sbx-eus2-001
```

### 3. DR App identity is an Entra user on the DR DB with schema grants

The managed identity of `salespulse-nyaaa-dr` must exist as a PostgreSQL Entra user in `fslapp-pg-dr` with grants on the `sales` schema. Connect to the DR DB as an Entra admin and run:

```sql
-- Run as admin (e.g. nlaaroubi@nyaaa.com) against fslapp-pg-dr/fslapp
\du "salespulse-nyaaa-dr"

-- If missing, create and grant:
CREATE ROLE "salespulse-nyaaa-dr" WITH LOGIN;
SECURITY LABEL FOR "pgaadauth" ON ROLE "salespulse-nyaaa-dr" IS 'aadauth';
GRANT USAGE ON SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT USAGE, SELECT ON SEQUENCES TO "salespulse-nyaaa-dr";
```

> **PITR grant inheritance:** PITR clones roles from the source but Entra bindings for managed identities may not carry over. Re-verify and re-run these grants after every DR DB refresh.

### 4. DR App env vars are correct

Verify all required env vars exist on `salespulse-nyaaa-dr` (see [Env Var Checklist](#env-var-checklist)).

---

## Failover Procedure

**Trigger:** Primary app (`salespulse-nyaaa`) or primary DB (`fslapp-pg`) is unavailable or critically degraded with no ETA on recovery.

**Coordinate with FSLAPP:** If failing over the DB, FSLAPP must also redirect simultaneously. See [Cross-App Coordination](#cross-app-coordination).

### Step 1 — Declare incident and set variables

```bash
SUB="e287db16-b6ae-415e-bd52-41c8ec5a8f08"
RG="rg-nlaaroubi-sbx-eus2-001"
DR_APP="salespulse-nyaaa-dr"
DR_DB_HOST="fslapp-pg-dr.postgres.database.azure.com"
```

### Step 2 — Start the DR App Service (if stopped)

```bash
az webapp start --name $DR_APP --resource-group $RG
```

Wait ~30 seconds for startup.

### Step 3 — Point DR App at DR DB

SalesPulse uses the env vars `PG_HOST`, `PG_DATABASE`, `PG_SCHEMA`, and `PG_USER` (note: no `FSLAPP_` prefix — different from FSLAPP):

```bash
az webapp config appsettings set \
  --name $DR_APP \
  --resource-group $RG \
  --settings \
    PG_HOST="fslapp-pg-dr.postgres.database.azure.com" \
    PG_DATABASE="fslapp" \
    PG_SCHEMA="sales" \
    PG_USER="salespulse-nyaaa-dr"
```

The app restarts automatically on settings change. Wait ~30 seconds.

### Step 4 — Verify DR App is healthy

```bash
# HTTP smoke test
curl -sf https://salespulse-nyaaa-dr.azurewebsites.net/api/health | python3 -m json.tool

# If the app has a login page, verify it loads:
curl -sf -o /dev/null -w "%{http_code}" https://salespulse-nyaaa-dr.azurewebsites.net/login
```

Expected: HTTP 200. If 500, check logs:
```bash
az webapp log tail --name $DR_APP --resource-group $RG
```

### Step 5 — Verify DB connectivity

```bash
# Connect to DR DB as admin and confirm the sales schema is present
psql "host=fslapp-pg-dr.postgres.database.azure.com \
      dbname=fslapp \
      user=nlaaroubi@nyaaa.com \
      sslmode=require" \
  -c "\dn sales"
```

Expected: `sales` schema listed.

### Step 6 — Redirect users to DR URL

Route users to the DR URL by one of:
- Posting the DR URL to the internal status channel
- Updating any DNS CNAME or bookmarks pointing at the primary URL
- Updating Traffic Manager profile (if configured) to route to `salespulse-nyaaa-dr`

DR URL: **https://salespulse-nyaaa-dr.azurewebsites.net**

### Step 7 — Confirm and document

- Note actual recovery time
- Quantify data lag (time of last DR DB refresh)
- Notify stakeholders

---

## Rollback to Primary

Once `fslapp-pg` is confirmed healthy:

### Step 1 — Verify primary DB is healthy

```bash
nc -zv fslapp-pg.postgres.database.azure.com 5432
```

### Step 2 — Assess data divergence

While on DR, any writes (user records, cached data, session data) went to `fslapp-pg-dr`. Export tables that may have diverged:

```bash
# Get Entra token for DR DB access
TOKEN=$(az account get-access-token \
  --resource https://ossrdbms-aad.database.windows.net \
  --query accessToken --output tsv)

pg_dump \
  --host fslapp-pg-dr.postgres.database.azure.com \
  --username "nlaaroubi@nyaaa.com" \
  --dbname fslapp \
  --schema sales \
  --format plain \
  --file /tmp/salespulse_dr_export_$(date +%Y%m%d_%H%M%S).sql
```

Review the export and import any diverged rows into the primary DB before switching back.

### Step 3 — Redirect primary app back to primary DB

```bash
az webapp config appsettings set \
  --name salespulse-nyaaa \
  --resource-group $RG \
  --settings \
    PG_HOST="fslapp-pg.postgres.database.azure.com" \
    PG_USER="salespulse-nyaaa"
```

### Step 4 — Verify primary app is healthy

```bash
curl -sf https://salespulse-nyaaa.azurewebsites.net/api/health | python3 -m json.tool
```

### Step 5 — Stop or idle the DR App Service (optional, to save cost)

```bash
az webapp stop --name $DR_APP --resource-group $RG
```

### Step 6 — Schedule DR DB refresh

The DR DB is now stale relative to primary. Schedule a refresh within 24 hours.

---

## DR DB Refresh Procedure

The DR DB is a static PITR clone — it does not replicate continuously. Refresh periodically (recommended: weekly).

**Time required:** ~15-30 minutes  
**Downtime impact:** None on primary. DR unavailable during refresh (expected).  
**Shared resource:** This DB is shared with FSLAPP. Coordinate the refresh with FSLAPP, as both DR apps will be temporarily disconnected from DR DB during provisioning.

> **Important:** PITR cannot restore in-place. The procedure deletes the old DR server and restores a new one. Entra grants must be re-applied after each refresh.

### Step 1 — Note restore target time

```bash
RESTORE_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Restoring to: $RESTORE_TIME"
```

### Step 2 — Delete the existing DR server

```bash
az postgres flexible-server delete \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --yes
```

Wait 2-5 minutes for deletion.

### Step 3 — Restore a new PITR clone

```bash
az postgres flexible-server restore \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --source-server fslapp-pg \
  --restore-time "$RESTORE_TIME" \
  --location eastus2
```

Monitor:
```bash
watch -n 10 az postgres flexible-server show \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --query "state" --output tsv
```

Wait for state: `Ready`

### Step 4 — Re-apply Entra grants for both apps

```bash
psql "host=fslapp-pg-dr.postgres.database.azure.com \
      dbname=fslapp \
      user=nlaaroubi@nyaaa.com \
      sslmode=require"
```

Run grants for SalesPulse DR app:
```sql
-- SalesPulse DR identity
CREATE ROLE "salespulse-nyaaa-dr" WITH LOGIN;
SECURITY LABEL FOR "pgaadauth" ON ROLE "salespulse-nyaaa-dr" IS 'aadauth';
GRANT USAGE ON SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT USAGE, SELECT ON SEQUENCES TO "salespulse-nyaaa-dr";
```

Also apply FSLAPP DR grants (see `FSLAPP/doc/fslapp/dr/DR_RUNBOOK.md` → Pre-Failover Prerequisites step 3).

### Step 5 — Smoke test

```bash
curl -sf https://salespulse-nyaaa-dr.azurewebsites.net/api/health | python3 -m json.tool
```

Expected: HTTP 200. If DB error appears, re-check grants in Step 4.

---

## Cross-App Coordination

SalesPulse and FSLAPP share `fslapp-pg`. **DB failover and DB refresh affect both apps.**

| Scenario | SalesPulse action | FSLAPP action |
|---|---|---|
| `fslapp-pg` fails | Redirect `salespulse-nyaaa-dr` → `fslapp-pg-dr` | Redirect `fslapp-nyaaa-dr` → `fslapp-pg-dr` |
| `salespulse-nyaaa` fails only | Point users to `salespulse-nyaaa-dr` (DR DB optional) | No action needed |
| DR DB refresh | Verify `salespulse-nyaaa-dr` health after refresh | Verify `fslapp-nyaaa-dr` health after refresh |

See FSLAPP DR runbook: `FSLAPP/doc/fslapp/dr/DR_RUNBOOK.md`

---

## Env Var Checklist for `salespulse-nyaaa-dr`

All env vars listed here must be set in **Azure Portal → salespulse-nyaaa-dr → Configuration → Application settings**.

> **Note:** SalesPulse uses `PG_HOST`, `PG_DATABASE`, `PG_SCHEMA`, `PG_USER` (no `FSLAPP_` prefix). These are defined in `backend/data/connection.py`.

| Variable | Required Value for DR | Notes |
|---|---|---|
| `PG_HOST` | `fslapp-pg-dr.postgres.database.azure.com` | Points at DR DB |
| `PG_DATABASE` | `fslapp` | Same DB name as primary |
| `PG_SCHEMA` | `sales` | SalesPulse schema only |
| `PG_USER` | `salespulse-nyaaa-dr` | DR app's own managed identity name |
| `PG_PORT` | `5432` | Default; can be omitted |
| `SF_TOKEN_URL` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_CONSUMER_KEY` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_CONSUMER_SECRET` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_USERNAME` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_PASSWORD` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_SECURITY_TOKEN` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `SF_INSTANCE_URL` | Same as primary | Copy from `salespulse-nyaaa` settings |
| `OPENAI_API_KEY` | Same as primary | Required for AI narratives |
| `AI_MODEL` | Same as primary | e.g. `gpt-4.1-mini` |
| `JWT_SECRET` | Same as primary | Must match so existing sessions are valid |
| `ADMIN_PIN` | Same as primary (or unique DR PIN) | Required for emergency lockout reset |
| `AGENTMAIL_API_KEY` | Same as primary | Required for email features |
| `AGENTMAIL_INBOX` | Same as primary | Required for email features |

> **Copy all env vars from primary in one command:**
> ```bash
> # Export primary settings
> az webapp config appsettings list \
>   --name salespulse-nyaaa \
>   --resource-group rg-nlaaroubi-sbx-eus2-001 \
>   --output json > /tmp/salespulse_primary_settings.json
>
> # Apply to DR:
> az webapp config appsettings set \
>   --name salespulse-nyaaa-dr \
>   --resource-group rg-nlaaroubi-sbx-eus2-001 \
>   --settings @/tmp/salespulse_primary_settings.json
>
> # Override the DB-specific vars to point at DR:
> az webapp config appsettings set \
>   --name salespulse-nyaaa-dr \
>   --resource-group rg-nlaaroubi-sbx-eus2-001 \
>   --settings \
>     PG_HOST="fslapp-pg-dr.postgres.database.azure.com" \
>     PG_USER="salespulse-nyaaa-dr"
> ```

---

## Quick Reference

| Situation | First command |
|---|---|
| Check DR app status | `az webapp show --name salespulse-nyaaa-dr --resource-group rg-nlaaroubi-sbx-eus2-001 --query state -o tsv` |
| Start DR app | `az webapp start --name salespulse-nyaaa-dr --resource-group rg-nlaaroubi-sbx-eus2-001` |
| Failover DB (key step) | `az webapp config appsettings set --name salespulse-nyaaa-dr ... PG_HOST=fslapp-pg-dr...` |
| Tail app logs | `az webapp log tail --name salespulse-nyaaa-dr --resource-group rg-nlaaroubi-sbx-eus2-001` |
| Refresh DR DB | Delete `fslapp-pg-dr`, then `az postgres flexible-server restore --source-server fslapp-pg` |
| Roll back to primary | Set `PG_HOST=fslapp-pg.postgres.database.azure.com` on `salespulse-nyaaa` |
| Emergency admin reset | `POST /api/admin/reset-admin` with `ADMIN_PIN` — see `docs/admin-runbook.md` |
