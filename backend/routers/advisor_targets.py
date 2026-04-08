"""Advisor Targets — upload, store, and join with Salesforce actuals."""

import io
import logging
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import TargetUpload, AdvisorTarget, MonthlyAdvisorTarget, User
from auth import get_current_user, require_admin
from activity_logger import log_activity
from constants import CACHE_TTL_MEDIUM, CACHE_TTL_12H

router = APIRouter()
log = logging.getLogger('salesinsight.targets')


# ── Helpers ─────────────────────────────────────────────────────────────────

def _normalize_name(raw: str) -> str:
    """Convert 'Last, First MI' → 'First Last'. Drop middle initials."""
    if ',' not in raw:
        return raw.strip()
    parts = raw.split(',', 1)
    last = parts[0].strip()
    first_parts = parts[1].strip().split()
    first = first_parts[0] if first_parts else ''
    return f"{first} {last}"


def _parse_target(val) -> float | None:
    """Parse a target value — numeric or None for 'No Revenue Targets'."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace('$', '').replace(',', '')
    if not s or 'no ' in s.lower() or s == '0':
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _read_file_rows(content: bytes, filename: str) -> list[dict]:
    """Read an uploaded file and return rows as list of dicts."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in ('xlsx', 'xls'):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        headers = [str(h or '').strip() for h in rows[0]]
        return [{headers[i]: row[i] for i in range(len(headers))} for row in rows[1:] if any(row)]
    elif ext == 'csv':
        import csv
        reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
        return list(reader)
    raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext}. Use .xlsx or .csv")


MONTH_PATTERNS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
}


def _map_columns(headers: list[str]) -> dict:
    """Map file columns to {name, branch?, title?, m1..m12}."""
    mapping = {}
    for h in headers:
        hl = h.lower().strip()
        if not mapping.get('name') and any(k in hl for k in ('name', 'employee', 'advisor', 'agent')):
            mapping['name'] = h
        elif not mapping.get('branch') and any(k in hl for k in ('branch', 'office', 'location')):
            mapping['branch'] = h
        elif not mapping.get('title') and any(k in hl for k in ('title', 'position', 'role')):
            mapping['title'] = h
        else:
            # Check for month columns (Jan, Feb, ..., or Jan-26, 2026-01, etc.)
            for pattern, month_num in MONTH_PATTERNS.items():
                if hl.startswith(pattern):
                    key = f"m{month_num}"
                    if key not in mapping:
                        mapping[key] = h
                    break
    return mapping


# ── Request/Response schemas ────────────────────────────────────────────────

class AdvisorPreview(BaseModel):
    raw_name: str
    sf_name: str
    branch: str | None = None
    title: str | None = None
    monthly_target: float | None = None
    monthly_targets: dict[str, float] | None = None  # {"1": 50000, "2": 60000, ...}


class ConfirmRequest(BaseModel):
    filename: str
    line: str = 'Travel'
    year: int = 2026
    advisors: list[AdvisorPreview]


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/api/admin/targets/upload")
async def upload_targets(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
):
    """Upload a target file → AI maps columns → returns preview for confirmation."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    rows = _read_file_rows(content, file.filename)
    if not rows:
        raise HTTPException(status_code=400, detail="File is empty or could not be parsed")

    headers = list(rows[0].keys())
    mapping = _map_columns(headers)

    if 'name' not in mapping:
        raise HTTPException(
            status_code=400,
            detail=f"Could not identify advisor name column. Found columns: {headers}",
        )

    # Check if we have monthly columns (m1..m12) or a single monthly_target
    has_months = any(f"m{i}" in mapping for i in range(1, 13))

    advisors = []
    for row in rows:
        raw_name = str(row.get(mapping['name'], '') or '').strip()
        if not raw_name:
            continue
        sf_name = _normalize_name(raw_name)
        branch = str(row.get(mapping.get('branch', ''), '') or '').strip() or None
        title = str(row.get(mapping.get('title', ''), '') or '').strip() or None

        if has_months:
            monthly_targets = {}
            for m in range(1, 13):
                col = mapping.get(f"m{m}")
                if col:
                    val = _parse_target(row.get(col))
                    monthly_targets[str(m)] = val if val is not None else 0
                else:
                    monthly_targets[str(m)] = 0
            total = sum(monthly_targets.values())
            advisors.append({
                'raw_name': raw_name,
                'sf_name': sf_name,
                'branch': branch,
                'title': title,
                'monthly_target': round(total / 12) if total > 0 else None,
                'monthly_targets': monthly_targets,
            })
        else:
            target = _parse_target(row.get(mapping.get('monthly_target', '')))
            advisors.append({
                'raw_name': raw_name,
                'sf_name': sf_name,
                'branch': branch,
                'title': title,
                'monthly_target': target,
                'monthly_targets': None,
            })

    return {
        'filename': file.filename,
        'mapping': mapping,
        'has_months': has_months,
        'advisors': advisors,
        'count': len(advisors),
    }


@router.post("/api/admin/targets/confirm")
def confirm_targets(
    body: ConfirmRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Save confirmed target data to the database."""
    if not body.advisors:
        raise HTTPException(status_code=400, detail="No advisors to save")

    upload = TargetUpload(
        filename=body.filename,
        line=body.line,
        uploaded_by_id=admin.id,
        uploaded_by_email=admin.email,
        advisor_count=len(body.advisors),
    )
    db.add(upload)
    db.flush()  # get upload.id

    from datetime import datetime

    monthly_count = 0
    for a in body.advisors:
        at = AdvisorTarget(
            upload_id=upload.id,
            raw_name=a.raw_name,
            sf_name=a.sf_name,
            branch=a.branch,
            title=a.title,
            monthly_target=a.monthly_target,
        )
        db.add(at)
        db.flush()  # get at.id

        # Save per-month targets if provided
        if a.monthly_targets:
            for month_str, amount in a.monthly_targets.items():
                month_int = int(month_str)
                if month_int < 1 or month_int > 12:
                    continue
                # Upsert into MonthlyAdvisorTarget
                existing = db.query(MonthlyAdvisorTarget).filter(
                    MonthlyAdvisorTarget.advisor_target_id == at.id,
                    MonthlyAdvisorTarget.year == body.year,
                    MonthlyAdvisorTarget.month == month_int,
                ).first()
                if existing:
                    existing.target_amount = amount
                    existing.updated_by_email = admin.email
                    existing.updated_at = datetime.utcnow()
                else:
                    db.add(MonthlyAdvisorTarget(
                        advisor_target_id=at.id,
                        year=body.year,
                        month=month_int,
                        target_amount=amount,
                        updated_by_email=admin.email,
                    ))
                monthly_count += 1

    db.commit()
    log_activity(
        db, action='targets_uploaded', category='targets',
        user=admin,
        detail=f"Uploaded {len(body.advisors)} {body.line} advisor targets from {body.filename}"
               + (f" ({monthly_count} monthly entries)" if monthly_count else ""),
        metadata={'upload_id': upload.id, 'count': len(body.advisors), 'monthly': monthly_count},
    )

    return {'upload_id': upload.id, 'count': len(body.advisors), 'monthly': monthly_count, 'status': 'saved'}


@router.get("/api/targets")
def get_targets(
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the latest set of advisor targets + upload metadata."""
    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return {'targets': [], 'upload': None}

    targets = (
        db.query(AdvisorTarget)
        .filter(AdvisorTarget.upload_id == upload.id)
        .order_by(AdvisorTarget.sf_name)
        .all()
    )
    return {
        'targets': [t.to_dict() for t in targets],
        'upload': upload.to_dict(),
    }


@router.get("/api/targets/with-actuals")
def targets_with_actuals(
    line: str = "Travel",
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Join targets with Salesforce actuals — per-advisor and per-branch."""
    from shared import resolve_dates, WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache

    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return {'advisors': [], 'branches': [], 'upload': None}

    targets = (
        db.query(AdvisorTarget)
        .filter(AdvisorTarget.upload_id == upload.id)
        .all()
    )
    target_map = {t.sf_name.strip().lower(): t for t in targets}

    # Resolve dates
    sd, ed = resolve_dates(start_date, end_date, 12)
    lf = line_filter_opp(line)
    cache_key = f"targets_actuals_comm_{line}_{sd}_{ed}"

    def fetch_actuals():
        # Compare targets against revenue (Amount).
        return sf_query_all(f"""
            SELECT Owner.Name, CALENDAR_YEAR(CloseDate) yr,
                   CALENDAR_MONTH(CloseDate) mo,
                   COUNT(Id) cnt, SUM(Amount) rev
            FROM Opportunity
            WHERE {WON_STAGES} AND {lf}
              AND CloseDate >= {sd} AND CloseDate <= {ed}
              AND Amount != null
            GROUP BY Owner.Name, CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate)
        """)

    records = cache.cached_query(cache_key, fetch_actuals, ttl=CACHE_TTL_MEDIUM, disk_ttl=CACHE_TTL_12H)

    # Build actual revenue per agent per month
    agent_months: dict[str, dict[str, float]] = {}
    for r in records:
        name = r.get('Name', '')
        if not name:
            continue
        ym = f"{r.get('yr')}-{str(r.get('mo', 0)).zfill(2)}"
        agent_months.setdefault(name.strip().lower(), {})
        agent_months[name.strip().lower()][ym] = r.get('rev', 0) or 0

    # Build month list from date range
    from datetime import date as dt_date
    sd_dt = dt_date.fromisoformat(sd)
    ed_dt = dt_date.fromisoformat(ed)
    month_labels = []
    cur = sd_dt.replace(day=1)
    while cur <= ed_dt:
        month_labels.append(f"{cur.year}-{str(cur.month).zfill(2)}")
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    # Build advisor results
    advisors = []
    branch_agg: dict[str, dict] = {}

    for t in targets:
        key = t.sf_name.strip().lower()
        actuals = agent_months.get(key, {})
        mt = t.monthly_target

        months = []
        total_actual = 0
        total_target = 0
        for ym in month_labels:
            actual = actuals.get(ym, 0)
            total_actual += actual
            month_target = mt or 0
            total_target += month_target
            pct = round(actual / mt * 100, 1) if mt and mt > 0 else None
            months.append({
                'month': ym,
                'target': mt,
                'actual': actual,
                'achievement_pct': pct,
            })

        n_months = len(month_labels)
        overall_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else None

        advisors.append({
            'name': t.sf_name,
            'branch': t.branch,
            'title': t.title,
            'monthly_target': mt,
            'total_target': total_target,
            'total_actual': total_actual,
            'achievement_pct': overall_pct,
            'months': months,
        })

        # Branch aggregation
        if t.branch:
            b = branch_agg.setdefault(t.branch, {
                'branch': t.branch, 'target_sum': 0, 'actual_sum': 0,
                'advisor_count': 0, 'with_target': 0,
            })
            b['advisor_count'] += 1
            if mt:
                b['target_sum'] += mt * n_months
                b['with_target'] += 1
            b['actual_sum'] += total_actual

    # Finalize branch data
    branches = []
    for b in sorted(branch_agg.values(), key=lambda x: x['actual_sum'], reverse=True):
        b['achievement_pct'] = (
            round(b['actual_sum'] / b['target_sum'] * 100, 1)
            if b['target_sum'] > 0 else None
        )
        branches.append(b)

    advisors.sort(key=lambda a: a['total_actual'], reverse=True)

    return {
        'advisors': advisors,
        'branches': branches,
        'months': month_labels,
        'upload': upload.to_dict(),
        'line': line,
        'start_date': sd,
        'end_date': ed,
    }
