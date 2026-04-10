#!/bin/bash
# Azure App Service startup script for SalesPulse
set -e

cd /home/site/wwwroot

# Add Oryx-installed packages to Python path
export PYTHONPATH="/home/site/wwwroot/.python_packages/lib/site-packages:${PYTHONPATH:-}"

PORT="${PORT:-8000}"

echo "=== SalesPulse Startup ==="
echo "Working dir: $(pwd)"
echo "PORT: $PORT"
echo "PYTHONPATH: $PYTHONPATH"
echo "Python: $(python3 --version)"
echo "Files: $(ls *.py 2>/dev/null | tr '\n' ' ')"

# Quick import test
python3 -c "
import sys
sys.path.insert(0, '/home/site/wwwroot/.python_packages/lib/site-packages')
sys.path.insert(0, '/home/site/wwwroot')
print('Testing imports...')
import fastapi; print(f'  fastapi {fastapi.__version__}')
import uvicorn; print(f'  uvicorn OK')
import gunicorn; print(f'  gunicorn OK')
import requests; print(f'  requests OK')
import sqlalchemy; print(f'  sqlalchemy {sqlalchemy.__version__}')
import pgeocode; print(f'  pgeocode OK')
import httpx; print(f'  httpx OK')
import main; print(f'  main.py OK - app={main.app}')
print('All imports passed.')
" 2>&1

echo "Starting gunicorn..."
exec gunicorn main:app \
    --config gunicorn_conf.py \
    --bind "0.0.0.0:$PORT"
