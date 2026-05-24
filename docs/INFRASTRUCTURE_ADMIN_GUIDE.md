# SalesPulse — Infrastructure Admin Guide

**Audience:** Infrastructure / IT administrator responsible for monitoring, deploying, maintaining, and failing over the SalesPulse application.  
**Application:** SalesPulse — AAA WCNY sales analytics platform  
**Last updated:** 2026-05-24  
**Primary contact:** nlaaroubi@nyaaa.com

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Resource Inventory](#2-resource-inventory)
3. [Azure Portal Quick Links](#3-azure-portal-quick-links)
4. [Application Monitoring](#4-application-monitoring)
5. [Routine Maintenance](#5-routine-maintenance)
6. [Deployment](#6-deployment)
7. [DR Failover Procedure](#7-dr-failover-procedure)
8. [DR Database Refresh](#8-dr-database-refresh)
9. [Troubleshooting](#9-troubleshooting)
10. [User Management](#10-user-management)
11. [Emergency Contacts](#11-emergency-contacts)

---

## 1. Architecture Overview

### System Diagram

```mermaid
graph TB
    subgraph CI ["CI/CD"]
        GH["GitHub\nnlaarh/SalesPulse\nbranch: main"]
        GHA["GitHub Actions\ndeploy.yml\n(Kudu ZIP Deploy)"]
    end

    subgraph Primary ["PRIMARY — Active"]
        APP["salespulse-nyaaa\nApp Service · Basic B2\nPython 3.12 · West US 2\nhttps://salespulse-nyaaa.azurewebsites.net"]
    end

    subgraph DR_App ["DR — Standby (idle until failover)"]
        DRAPP["salespulse-nyaaa-dr\nApp Service · P1v3 Premium\nPython 3.12 · West US 2\nhttps://salespulse-nyaaa-dr.azurewebsites.net"]
    end

    subgraph DB_Primary ["DATABASE — Primary  (East US 2)"]
        PG["fslapp-pg\nPostgreSQL 16 Flexible Server\nBurstable B2s · 64 GiB\nSchema: sales  ← SalesPulse ONLY"]
        FSL["FSLPulse (co-tenant)\nSchemas: core · optimizer\naccounting · ops"]
    end

    subgraph DB_DR ["DATABASE — DR  (East US 2)"]
        PGDR["fslapp-pg-dr\nPostgreSQL 16 Flexible Server\nBurstable B2s · 64 GiB\nPITR clone — NOT a live replica"]
    end

    subgraph External ["External Services"]
        SF["Salesforce\naaawcny.my.salesforce.com\n(live sales data)"]
        PBI["Power BI\napi.powerbi.com\n(embedded reports)"]
        OAI["OpenAI\nplatform.openai.com\n(AI narratives)"]
        GHE["GitHub API\ngithub.com\n(repo status)"]
    end

    GH -->|push to main| GHA
    GHA -->|Kudu ZIP deploy| APP
    APP -->|PG_HOST| PG
    DRAPP -->|PG_HOST\n(during failover)| PGDR
    PG -.->|PITR restore\n(periodic, manual)| PGDR
    FSL --- PG

    APP --> SF
    APP --> PBI
    APP --> OAI
    APP --> GHE

    style Primary fill:#d4edda,stroke:#28a745
    style DR_App fill:#fff3cd,stroke:#ffc107
    style DB_Primary fill:#d4edda,stroke:#28a745
    style DB_DR fill:#fff3cd,stroke:#ffc107
    style External fill:#e2e3e5,stroke:#6c757d
```

### Key Architectural Facts

**Co-tenancy — critical for failover planning:**  
SalesPulse and FSLPulse share the same PostgreSQL server (`fslapp-pg`). SalesPulse exclusively uses the `sales` schema. FSLPulse uses `core`, `optimizer`, `accounting`, and `ops`. If the database fails, **both applications must be failed over simultaneously**. A partial failover leaves one app writing to a dead DB.

**DR is a PITR clone, not a streaming replica:**  
`fslapp-pg-dr` is an independent server created via Azure Point-in-Time Restore. There is no continuous replication between primary and DR. Data lag equals the elapsed time since the last refresh. The DR DB should be refreshed weekly.

**Authentication uses Azure Entra managed identity — no passwords in connection strings:**  
Each App Service has a system-assigned managed identity. That identity is granted PostgreSQL access as an Entra user. After every DR DB refresh, the Entra grants must be re-applied because PITR does not carry forward manually-created Entra role bindings.

**DR App Service is one tier above primary:**  
The DR App Service (`salespulse-nyaaa-dr`) runs on P1v3 Premium (vs. Basic B2 on primary). This is intentional headroom for handling production load during a failover event.

---

## 2. Resource Inventory

| Resource | Type | Region | Tier / SKU | URL / Hostname | Purpose |
|---|---|---|---|---|---|
| `salespulse-nyaaa` | App Service | West US 2 | Basic B2 · 2 vCPU · 3.5 GB | https://salespulse-nyaaa.azurewebsites.net | Primary application |
| `salespulse-nyaaa-dr` | App Service | West US 2 | P1v3 Premium · 2 vCPU · 8 GB | https://salespulse-nyaaa-dr.azurewebsites.net | DR standby application |
| `AASPPLAN` | App Service Plan | West US 2 | Basic B2 | — | Hosts `salespulse-nyaaa` |
| `asp-fslapp-dr` | App Service Plan | West US 2 | P1v3 PremiumV3 | — | Hosts `salespulse-nyaaa-dr` and `fslapp-nyaaa-dr` (shared plan) |
| `fslapp-pg` | PostgreSQL Flexible Server | East US 2 | PG 16 · Burstable B2s · 64 GiB | fslapp-pg.postgres.database.azure.com | Primary DB (shared with FSLPulse) |
| `fslapp-pg-dr` | PostgreSQL Flexible Server | East US 2 | PG 16 · Burstable B2s · 64 GiB | fslapp-pg-dr.postgres.database.azure.com | DR DB clone (shared with FSLPulse DR) |
| `nlaarh/SalesPulse` | GitHub Repository | — | — | https://github.com/nlaarh/SalesPulse | Source code + CI/CD |
| `rg-nlaaroubi-sbx-eus2-001` | Resource Group | East US 2 | — | See Section 3 | Contains all Azure resources |

**Subscription ID:** `e287db16-b6ae-415e-bd52-41c8ec5a8f08`  
**Tenant:** `@nyaaa.com`  
**Runtime:** Python 3.12, FastAPI, Gunicorn  
**Database:** PostgreSQL 16, `fslapp` database, `sales` schema  
**DB auth:** Azure Entra managed identity (zero-password)  
**Primary app role:** `salespulse-nyaaa`  
**DR app role:** `salespulse-nyaaa-dr`

---

## 3. Azure Portal Quick Links

Bookmark all of these. Every link uses `@nyaaa.com` tenant authentication.

| Resource | Direct Portal Link |
|---|---|
| **Primary App Service overview** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/appServices |
| **Primary App Service — env vars** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/environmentVariablesAppSettings |
| **DR App Service overview** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa-dr/appServices |
| **DR App Service — env vars** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa-dr/environmentVariablesAppSettings |
| **PostgreSQL Primary** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.DBforPostgreSQL/flexibleServers/fslapp-pg/overview |
| **PostgreSQL DR** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.DBforPostgreSQL/flexibleServers/fslapp-pg-dr/overview |
| **Resource Group** | https://portal.azure.com/#@nyaaa.com/resource/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/overview |
| **GitHub Actions** | https://github.com/nlaarh/SalesPulse/actions |
| **GitHub Secrets** | https://github.com/nlaarh/SalesPulse/settings/secrets/actions |
| **Salesforce org** | https://aaawcny.lightning.force.com |
| **Power BI portal** | https://app.powerbi.com |
| **OpenAI usage** | https://platform.openai.com/usage |

---

## 4. Application Monitoring

### Health Check URL

**Quick ping (no login required):**
```
GET https://salespulse-nyaaa.azurewebsites.net/api/health
```
Returns HTTP 200 when the app is running. Used by GitHub Actions after each deploy.

**Full system health (admin login required):**
```
GET https://salespulse-nyaaa.azurewebsites.net/api/admin/system/health
```
Returns a JSON document with status for every service.

### Admin System Health Panel

1. Open https://salespulse-nyaaa.azurewebsites.net in a browser
2. Log in as Manager or Superadmin
3. Click **Settings** (gear icon, top right)
4. Click the **System Health** tab

The panel shows live status for every service with color-coded indicators:

| Indicator Name | What It Monitors | Status Means |
|---|---|---|
| **SALESFORCE** | Salesforce OAuth credentials are configured (`SF_TOKEN_URL`, `SF_CONSUMER_KEY`, `SF_CONSUMER_SECRET`, `SF_USERNAME`, `SF_PASSWORD`) | **Online** = all credentials present. **Degraded** = partial config. **Offline** = no credentials found. Does NOT do a live API call unless you click "Ping" |
| **DATABASE** | Live connectivity to `fslapp-pg` (primary PostgreSQL). Runs `SELECT 1` and reports latency. | **Online** = DB responds. **Offline** = cannot connect — critical, app cannot function |
| **DR DATABASE** | Connectivity to `fslapp-pg-dr` (DR PostgreSQL) using the DR managed identity. | **Online** = DR DB is reachable. **Offline** = DR not reachable (expected if DR DB was just refreshed and Entra grants haven't been re-applied). **Degraded** = `PG_DR_HOST` env var is missing |
| **API NODE** | FastAPI process heartbeat. Always **Online** if the health endpoint responds. Reports PID, Python version, and uptime. | **Online** = app process is alive |
| **POWER BI** | Power BI credentials configured (`POWERBI_TENANT_ID`, `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET`) | **Online** = all three present. **Degraded** / **Offline** = missing credentials. Click "Ping" to do live OAuth test |
| **AZURE** | App Service hostname resolves and port 443 is reachable | **Online** = self-connectivity verified |
| **OPENAI** | OpenAI API key is configured (`OPENAI_API_KEY`) | **Online** = key present. **Offline** = key missing. Click "Ping" to do live model-list call |
| **GITHUB** | GitHub repository is configured (`GITHUB_REPO`) | **Online** = repo setting present. Click "Ping" to do live GitHub API check |

**Live Ping feature:** Each service card has a "Ping" button that performs a real external API call and caches the result for 5 minutes. Use sparingly — it consumes external API quota.

### Monitoring via CLI

Check app is up:
```bash
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa.azurewebsites.net/api/health
```
Expected: `200`

Stream live application logs:
```bash
az webapp log tail \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001
```

Check app service state:
```bash
az webapp show \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "{state:state, defaultHostName:defaultHostName}" \
  --output table
```

---

## 5. Routine Maintenance

All secrets live in **Azure App Service → Configuration → Application Settings**. Changes take effect within ~30 seconds — the app restarts automatically. No code deployment required.

**Shell variables used throughout this section:**
```bash
RG="rg-nlaaroubi-sbx-eus2-001"
APP="salespulse-nyaaa"
SUB="e287db16-b6ae-415e-bd52-41c8ec5a8f08"
```

---

### 5.1 Updating Salesforce Tokens

Salesforce credentials must be updated whenever the SF integration user's password is changed. **The security token regenerates automatically when the password changes** — always update both together.

**When to do this:** SF OAuth fails (Salesforce card shows Offline/Degraded) or when the SF integration user password is reset.

**Via Portal:**
1. Open [Primary App Service — Env Vars](#3-azure-portal-quick-links)
2. Click the pencil icon next to `SF_PASSWORD` → paste new value → OK
3. Click the pencil icon next to `SF_SECURITY_TOKEN` → paste new token → OK
4. Click **Save** at the top → confirm the restart prompt
5. Wait ~30 seconds → verify SALESFORCE shows **Online** in the System Health panel

**Via CLI:**
```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings \
    SF_PASSWORD="<new_password>" \
    SF_SECURITY_TOKEN="<new_security_token>"
```

If the Connected App credentials change (client ID / secret):
```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings \
    SF_CONSUMER_KEY="<new_consumer_key>" \
    SF_CONSUMER_SECRET="<new_consumer_secret>"
```

**Verify:** In System Health panel, click **Ping** on the SALESFORCE card. Should show `SF LIVE AUTH — Obtained token` in the log output.

---

### 5.2 Rotating Power BI Credentials

Power BI uses a service principal (client credentials grant). Rotate when the service principal secret expires or is revoked in Azure Entra.

**Via Portal:**
1. Open [Primary App Service — Env Vars](#3-azure-portal-quick-links)
2. Update `POWERBI_CLIENT_SECRET` → OK
3. If the service principal itself changed, also update `POWERBI_TENANT_ID` and `POWERBI_CLIENT_ID`
4. **Save** → wait ~30 seconds

**Via CLI:**
```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings \
    POWERBI_TENANT_ID="<tenant_id>" \
    POWERBI_CLIENT_ID="<client_id>" \
    POWERBI_CLIENT_SECRET="<client_secret>"
```

**Verify:** In System Health panel, click **Ping** on the POWER BI card. Should show `PBI LIVE AUTH — Microsoft OAuth client credentials token generated`.

---

### 5.3 Rotating JWT_SECRET

> **WARNING: Rotating `JWT_SECRET` immediately invalidates all active user sessions.** Every logged-in user will be logged out and must re-authenticate. Perform this only during off-hours or during a declared security incident.

`JWT_SECRET` is the signing key for all login tokens. Rotate only if it has been compromised.

**Via Portal:**
1. Generate a new secret: `openssl rand -base64 48` (run locally)
2. Open [Primary App Service — Env Vars](#3-azure-portal-quick-links)
3. Update `JWT_SECRET` → paste the new value → OK
4. **Save** → the app restarts, all existing sessions are invalidated

**Via CLI:**
```bash
NEW_SECRET=$(openssl rand -base64 48)

az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings JWT_SECRET="$NEW_SECRET"
```

**After rotation:** All users must log in again. Notify users before rotating if possible.

**If rotating on DR as well** (to keep sessions working on failover):
```bash
az webapp config appsettings set \
  --name salespulse-nyaaa-dr \
  --resource-group $RG \
  --settings JWT_SECRET="$NEW_SECRET"
```

---

### 5.4 Updating OPENAI_API_KEY

**When to do this:** AI narrative features stop working, OpenAI billing account changes, or key is compromised.

**Via Portal:**
1. Open [Primary App Service — Env Vars](#3-azure-portal-quick-links)
2. Update `OPENAI_API_KEY` → OK
3. Optionally update `AI_MODEL` if changing the model (e.g. `gpt-4.1-mini`)
4. **Save** → wait ~30 seconds

**Via CLI:**
```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings \
    OPENAI_API_KEY="<new_key>" \
    AI_MODEL="gpt-4.1-mini"
```

**Verify:** In System Health panel, click **Ping** on the OPENAI SERVICE card. Should show `OPENAI LIVE AUTH — API key is active`.

---

### 5.5 Updating GITHUB_TOKEN

**When to do this:** GitHub token expires or is revoked.

**Via CLI:**
```bash
az webapp config appsettings set \
  --name $APP \
  --resource-group $RG \
  --settings GITHUB_TOKEN="<new_token>"
```

> **Note:** `GITHUB_TOKEN` enables the System Health GitHub live-ping feature and internal CI status checks. It is separate from `AZURE_DEPLOY_USER` / `AZURE_DEPLOY_PASS`, which are GitHub Action secrets (stored in GitHub, not Azure). To refresh deploy credentials, see [Section 6.3](#63-refreshing-deployment-credentials).

---

### 5.6 Restarting the App

Restart without a deployment (picks up no code change, only config changes already saved):
```bash
az webapp restart \
  --name $APP \
  --resource-group $RG
```

Wait ~30 seconds after restart before verifying:
```bash
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa.azurewebsites.net/api/health
```

---

### 5.7 Scaling the App Service Plan

Scale up or down without redeploying:
```bash
az appservice plan update \
  --name AASPPLAN \
  --resource-group $RG \
  --sku B2
```

**Available tiers (AASPPLAN):**

| SKU | vCPU | RAM | Approx cost/mo |
|---|---|---|---|
| F1 | 1 | 1 GB | Free (limited) |
| B1 | 1 | 1.75 GB | ~$13 |
| B2 | 2 | 3.5 GB | ~$26 (current) |
| B3 | 4 | 7 GB | ~$52 |
| S1 | 1 | 1.75 GB | ~$69 (+ autoscale) |

---

## 6. Deployment

### 6.1 How Primary Deployment Works (Automatic)

Every push to the `main` branch of `nlaarh/SalesPulse` triggers the GitHub Actions workflow `.github/workflows/deploy.yml`.

**Pipeline steps:**
1. Checkout code
2. Install Node.js 22, run `npm ci` + `npm run build` (React frontend)
3. Copy `frontend/dist/` → `backend/static/`
4. Create `deploy.zip` (Python source + built frontend + requirements)
5. POST to `https://salespulse-nyaaa.scm.azurewebsites.net/api/zipdeploy` using Kudu basic auth
6. Wait 180 seconds for Oryx to build Python dependencies and restart
7. Verify `GET /api/health` returns HTTP 200, 401, or 302

**Deployment completes in ~3-4 minutes.** Cache warming runs in the background after startup (territory map + market pulse are pre-fetched at 3 AM ET daily).

**Watch a deployment:**
- https://github.com/nlaarh/SalesPulse/actions

### 6.2 Manual Deployment to Primary (Backup Method)

Use this if GitHub Actions is unavailable:

```bash
# From the repo root:
cd frontend && npm ci && npm run build && cd ..
rm -rf backend/static && cp -r frontend/dist backend/static

cd backend
zip -r ../deploy.zip \
  *.py *.json routers/ data/ seed_data/ \
  gunicorn_conf.py requirements.txt static/ \
  -x "*/__pycache__/*" "*.pyc"
cd ..

az webapp deploy \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --name salespulse-nyaaa \
  --src-path deploy.zip \
  --type zip
```

Wait ~3 minutes, then verify:
```bash
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa.azurewebsites.net/api/health
```

### 6.3 Refreshing Deployment Credentials

If GitHub Actions deploys fail with HTTP 401:

**Step 1 — Verify SCM basic auth is enabled:**
```bash
az rest --method GET \
  --url "https://management.azure.com/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/basicPublishingCredentialsPolicies/scm?api-version=2023-01-01"
```

If `"allow": false`, enable it:
```bash
az rest --method PUT \
  --url "https://management.azure.com/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/basicPublishingCredentialsPolicies/scm?api-version=2023-01-01" \
  --body '{"properties":{"allow":true}}'
```

**Step 2 — Refresh and re-upload credentials** (run in your own terminal, not Claude Code):
```bash
az webapp deployment list-publishing-profiles \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --name salespulse-nyaaa \
  --xml | python3 -c "
import sys, xml.etree.ElementTree as ET, subprocess, urllib.request, base64
root = ET.fromstring(sys.stdin.read())
for p in root.findall('.//publishProfile'):
    if p.get('publishMethod') == 'ZipDeploy':
        user = p.get('userName')
        pwd = p.get('userPWD')
        creds = base64.b64encode(f'{user}:{pwd}'.encode()).decode()
        req = urllib.request.Request(
            'https://salespulse-nyaaa.scm.azurewebsites.net/api/settings',
            headers={'Authorization': f'Basic {creds}'}
        )
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            print(f'Auth test PASSED (HTTP {resp.status})')
            subprocess.run(['gh','secret','set','AZURE_DEPLOY_USER',
                '--repo','nlaarh/SalesPulse','--body',user], check=True)
            subprocess.run(['gh','secret','set','AZURE_DEPLOY_PASS',
                '--repo','nlaarh/SalesPulse','--body',pwd], check=True)
            print('Both secrets updated in GitHub!')
        except Exception as e:
            print(f'Auth test FAILED: {e}')
        break
"
```

### 6.4 Deploying to DR (Manual ZIP Deploy)

The DR App Service receives no automatic deployments. Deploy manually from the same codebase:

```bash
# Build package (same as primary):
cd frontend && npm ci && npm run build && cd ..
rm -rf backend/static && cp -r frontend/dist backend/static

cd backend
zip -r ../deploy.zip \
  *.py *.json routers/ data/ seed_data/ \
  gunicorn_conf.py requirements.txt static/ \
  -x "*/__pycache__/*" "*.pyc"
cd ..

# Deploy to DR:
az webapp deploy \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --name salespulse-nyaaa-dr \
  --src-path deploy.zip \
  --type zip
```

Verify:
```bash
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa-dr.azurewebsites.net/api/health
```

**Best practice:** Deploy to DR after every production deploy to keep code in sync.

### 6.5 Verifying a Deployment Succeeded

```bash
# 1. HTTP check
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa.azurewebsites.net/api/health
# Expected: 200

# 2. Check app logs for startup messages
az webapp log tail \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001

# Look for:
#   "CACHE_VERSION changed..." or "Restart (CACHE_VERSION=...): keeping existing cache"
#   "Application startup complete."
```

---

## 7. DR Failover Procedure

> **CRITICAL:** SalesPulse and FSLPulse share the same PostgreSQL server (`fslapp-pg`). If the database is the cause of the incident, **both applications must failover simultaneously.** Failing over only one leaves the other writing to a dead database and causes data corruption risk. Always coordinate with the FSLPulse administrator.

**RTO target:** ~15 minutes  
**RPO target:** ~5 minutes (Azure PITR granularity, lag depends on last DR DB refresh)

**Trigger:** Primary App Service (`salespulse-nyaaa`) or primary DB (`fslapp-pg`) is unavailable or critically degraded with no immediate recovery path.

---

### Step 0 — Set Shell Variables

```bash
SUB="e287db16-b6ae-415e-bd52-41c8ec5a8f08"
RG="rg-nlaaroubi-sbx-eus2-001"
DR_APP="salespulse-nyaaa-dr"
DR_DB_HOST="fslapp-pg-dr.postgres.database.azure.com"
```

### Step 1 — Coordinate with FSLPulse Admin

Contact **nlaaroubi@nyaaa.com** immediately.

Determine the failure scope:
- **App Service only (`salespulse-nyaaa` is down, DB is up):** Proceed independently. No FSLPulse coordination required.
- **DB is down (`fslapp-pg` is unreachable):** FSLPulse must also failover. Both apps redirect to DR DB simultaneously. Do not failover the DB without FSLPulse team.

### Step 2 — Verify the DR DB Is Current

Check when the DR DB was last refreshed:
```bash
az postgres flexible-server show \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --query "{state:state, createTime:createTime, location:location}" \
  --output table
```

`createTime` reflects the last PITR restore time. Note the data lag and include it in your incident report.

### Step 3 — Start the DR App Service

```bash
az webapp start --name $DR_APP --resource-group $RG
```

Wait ~30 seconds for the app to boot.

### Step 4 — Verify DR App Has a Managed Identity

```bash
az webapp identity show \
  --name $DR_APP \
  --resource-group $RG \
  --query "principalId" --output tsv
```

Expected: a non-empty GUID. If empty, assign one:
```bash
az webapp identity assign \
  --name $DR_APP \
  --resource-group $RG
```

### Step 5 — Point DR App at DR Database

SalesPulse uses `PG_HOST`, `PG_DATABASE`, `PG_SCHEMA`, and `PG_USER` (no `FSLAPP_` prefix):

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

The app restarts automatically. Wait ~30 seconds.

### Step 6 — Verify DR App Is Healthy

```bash
# HTTP smoke test
curl -sf https://salespulse-nyaaa-dr.azurewebsites.net/api/health | python3 -m json.tool

# Login page loads
curl -sf -o /dev/null -w "%{http_code}" \
  https://salespulse-nyaaa-dr.azurewebsites.net
```

Expected: HTTP 200. If HTTP 500, check logs:
```bash
az webapp log tail --name $DR_APP --resource-group $RG
```

A DATABASE OFFLINE error typically means the Entra grants were not applied after the last DR DB refresh. See [Section 7a](#7a-if-dr-database-shows-offline-during-failover).

### Step 7 — Communicate DR URL to Users

The DR URL is: **https://salespulse-nyaaa-dr.azurewebsites.net**

- Post the DR URL to internal communication channels
- Update any DNS CNAME or bookmarks pointing at the primary URL
- Update Traffic Manager profile if configured

### Step 8 — Document the Incident

Note:
- Time of failure detection
- Time of DR activation
- Data lag (time since last DR DB refresh)
- Stakeholders notified

---

### 7a. If DR Database Shows Offline During Failover

If the DR App Service returns database errors, the Entra managed identity grants are missing. Connect to the DR DB and re-apply:

```bash
# Get an Entra access token
TOKEN=$(az account get-access-token \
  --resource https://ossrdbms-aad.database.windows.net \
  --query accessToken --output tsv)

# Connect to DR DB
psql "host=fslapp-pg-dr.postgres.database.azure.com \
      dbname=fslapp \
      user=nlaaroubi@nyaaa.com \
      password=$TOKEN \
      sslmode=require"
```

Run the following SQL:
```sql
-- Re-create the SalesPulse DR managed identity and grant schema access
CREATE ROLE "salespulse-nyaaa-dr" WITH LOGIN;
SECURITY LABEL FOR "pgaadauth" ON ROLE "salespulse-nyaaa-dr" IS 'aadauth';
GRANT USAGE ON SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
    GRANT USAGE, SELECT ON SEQUENCES TO "salespulse-nyaaa-dr";
```

After running the grants, restart the DR app:
```bash
az webapp restart --name $DR_APP --resource-group $RG
```

---

### 7b. Rollback to Primary

Once `fslapp-pg` (primary DB) is confirmed healthy:

**Step 1 — Verify primary DB is reachable:**
```bash
nc -zv fslapp-pg.postgres.database.azure.com 5432
```

**Step 2 — Assess data divergence:**

While on DR, writes (new user records, sessions, cache data) went to `fslapp-pg-dr`. Export the `sales` schema to check for divergence:
```bash
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

**Step 3 — Redirect primary app to primary DB:**
```bash
az webapp config appsettings set \
  --name salespulse-nyaaa \
  --resource-group $RG \
  --settings \
    PG_HOST="fslapp-pg.postgres.database.azure.com" \
    PG_USER="salespulse-nyaaa"
```

**Step 4 — Verify primary app is healthy:**
```bash
curl -sf https://salespulse-nyaaa.azurewebsites.net/api/health | python3 -m json.tool
```

**Step 5 — Stop or idle the DR App Service (optional, to reduce cost):**
```bash
az webapp stop --name salespulse-nyaaa-dr --resource-group $RG
```

**Step 6 — Schedule a DR DB refresh within 24 hours.**  
The DR DB is now stale relative to primary. See Section 8.

---

## 8. DR Database Refresh

The DR DB is a static PITR clone. It does not replicate continuously. Refresh it weekly to keep data lag acceptable.

**Time required:** 15–30 minutes  
**Impact on primary:** None — primary app continues serving normally  
**Impact on DR:** DR app is unavailable during the refresh (expected and acceptable in standby mode)  
**Shared resource:** This DB is shared with FSLPulse. The refresh affects FSLPulse DR as well. Coordinate with FSLPulse admin (nlaaroubi@nyaaa.com) before proceeding.

> **Important:** Azure PITR cannot restore in-place. The procedure deletes the existing DR server and creates a new one from a point-in-time snapshot of the primary. After restore, all Entra managed-identity role bindings are gone and must be re-created manually.

---

### Step 1 — Set Variables

```bash
RG="rg-nlaaroubi-sbx-eus2-001"
RESTORE_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Restoring to point in time: $RESTORE_TIME"
```

### Step 2 — Stop DR App Services (to avoid errors during DB recreation)

```bash
az webapp stop --name salespulse-nyaaa-dr --resource-group $RG

# Also stop FSLPulse DR if it is running:
# az webapp stop --name fslapp-nyaaa-dr --resource-group $RG
```

### Step 3 — Delete the Existing DR Database Server

```bash
az postgres flexible-server delete \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --yes
```

Wait 2–5 minutes. Confirm deletion:
```bash
az postgres flexible-server show \
  --name fslapp-pg-dr \
  --resource-group $RG 2>&1 | grep -i "not found\|error\|ResourceNotFound"
```

### Step 4 — Restore a New PITR Clone from Primary

```bash
az postgres flexible-server restore \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --source-server fslapp-pg \
  --restore-time "$RESTORE_TIME" \
  --location eastus2
```

Monitor provisioning status (runs every 10 seconds):
```bash
watch -n 10 az postgres flexible-server show \
  --name fslapp-pg-dr \
  --resource-group $RG \
  --query "state" --output tsv
```

Wait for state: `Ready`. This typically takes 15–25 minutes.

### Step 5 — Re-Apply Entra Grants

PITR does not carry forward manually-created Entra role bindings. Re-apply for both apps.

Connect to the newly-restored DR DB:
```bash
TOKEN=$(az account get-access-token \
  --resource https://ossrdbms-aad.database.windows.net \
  --query accessToken --output tsv)

psql "host=fslapp-pg-dr.postgres.database.azure.com \
      dbname=fslapp \
      user=nlaaroubi@nyaaa.com \
      password=$TOKEN \
      sslmode=require"
```

Run grants for SalesPulse DR:
```sql
-- SalesPulse DR managed identity
CREATE ROLE "salespulse-nyaaa-dr" WITH LOGIN;
SECURITY LABEL FOR "pgaadauth" ON ROLE "salespulse-nyaaa-dr" IS 'aadauth';
GRANT USAGE ON SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sales TO "salespulse-nyaaa-dr";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "salespulse-nyaaa-dr";
ALTER DEFAULT PRIVILEGES IN SCHEMA sales
    GRANT USAGE, SELECT ON SEQUENCES TO "salespulse-nyaaa-dr";
```

Also apply FSLPulse DR grants (see `FSLAPP/doc/fslapp/dr/DR_RUNBOOK.md → Pre-Failover Prerequisites step 3`).

### Step 6 — Restart DR App Services

```bash
az webapp start --name salespulse-nyaaa-dr --resource-group $RG
```

### Step 7 — Smoke Test

```bash
curl -sf https://salespulse-nyaaa-dr.azurewebsites.net/api/health | python3 -m json.tool
```

Expected: HTTP 200 with all services online. If DATABASE OFFLINE appears, re-check the grants in Step 5.

Also verify via the System Health panel: log into https://salespulse-nyaaa-dr.azurewebsites.net as Superadmin → Settings → System Health. Both DATABASE and DR DATABASE should show **Online**.

### Step 8 — Record Completion

Log the refresh date and time. This is the new data lag baseline for the next failover.

---

## 9. Troubleshooting

### App Returns HTTP 503

The App Service is stopped, crashed, or being restarted.

```bash
# Check state
az webapp show \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "state" --output tsv

# Start if stopped
az webapp start \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001

# Tail logs for crash reason
az webapp log tail \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001
```

If the app is in a crash loop, look for Python import errors or missing environment variables in the log output. A missing required env var (e.g., `PG_HOST` not set) will prevent startup.

---

### App Returns HTTP 500

The app started but is failing on requests. Most commonly caused by:
1. Database connectivity lost (check DATABASE in System Health panel)
2. A recent deployment introduced a bug (check GitHub Actions for the last deploy)

```bash
# Tail logs for the error
az webapp log tail \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001

# Roll back to the previous deployment via GitHub (revert the last commit and push)
```

---

### DATABASE Shows Offline in System Health

The app cannot reach `fslapp-pg.postgres.database.azure.com`.

**Check 1 — Is the PostgreSQL server running?**
```bash
az postgres flexible-server show \
  --name fslapp-pg \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "state" --output tsv
```
Expected: `Ready`. If `Stopped`, restart it via the Azure Portal (PostgreSQL overview → Start).

**Check 2 — Is `PG_HOST` set correctly?**
```bash
az webapp config appsettings list \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "[?name=='PG_HOST'].value" --output tsv
```
Expected: `fslapp-pg.postgres.database.azure.com`

**Check 3 — Is the managed identity still granted?**  
If the DB was recreated or restored, re-apply the Entra grants (same SQL as Section 8 Step 5, but for the primary `salespulse-nyaaa` role against `fslapp-pg`).

If the database cannot be recovered, proceed to [Section 7 — DR Failover](#7-dr-failover-procedure).

---

### DR DATABASE Shows Offline (After DR DB Refresh)

This is expected and normal immediately after a DR DB refresh. The Entra grants have not yet been applied to the new server.

Follow [Section 8 Step 5](#step-5--re-apply-entra-grants) to re-apply the grants, then restart the DR App Service.

If DR DATABASE shows offline in normal operation (no recent refresh), it may indicate the DR server was stopped or deleted. Check:
```bash
az postgres flexible-server show \
  --name fslapp-pg-dr \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "state" --output tsv
```

---

### Salesforce Auth Fails

Symptom: SALESFORCE shows Offline in System Health, or data dashboards show empty/stale data.

**Check 1 — Are all SF credentials configured?**
In System Health panel, SALESFORCE card will show which setting is missing.

**Check 2 — Did the SF user's password change recently?**
If yes, both `SF_PASSWORD` and `SF_SECURITY_TOKEN` need updating. See [Section 5.1](#51-updating-salesforce-tokens).

**Check 3 — Did the Connected App change?**
Update `SF_CONSUMER_KEY` and `SF_CONSUMER_SECRET`. See Section 5.1.

**Check 4 — Is the SF org accessible?**  
Verify https://aaawcny.lightning.force.com is reachable and not in maintenance.

---

### Power BI Shows Degraded

Symptom: POWER BI shows Degraded or Offline, embedded reports don't load.

**Check 1 — Are all three PBI settings configured?**
`POWERBI_TENANT_ID`, `POWERBI_CLIENT_ID`, `POWERBI_CLIENT_SECRET` must all be present.

**Check 2 — Has the client secret expired?**
Azure Entra service principal secrets expire. Check the expiry date in [Azure Portal → Entra → App Registrations → the PBI service principal → Certificates & secrets].

If expired, generate a new secret there and update `POWERBI_CLIENT_SECRET` per [Section 5.2](#52-rotating-power-bi-credentials).

**Verify:** Click **Ping** on the POWER BI card in System Health. It runs a live OAuth token request and reports whether it succeeded.

---

### GitHub Actions Deploy Fails (HTTP 401)

SCM basic auth was likely disabled or credentials expired. See [Section 6.3](#63-refreshing-deployment-credentials).

---

### Emergency: All Admins Locked Out of the App

If no superadmin can log in (lost password, locked account), use the PIN-based emergency reset endpoint. No login is required — only the `ADMIN_PIN` from App Settings.

```bash
# Get the ADMIN_PIN from App Settings:
az webapp config appsettings list \
  --name salespulse-nyaaa \
  --resource-group rg-nlaaroubi-sbx-eus2-001 \
  --query "[?name=='ADMIN_PIN'].value" --output tsv

# Reset the superadmin password:
curl -X POST https://salespulse-nyaaa.azurewebsites.net/api/admin/reset-admin \
  -H "Content-Type: application/json" \
  -d '{"pin":"<ADMIN_PIN_VALUE>","new_password":"NewPassword123!"}'
```

The superadmin email is `nlaaroubi@nyaaa.com`. Log in with the new password immediately and update it to something secure.

After using the emergency reset, **rotate `ADMIN_PIN`** to a new value in App Settings.

---

## 10. User Management

User management is done entirely within the application — no Azure access or code deployment required.

**Prerequisites:** You must be logged in as a **Superadmin** or **Admin**.

### Roles

| Role | Access Level |
|---|---|
| `superadmin` | Full access: manage users, reset cache, view all data and settings |
| `admin` | Manage users, access all data, cache admin |
| `officer` | View all dashboards and reports (read only) |
| `travel_manager` | Travel dashboards and reports |
| `travel_director` | Travel dashboards and reports (director-level view) |
| `insurance_manager` | Insurance dashboards and reports |

**Principle:** Assign the least-privileged role that covers the person's job. Only create `superadmin` accounts for people who administer the system.

### Adding a User

1. Log in → **Settings** (gear icon, top right) → **Users** tab
2. Click **Add User**
3. Fill in: Email (unique, company email), Name, Password (min 8 characters), Role
4. Click **Create**

The user can log in immediately.

### Deactivating a User

Deactivation is preferred over deletion — it preserves audit history.

1. Settings → Users → find the user → click **Edit**
2. Toggle **Active** to off → Save

The user cannot log in. Their record is preserved. Re-activate the same way.

### Resetting a User's Password

1. Settings → Users → find the user → click **Edit**
2. Enter a new password in the Password field → Save
3. Share the new password securely with the user (not over email)

### Deleting a User

Use only for test accounts or obvious mistakes. You cannot delete yourself or the last superadmin.

1. Settings → Users → find the user → click **Delete** → confirm

---

## 11. Emergency Contacts

| Name | Email | Role |
|---|---|---|
| Abdennour Laaroubi | nlaaroubi@nyaaa.com | Superadmin, application developer, infrastructure owner |

**For Azure subscription issues:** Contact your Azure Account Manager or open a support ticket at https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade  
**For Salesforce issues:** Contact your Salesforce administrator or AAA WCNY IT department  
**For Power BI issues:** Contact your Power BI workspace administrator or Microsoft support

---

## Quick Reference Card

| Task | Command / Location |
|---|---|
| Check primary app is up | `curl -sf -o /dev/null -w "%{http_code}" https://salespulse-nyaaa.azurewebsites.net/api/health` |
| View system health | App → Settings → System Health |
| Stream live logs | `az webapp log tail --name salespulse-nyaaa --resource-group rg-nlaaroubi-sbx-eus2-001` |
| Restart primary app | `az webapp restart --name salespulse-nyaaa --resource-group rg-nlaaroubi-sbx-eus2-001` |
| Update any secret | Azure Portal → salespulse-nyaaa → Configuration → Application Settings |
| Start DR app | `az webapp start --name salespulse-nyaaa-dr --resource-group rg-nlaaroubi-sbx-eus2-001` |
| Failover DB (key step) | `az webapp config appsettings set --name salespulse-nyaaa-dr ... PG_HOST=fslapp-pg-dr...` |
| Emergency admin reset | `POST /api/admin/reset-admin` with ADMIN_PIN |
| Add user | App → Settings → Users → Add User |
| Deactivate user | App → Settings → Users → Edit → Active off |
| Refresh DR DB | Delete `fslapp-pg-dr`, then `az postgres flexible-server restore --source-server fslapp-pg` |
| Manual deploy to primary | `az webapp deploy --resource-group rg-nlaaroubi-sbx-eus2-001 --name salespulse-nyaaa --src-path deploy.zip --type zip` |
| Scale app service plan | `az appservice plan update --name AASPPLAN --resource-group rg-nlaaroubi-sbx-eus2-001 --sku <SKU>` |
