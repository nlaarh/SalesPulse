# SalesPulse Deployment Runbook

## How Deployment Works
- Push to `main` triggers GitHub Actions workflow
- Workflow builds React frontend, bundles with Python backend, creates deploy.zip
- Deploys via Kudu ZIP Deploy to Azure App Service `salespulse-nyaaa`
- After deploy, Oryx builds Python dependencies and restarts the app
- App pre-warms caches (territory map + market pulse) on startup

## Production Environment
- App Service: `salespulse-nyaaa`
- Resource Group: `rg-nlaaroubi-sbx-eus2-001`
- Plan: `AASPPLAN` (B2 — 2 cores, 3.5GB RAM, ~$26/mo)
- URL: https://salespulse-nyaaa.azurewebsites.net
- Region: West US 2

## GitHub Secrets Required
- `AZURE_DEPLOY_USER` — Kudu/SCM publishing username
- `AZURE_DEPLOY_PASS` — Kudu/SCM publishing password

## Manual Deploy (Backup Method)
If GitHub Actions fails, deploy directly from local machine:
```bash
cd frontend && npm run build && cd ..
rm -rf backend/static && cp -r frontend/dist backend/static
cd backend && zip -r ../deploy.zip *.py *.json routers/ gunicorn_conf.py requirements.txt static/
az webapp deploy --resource-group rg-nlaaroubi-sbx-eus2-001 --name salespulse-nyaaa --src-path ../deploy.zip --type zip
```

## Refreshing Deploy Credentials
If deploys fail with HTTP 401:

1. Check SCM basic auth is enabled:
```bash
az rest --method GET --url "https://management.azure.com/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/basicPublishingCredentialsPolicies/scm?api-version=2023-01-01"
```
If `"allow": false`, enable it:
```bash
az rest --method PUT --url "https://management.azure.com/subscriptions/e287db16-b6ae-415e-bd52-41c8ec5a8f08/resourceGroups/rg-nlaaroubi-sbx-eus2-001/providers/Microsoft.Web/sites/salespulse-nyaaa/basicPublishingCredentialsPolicies/scm?api-version=2023-01-01" --body '{"properties":{"allow":true}}'
```

2. Reset and set fresh credentials (run in YOUR terminal, not Claude Code):
```bash
az webapp deployment list-publishing-profiles --resource-group rg-nlaaroubi-sbx-eus2-001 --name salespulse-nyaaa --xml | python3 -c "
import sys, xml.etree.ElementTree as ET, subprocess, urllib.request, base64
root = ET.fromstring(sys.stdin.read())
for p in root.findall('.//publishProfile'):
    if p.get('publishMethod') == 'ZipDeploy':
        user = p.get('userName')
        pwd = p.get('userPWD')
        creds = base64.b64encode(f'{user}:{pwd}'.encode()).decode()
        req = urllib.request.Request('https://salespulse-nyaaa.scm.azurewebsites.net/api/settings', headers={'Authorization': f'Basic {creds}'})
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            print(f'Auth test PASSED (HTTP {resp.status})')
            subprocess.run(['gh','secret','set','AZURE_DEPLOY_USER','--repo','nlaarh/SalesPulse','--body',user], check=True)
            subprocess.run(['gh','secret','set','AZURE_DEPLOY_PASS','--repo','nlaarh/SalesPulse','--body',pwd], check=True)
            print('Both secrets set!')
        except Exception as e:
            print(f'Auth test FAILED: {e}')
        break
"
```

## Scaling
Scale without redeploying:
```bash
az appservice plan update --name AASPPLAN --resource-group rg-nlaaroubi-sbx-eus2-001 --sku B2
```
Tiers: F1 (free), B1 ($13/mo), B2 ($26/mo), B3 ($52/mo), S1 ($69/mo)

## Mistakes Made & Lessons Learned (April 2026)

### 1. SCM Basic Auth Was Disabled
**What happened:** Azure disabled SCM basic auth on the app (possibly via a policy change or portal setting). All Kudu deploys returned 401 regardless of credentials.
**How we found it:** After trying 6 different credential approaches, checked `basicPublishingCredentialsPolicies/scm` and found `"allow": false`.
**Fix:** Enable via REST API (see above).
**Prevention:** After any Azure portal changes, verify SCM auth is still enabled.

### 2. Workflow Changed From Working Approach
**What happened:** The working Kudu curl deploy was replaced with `azure/webapps-deploy@v3` action, which has a bug with Linux App Services ("Failed to get app runtime OS").
**Fix:** Restored Kudu curl approach.
**Prevention:** Don't change the deploy method unless the current one is broken. Document the working method.

### 3. Credential Redaction in Claude Code
**What happened:** Claude Code's security sandbox redacts credential-like values, making it impossible to pipe Azure credentials to GitHub secrets from within Claude Code.
**Fix:** User must run credential-setting commands in their own terminal.
**Prevention:** Always set deploy credentials from a regular terminal, not from Claude Code.

### 4. Cache Flushed on Every Restart
**What happened:** The backend hashes all .py files on startup. If code changed, it flushes all disk cache. During development with `--reload`, every file edit triggered a restart and cache flush, causing 30-45s cold loads.
**Fix:** Added cache pre-warming on startup (territory map + market pulse fetched in background thread). Don't use `--reload` in production.
**Prevention:** Run local dev without `--reload` when testing performance. Use `az webapp deploy` for production.
