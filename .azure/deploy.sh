#!/bin/bash
# SalesPulse Azure Deployment Script — First-Time Setup
# Usage: .azure/deploy.sh [app-name]
#
# Production URL: https://salespulse-nyaaa.azurewebsites.net/
# GitHub Repo:    https://github.com/nlaarh/SalesPulse
# CI/CD:          Push to main → GitHub Actions auto-deploy
#
# Prerequisites:
#   - Azure CLI installed (brew install azure-cli)
#   - Logged in (az login)
#   - Subscription set (az account set -s "AAAWCNY Azure Sandbox")

set -e

APP_NAME="${1:-salespulse-nyaaa}"
RG="rg-nlaaroubi-sbx-eus2-001"
LOCATION="eastus2"           # US East 2 (NOT Canada)
PLAN_NAME="AASPPLAN"         # SalesPulse App Service Plan
SKU="B1"
RUNTIME="PYTHON:3.13"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "=== SalesPulse Azure Deployment ==="
echo "  App:      $APP_NAME.azurewebsites.net"
echo "  RG:       $RG"
echo "  Location: $LOCATION"
echo ""

# Step 1: Build React frontend
echo "[1/7] Building React frontend..."
cd "$FRONTEND_DIR"
npm run build
rm -rf "$BACKEND_DIR/static"
cp -r dist "$BACKEND_DIR/static"
echo "  React build copied to backend/static/"

# Step 2: Create App Service Plan (East US 2)
echo "[2/7] Creating App Service Plan ($LOCATION)..."
az appservice plan create \
  --name "$PLAN_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku "$SKU" \
  --is-linux \
  --output none 2>/dev/null || echo "  Plan already exists — skipping"
echo "  Plan: $PLAN_NAME ($SKU, $LOCATION)"

# Step 3: Create Web App
echo "[3/7] Creating Web App..."
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --plan "$PLAN_NAME" \
  --runtime "$RUNTIME" \
  --output none 2>/dev/null || echo "  Web app already exists — skipping"
echo "  Web App: $APP_NAME"

# Step 4: Configure Salesforce credentials as App Settings
echo "[4/7] Configuring app settings..."
# IMPORTANT: Use grep -m1 to match ONLY the first (active) line.
# The .env file may have multiple credential blocks — without -m1 you get multi-line
# values that break SF auth. (Lesson from FSLAPP March 2026 outage)
ENV_FILE="$PROJECT_DIR/../.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$PROJECT_DIR/.env"
fi
if [ -f "$ENV_FILE" ]; then
  az webapp config appsettings set \
    --name "$APP_NAME" \
    --resource-group "$RG" \
    --settings \
      SF_TOKEN_URL="$(grep -m1 '^SF_TOKEN_URL=' "$ENV_FILE" | cut -d= -f2-)" \
      SF_USERNAME="$(grep -m1 '^SF_USERNAME=' "$ENV_FILE" | cut -d= -f2-)" \
      SF_PASSWORD="$(grep -m1 '^SF_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)" \
      SF_SECURITY_TOKEN="$(grep -m1 '^SF_SECURITY_TOKEN=' "$ENV_FILE" | cut -d= -f2-)" \
      SF_CONSUMER_KEY="$(grep -m1 '^SF_CONSUMER_KEY=' "$ENV_FILE" | cut -d= -f2-)" \
      SF_CONSUMER_SECRET="$(grep -m1 '^SF_CONSUMER_SECRET=' "$ENV_FILE" | cut -d= -f2-)" \
      JWT_SECRET="$(openssl rand -hex 32)" \
      SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    --output none
  echo "  Credentials configured from $ENV_FILE"
else
  echo "  WARNING: .env not found — set SF_* app settings manually in Azure Portal"
fi

# Step 5: Set startup command
echo "[5/7] Setting startup command..."
az webapp config set \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --startup-file "startup.sh" \
  --output none
echo "  Startup: startup.sh"

# Step 6: Deploy backend + static files
echo "[6/7] Deploying via az webapp up..."
cd "$BACKEND_DIR"
az webapp up \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --runtime "$RUNTIME" \
  --sku "$SKU"

# Step 7: Health check
echo "[7/7] Verifying deployment..."
APP_URL="https://$APP_NAME.azurewebsites.net"
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health" 2>/dev/null)
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "302" ]; then
    echo "  App is live! (HTTP $STATUS)"
    break
  fi
  echo "  Waiting for startup ($i/30)..."
  sleep 10
done

echo ""
echo "=== Deployment Complete ==="
echo "  URL: $APP_URL"
echo ""
echo "Next steps:"
echo "  1. Get Kudu credentials for GitHub Actions:"
echo "     az webapp deployment list-publishing-credentials \\"
echo "       --name $APP_NAME --resource-group $RG \\"
echo "       --query \"{user:publishingUserName, pass:publishingPassword}\" -o json"
echo "  2. Add AZURE_DEPLOY_USER and AZURE_DEPLOY_PASS as GitHub secrets"
echo "  3. (Optional) Enable SSO: .azure/enable-sso.sh $APP_NAME"
