import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from database import SessionLocal
from routers.advisor_targets import targets_with_actuals

# Mock authenticated user
class MockUser:
    id = 1
    email = "test@nyaaa.com"

db = SessionLocal()
try:
    print("--- Verifying Targets & Actuals for Mamie Cimato (2025) ---")
    res = targets_with_actuals(line="Travel", start_date="2025-01-01", end_date="2025-12-31", _user=MockUser(), db=db)
    
    # Find Mamie Cimato
    mamie = None
    for adv in res['advisors']:
        if "cimato" in adv['name'].lower():
            mamie = adv
            break
            
    if mamie:
        print(f"Name: {mamie['name']} | Branch: {mamie['branch']}")
        print(f"Total Target: ${mamie['total_target']:,.2f}")
        print(f"Total Actual: ${mamie['total_actual']:,.2f}")
        print(f"Achievement %: {mamie['achievement_pct']}%")
        print("Monthly Breakdown:")
        for m in mamie['months']:
            print(f"  Month {m['month']}: Target=${m['target']:,.2f} | Actual=${m['actual']:,.2f} | Achievement={m['achievement_pct']}%")
    else:
        print("Mamie Cimato not found in targets_with_actuals response!")
finally:
    db.close()
