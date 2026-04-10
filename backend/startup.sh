#!/bin/bash
# Azure App Service startup script for SalesPulse
set -e

cd /home/site/wwwroot

PORT="${PORT:-8000}"

echo "=== SalesPulse Startup ==="
echo "Working dir: $(pwd)"
echo "PORT: $PORT"
echo "Python: $(python3 --version)"
echo "Files: $(ls *.py 2>/dev/null | tr '\n' ' ')"

# Quick import test
python3 -c "
import fastapi; print(f'  fastapi {fastapi.__version__}')
import gunicorn; print(f'  gunicorn OK')
import main; print(f'  main.py OK')
print('All imports passed.')
" 2>&1

echo "Starting gunicorn..."
exec gunicorn main:app \
    --config gunicorn_conf.py \
    --bind "0.0.0.0:$PORT"
