"""Advisor Targets — upload, store, and join with Salesforce actuals."""

import io
import logging
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
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
    raw_clean = raw.strip()
    raw_lower = raw_clean.lower()
    
    # Map spelling variations and nicknames to canonical Salesforce User Names
    NAME_ALIASES = {
        "kevin fairbanks-bloom": "Kevin Bloom",
        "bloom, kevin": "Kevin Bloom",
        "fairbanks-bloom, kevin": "Kevin Bloom",
        "michelle szalapak": "Michelle Szlapak",
        "michelle a szlapak": "Michelle Szlapak",
        "szalapak, michelle": "Michelle Szlapak",
        "joanna voight": "Joanna Voigt",
        "voight, joanna": "Joanna Voigt",
        "joy kellner": "Joyce Foglia Kellner",
        "kellner, joy": "Joyce Foglia Kellner",
        "jacki nieman": "Jacqueline Nieman",
        "nieman, jacki": "Jacqueline Nieman",
        "beth steves": "Bethany Steves",
        "steves, beth": "Bethany Steves",
        "kelly harrienger": "Kelly Gonseth-Harrienger",
        "harrienger, kelly": "Kelly Gonseth-Harrienger",
        "cat mccarthy": "Catherine McCarthy",
        "mccarthy, cat": "Catherine McCarthy",
    }
    
    if raw_lower in NAME_ALIASES:
        return NAME_ALIASES[raw_lower]
        
    if ',' not in raw_clean:
        normalized = raw_clean
    else:
        parts = raw_clean.split(',', 1)
        last = parts[0].strip()
        first_parts = parts[1].strip().split()
        first = first_parts[0] if first_parts else ''
        normalized = f"{first} {last}"
        
    norm_lower = normalized.lower()
    if norm_lower in NAME_ALIASES:
        return NAME_ALIASES[norm_lower]
    return normalized



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

from schemas import AdvisorPreview, ConfirmRequest


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
            annual_stretch=a.annual_stretch,
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
    """Join targets with actuals (Power BI for Travel/Insurance, Salesforce fallback) — per-advisor and per-branch."""
    from shared import resolve_dates, WON_STAGES, line_filter_opp
    from sf_client import sf_query_all
    import cache
    from routers.advisor_targets_monthly import _get_advisor_monthly_actuals
    from datetime import date as dt_date

    upload = db.query(TargetUpload).order_by(TargetUpload.id.desc()).first()
    if not upload:
        return {'advisors': [], 'branches': [], 'upload': None}

    targets = (
        db.query(AdvisorTarget)
        .filter(AdvisorTarget.upload_id == upload.id)
        .all()
    )

    # Resolve dates
    sd, ed = resolve_dates(start_date, end_date, 12)
    lf = line_filter_opp(line)

    sd_dt = dt_date.fromisoformat(sd)
    ed_dt = dt_date.fromisoformat(ed)
    
    # Get all (year, month) pairs
    year_months = []
    month_labels = []
    cur = sd_dt.replace(day=1)
    while cur <= ed_dt:
        year_months.append((cur.year, cur.month))
        month_labels.append(f"{cur.year}-{str(cur.month).zfill(2)}")
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)

    unique_years = sorted(list(set(y for y, m in year_months)))

    # Fetch actuals from PBI (or SF fallback) for each year in the range
    consolidated_actuals = {}
    for year in unique_years:
        act_data = _get_advisor_monthly_actuals(line, year, cache, sf_query_all, WON_STAGES, lf)
        for name_lower, months_dict in act_data['actuals'].items():
            consolidated_actuals.setdefault(name_lower, {})
            for mo, vals in months_dict.items():
                ym = f"{year}-{str(mo).zfill(2)}"
                consolidated_actuals[name_lower][ym] = vals

    # Load monthly targets for all advisors in the years covered
    advisor_ids = [t.id for t in targets]
    monthly_rows = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.advisor_target_id.in_(advisor_ids),
        MonthlyAdvisorTarget.year.in_(unique_years)
    ).all()
    
    monthly_target_map = {}
    for mr in monthly_rows:
        monthly_target_map[(mr.advisor_target_id, mr.year, mr.month)] = mr.target_amount

    # Build advisor results
    advisors = []
    branch_agg: dict[str, dict] = {}

    for t in targets:
        key = t.sf_name.strip().lower()
        actuals = consolidated_actuals.get(key, {})
        mt = t.monthly_target

        months = []
        total_actual = 0.0
        total_target = 0.0
        for y, m in year_months:
            ym = f"{y}-{str(m).zfill(2)}"
            
            # Fetch target from MonthlyAdvisorTarget
            month_target = monthly_target_map.get((t.id, y, m))
            if month_target is None:
                # Fallback to advisor's flat target
                month_target = mt or 0.0
                
            # Fetch actual from consolidated actuals (commission)
            actual_vals = actuals.get(ym) or {}
            actual = actual_vals.get('commission', 0.0) or 0.0
            
            total_actual += actual
            total_target += month_target
            pct = round(actual / month_target * 100, 1) if month_target > 0 else None
            months.append({
                'month': ym,
                'target': month_target,
                'actual': actual,
                'achievement_pct': pct,
            })

        overall_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else None

        advisors.append({
            'name': t.sf_name,
            'branch': t.branch,
            'title': t.title,
            'monthly_target': mt or (total_target / len(year_months) if year_months else 0.0),
            'annual_stretch': t.annual_stretch,
            'total_target': total_target,
            'total_actual': total_actual,
            'achievement_pct': overall_pct,
            'months': months,
        })

        # Branch aggregation
        if t.branch:
            b = branch_agg.setdefault(t.branch, {
                'branch': t.branch, 'target_sum': 0.0, 'actual_sum': 0.0,
                'advisor_count': 0, 'with_target': 0,
            })
            b['advisor_count'] += 1
            if total_target > 0:
                b['target_sum'] += total_target
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
