"""SalesInsight — FastAPI backend for AAA Travel & Insurance analytics."""

import os, sys, logging

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=False)

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
log = logging.getLogger('main')


@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup: flush disk cache only if code changed since last run (new deployment).
    On a plain restart (same code), the cache is preserved.
    """
    import cache, hashlib

    # Hash the key backend files that affect query logic / response shape
    backend_dir = Path(__file__).resolve().parent
    hasher = hashlib.md5()
    for pattern in ('*.py', 'routers/*.py'):
        for f in sorted(backend_dir.glob(pattern)):
            hasher.update(f.read_bytes())
    current_hash = hasher.hexdigest()

    version_file = cache._CACHE_DIR / '.deploy_hash'
    cache._CACHE_DIR.mkdir(parents=True, exist_ok=True)
    stored_hash = version_file.read_text().strip() if version_file.exists() else ''

    if current_hash != stored_hash:
        # New deployment — flush stale cache so old query shapes don't persist
        flushed = sum(1 for f in cache._CACHE_DIR.glob('*.json') if (f.unlink(), True)[1])
        version_file.write_text(current_hash)
        log.info(f"New deployment detected: flushed {flushed} cache entries")
    else:
        log.info("Restart detected (same code): keeping existing cache")

    yield  # app runs here


app = FastAPI(title="SalesInsight", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://salespulse-nyaaa.azurewebsites.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Initialize database ──────────────────────────────────────────────────────

from database import init_db
init_db()

# ── Register routers ─────────────────────────────────────────────────────────

from routers import sales_advisor, sales_pipeline, sales_travel, sales_leads, sales_performance, sales_opportunities, sales_agent_profile, sales_narrative, users, activity_logs, advisor_targets, advisor_targets_monthly, email_report, issues, ai_config, customer_profile

app.include_router(sales_advisor.router)
app.include_router(sales_pipeline.router)
app.include_router(sales_travel.router)
app.include_router(sales_leads.router)
app.include_router(sales_performance.router)
app.include_router(sales_opportunities.router)
app.include_router(sales_agent_profile.router)
app.include_router(sales_narrative.router)
app.include_router(users.router)
app.include_router(activity_logs.router)
app.include_router(advisor_targets.router)
app.include_router(advisor_targets_monthly.router)
app.include_router(email_report.router)
app.include_router(issues.router)
app.include_router(ai_config.router)
app.include_router(customer_profile.router)


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "SalesInsight"}


# ── Serve React SPA ──────────────────────────────────────────────────────────

_static_dir = Path(__file__).resolve().parent / "static"

if _static_dir.is_dir():
    _assets_dir = _static_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = _static_dir / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")
