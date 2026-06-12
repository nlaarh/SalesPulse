"""Reports router — list, generate, serve Travel Board analysis reports."""
import logging
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])
log    = logging.getLogger("reports")

# In-memory job status tracker
_jobs: dict[str, dict] = {}

REPORTS_DIR = Path.home() / ".salesinsight" / "reports"


class GenerateRequest(BaseModel):
    start_date: date
    end_date:   date
    report_type: str = "travel_board"


def _run_generation(report_id: str, sd: date, ed: date):
    from reports_engine import generate_report
    try:
        _jobs[report_id] = {**_jobs.get(report_id, {}), "status": "generating"}
        generate_report(sd, ed)
        _jobs[report_id] = {"status": "ready", "report_id": report_id}
        log.info(f"Report {report_id} ready")
    except Exception as e:
        log.error(f"Report generation failed for {report_id}: {e}")
        _jobs[report_id] = {"status": "error", "error": str(e)}


@router.get("")
def get_reports(_user=Depends(get_current_user)):
    """List all saved reports."""
    from reports_engine import list_reports
    return list_reports()


@router.post("/generate")
def generate(body: GenerateRequest, bg: BackgroundTasks, _user=Depends(get_current_user)):
    """Check cache → serve | else kick off generation in background."""
    if body.start_date >= body.end_date:
        raise HTTPException(400, "start_date must be before end_date")
    if body.end_date > date.today():
        raise HTTPException(400, "end_date cannot be in the future")

    from reports_engine import find_report
    report_id = f"travel_board_{body.start_date.isoformat()}_{body.end_date.isoformat()}"

    # Already cached on disk
    existing = find_report(report_id)
    if existing:
        return {"report_id": report_id, "status": "ready", **existing}

    # Already generating
    if _jobs.get(report_id, {}).get("status") == "generating":
        return {"report_id": report_id, "status": "generating"}

    # Start
    _jobs[report_id] = {"status": "generating", "started_at": datetime.now().isoformat()}
    bg.add_task(_run_generation, report_id, body.start_date, body.end_date)
    return {"report_id": report_id, "status": "generating"}


@router.get("/{report_id}/status")
def report_status(report_id: str, _user=Depends(get_current_user)):
    """Poll generation status."""
    from reports_engine import find_report
    job = _jobs.get(report_id, {})
    if job.get("status") == "error":
        raise HTTPException(500, job.get("error", "Generation failed"))
    if job.get("status") == "ready" or find_report(report_id):
        from reports_engine import list_reports
        entry = find_report(report_id) or {}
        return {"status": "ready", "report_id": report_id, **entry}
    if job.get("status") == "generating":
        return {"status": "generating", "report_id": report_id}
    raise HTTPException(404, "Report not found")


@router.get("/{report_id}/html")
def serve_report(report_id: str, _user=Depends(get_current_user)):
    """Serve the report HTML as a file response."""
    from reports_engine import find_report
    entry = find_report(report_id)
    if not entry:
        raise HTTPException(404, "Report not found")
    path = REPORTS_DIR / entry["filename"]
    if not path.exists():
        raise HTTPException(404, "Report file missing")
    content = path.read_bytes()
    return Response(
        content=content,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="{entry["filename"]}"'},
    )


@router.delete("/{report_id}")
def delete_report(report_id: str, _user=Depends(get_current_user)):
    """Remove a report from disk and index."""
    import json
    from reports_engine import _load_index, _save_index, find_report
    entry = find_report(report_id)
    if not entry:
        raise HTTPException(404, "Report not found")
    path = REPORTS_DIR / entry["filename"]
    if path.exists():
        path.unlink()
    index = [e for e in _load_index() if e.get("id") != report_id]
    _save_index(index)
    return {"deleted": report_id}
