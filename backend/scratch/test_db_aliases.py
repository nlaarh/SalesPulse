import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from database import SessionLocal, init_db
from data.models import AdvisorAlias
from routers.advisor_targets import _normalize_name, reload_aliases_cache

print("--- Initializing DB (will seed aliases if empty) ---")
init_db()

db = SessionLocal()
try:
    print("\n--- Verifying AdvisorAlias Table Rows ---")
    rows = db.query(AdvisorAlias).all()
    print(f"Total aliases in DB: {len(rows)}")
    for r in rows[:5]:
        print(f"  Alias: '{r.alias_name}' -> Canonical: '{r.canonical_name}'")
        
    print("\n--- Testing _normalize_name ---")
    # Clean cache first
    reload_aliases_cache()
    
    test_names = [
        "Kevin Fairbanks-Bloom",
        "kevin fairbanks-bloom",
        "bloom, kevin",
        "Jennifer Ann Dudek",
        "Mamie Cimato"
    ]
    for name in test_names:
        norm = _normalize_name(name)
        print(f"  Input: '{name}' -> Cleaned: '{norm}'")
        
finally:
    db.close()
