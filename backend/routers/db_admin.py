import os
import json
import logging
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import Date, DateTime, Numeric

from database import get_db, engine
from models import User, Base
from auth import require_admin
from activity_logger import log_activity
import cache

router = APIRouter(prefix="/api/admin/db", tags=["db-admin"])
log = logging.getLogger("salesinsight.db_admin")

BACKUP_DIR = Path.home() / ".salesinsight" / "db_backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def serialize_row(row, table):
    d = {}
    for col in table.columns:
        val = getattr(row, col.name, None)
        if val is not None:
            if hasattr(val, 'isoformat'):
                d[col.name] = val.isoformat()
            elif isinstance(col.type, Numeric):
                d[col.name] = float(val)
            else:
                d[col.name] = val
        else:
            d[col.name] = None
    return d


def deserialize_row(row_dict, table):
    d = {}
    for col in table.columns:
        val = row_dict.get(col.name)
        if val is not None:
            if isinstance(col.type, DateTime):
                d[col.name] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            elif isinstance(col.type, Date):
                d[col.name] = datetime.fromisoformat(val).date()
            else:
                d[col.name] = val
        else:
            d[col.name] = None
    return d


def fetch_azure_postgres_backups():
    if os.getenv("USE_SQLITE") == "1":
        return []
    try:
        from azure.identity import DefaultAzureCredential
        import requests

        credential = DefaultAzureCredential()
        token = credential.get_token("https://management.azure.com/.default").token

        sub_id = os.getenv("AZURE_SUBSCRIPTION_ID", "e287db16-b6ae-415e-bd52-41c8ec5a8f08")
        rg = os.getenv("WEBSITE_RESOURCE_GROUP", "rg-nlaaroubi-sbx-eus2-001")
        pg_host = os.getenv("PG_HOST", "fslapp-pg.postgres.database.azure.com")
        server_name = pg_host.split('.')[0]

        url = (
            f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}/"
            f"providers/Microsoft.DBforPostgreSQL/flexibleServers/{server_name}/backups"
            f"?api-version=2023-03-01-preview"
        )
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if r.status_code == 200:
            return [
                {
                    "filename": b.get("name"),
                    "size_bytes": None,
                    "created_at": b.get("properties", {}).get("completedTime"),
                    "type": "azure",
                    "backup_type": f"Azure {b.get('properties', {}).get('backupType', 'Full')}",
                }
                for b in r.json().get("value", [])
            ]
        log.warning("Azure backups API returned %s", r.status_code)
        return []
    except Exception as exc:
        log.warning("Failed to fetch Azure postgres backups: %s", exc)
        return []


@router.get("/backups")
def list_backups(admin: User = Depends(require_admin)):
    backups = []
    if BACKUP_DIR.exists():
        for f in BACKUP_DIR.glob("*.json"):
            stat = f.stat()
            backups.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "type": "local",
                "backup_type": "Logical JSON",
            })
    backups.extend(fetch_azure_postgres_backups())
    backups.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return {"backups": backups}


@router.post("/backup")
def create_backup(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        backup_data = {}
        for table in Base.metadata.sorted_tables:
            rows = db.execute(table.select()).all()
            backup_data[table.fullname] = [serialize_row(r, table) for r in rows]

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"db_backup_{timestamp}.json"
        filepath = BACKUP_DIR / filename
        with open(filepath, "w") as f:
            json.dump(backup_data, f, indent=2)

        # Keep only 10 most recent
        all_files = sorted(BACKUP_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
        for old in all_files[10:]:
            old.unlink(missing_ok=True)

        log_activity(db, action="create_db_backup", category="system", user=admin,
                     detail=f"Created database backup: {filename}", metadata={"filename": filename})

        stat = filepath.stat()
        return {"filename": filename, "created_at": datetime.now().isoformat(), "size_bytes": stat.st_size, "type": "local"}
    except Exception as exc:
        log.exception("Database backup failed")
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}")


@router.get("/backup/{filename}")
def download_backup(filename: str, admin: User = Depends(require_admin)):
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path, media_type="application/json", filename=filename)


@router.post("/restore")
def restore_backup(
    filename: str,
    backup_type: str = Query("local"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if backup_type == "azure":
        if os.getenv("USE_SQLITE") == "1":
            return {"status": "success", "restored_from": filename, "message": "PITR restore simulated"}
        try:
            from azure.identity import DefaultAzureCredential
            import requests

            credential = DefaultAzureCredential()
            token = credential.get_token("https://management.azure.com/.default").token

            sub_id = os.getenv("AZURE_SUBSCRIPTION_ID", "e287db16-b6ae-415e-bd52-41c8ec5a8f08")
            rg = os.getenv("WEBSITE_RESOURCE_GROUP", "rg-nlaaroubi-sbx-eus2-001")
            pg_host = os.getenv("PG_HOST", "fslapp-pg.postgres.database.azure.com")
            source_server = pg_host.split('.')[0]
            headers = {"Authorization": f"Bearer {token}"}

            list_url = (
                f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}/"
                f"providers/Microsoft.DBforPostgreSQL/flexibleServers/{source_server}/backups"
                f"?api-version=2023-03-01-preview"
            )
            r = requests.get(list_url, headers=headers, timeout=10)
            completed_time = None
            if r.status_code == 200:
                for b in r.json().get("value", []):
                    if b.get("name") == filename:
                        completed_time = b.get("properties", {}).get("completedTime")
                        break
            if not completed_time:
                raise HTTPException(status_code=404, detail=f"Azure backup '{filename}' not found")

            target_server = f"{source_server}-restored"
            put_r = requests.put(
                f"https://management.azure.com/subscriptions/{sub_id}/resourceGroups/{rg}/"
                f"providers/Microsoft.DBforPostgreSQL/flexibleServers/{target_server}"
                f"?api-version=2023-03-01-preview",
                headers=headers,
                json={
                    "location": "eastus2",
                    "sku": {"name": "Standard_B2s", "tier": "Burstable"},
                    "properties": {
                        "createMode": "PointInTimeRestore",
                        "sourceServerResourceId": (
                            f"/subscriptions/{sub_id}/resourceGroups/{rg}/"
                            f"providers/Microsoft.DBforPostgreSQL/flexibleServers/{source_server}"
                        ),
                        "pointInTimeUTC": completed_time,
                    },
                },
                timeout=15,
            )
            if put_r.status_code not in (200, 201, 202):
                raise Exception(f"Azure restore API returned {put_r.status_code}: {put_r.text}")

            log_activity(db, action="restore_db_backup", category="system", user=admin,
                         detail=f"Azure PITR restore initiated: {filename}",
                         metadata={"filename": filename, "type": "azure", "target": target_server})
            return {"status": "success", "restored_from": filename,
                    "message": f"Azure PITR restore initiated to server '{target_server}'"}
        except HTTPException:
            raise
        except Exception as exc:
            log.exception("Azure PostgreSQL restore failed")
            raise HTTPException(status_code=500, detail=f"Azure restore failed: {exc}")

    # Local restore
    filepath = BACKUP_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")
    try:
        with open(filepath) as f:
            backup_data = json.load(f)

        db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        from database import SessionLocal
        restore_db = SessionLocal()
        try:
            for table in Base.metadata.sorted_tables:
                rows_data = backup_data.get(table.fullname) or backup_data.get(table.name)
                if rows_data:
                    restore_db.execute(table.insert(), [deserialize_row(r, table) for r in rows_data])
            restore_db.commit()
        except Exception:
            restore_db.rollback()
            raise
        finally:
            restore_db.close()

        cache.clear_all(skip_protected=False)

        new_db = SessionLocal()
        try:
            log_activity(new_db, action="restore_db_backup", category="system", user=admin,
                         detail=f"Restored database from backup: {filename}", metadata={"filename": filename})
        finally:
            new_db.close()

        return {"status": "success", "restored_from": filename}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Database restore failed")
        raise HTTPException(status_code=500, detail=f"Restore failed: {exc}")
