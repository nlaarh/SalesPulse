import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from database import SessionLocal
from models import AdvisorTarget, MonthlyAdvisorTarget

# We want to keep canonical records and delete duplicates
# Format: {canonical_name: [list of duplicate names to remove]}
DUPLICATES_TO_CLEAN = {
    "Kevin Bloom": ["Kevin Fairbanks-Bloom"],
    "Michelle Szlapak": ["Michelle A Szlapak", "Michelle Szalapak"],
    "Kelly Gonseth-Harrienger": ["Kelly Harrienger"],
    "Bethany Steves": ["Beth Steves"],
    "Jacqueline Nieman": ["Jacki Nieman"],
    "Joyce Foglia Kellner": ["Joy Kellner"],
    "Joanna Voigt": ["Joanna Voight"],
}

db = SessionLocal()
try:
    print("=== STARTING DATABASE CLEANUP ===")
    
    for canonical_name, dup_names in DUPLICATES_TO_CLEAN.items():
        # Find canonical record
        canonical_record = db.query(AdvisorTarget).filter(AdvisorTarget.sf_name == canonical_name).first()
        if not canonical_record:
            print(f"Canonical record '{canonical_name}' not found in DB. Skipping.")
            continue
            
        print(f"Canonical Record: ID={canonical_record.id}, Name='{canonical_record.sf_name}'")
        
        # Find and delete duplicate records
        for dup_name in dup_names:
            dup_records = db.query(AdvisorTarget).filter(
                (AdvisorTarget.sf_name == dup_name) | (AdvisorTarget.raw_name == dup_name)
            ).all()
            
            for dr in dup_records:
                print(f"  Deleting Duplicate Record: ID={dr.id}, Name='{dr.sf_name}'")
                
                # First delete associated monthly targets
                deleted_months = db.query(MonthlyAdvisorTarget).filter(
                    MonthlyAdvisorTarget.advisor_target_id == dr.id
                ).delete(synchronize_session=False)
                
                # Delete the advisor target itself
                db.delete(dr)
                print(f"    Deleted duplicate ID={dr.id} and {deleted_months} monthly targets.")
                
    db.commit()
    print("=== DATABASE CLEANUP COMPLETED ===")
    
except Exception as e:
    db.rollback()
    print("Error during database cleanup:", e)
finally:
    db.close()
