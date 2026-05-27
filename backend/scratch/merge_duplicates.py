import sys
sys.path.insert(0, '/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend')
from dotenv import load_dotenv
load_dotenv('/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env', override=True)
from database import SessionLocal
from models import AdvisorTarget, MonthlyAdvisorTarget

def merge_advisors(db, keep_id, delete_id, new_sf_name=None):
    keep = db.query(AdvisorTarget).filter(AdvisorTarget.id == keep_id).first()
    delete = db.query(AdvisorTarget).filter(AdvisorTarget.id == delete_id).first()
    
    if not keep or not delete:
        print(f"Error: keep_id={keep_id} or delete_id={delete_id} not found.")
        return
        
    print(f"Merging delete_id={delete_id} ({delete.sf_name}) into keep_id={keep_id} ({keep.sf_name})")
    
    # 1. Update AdvisorTarget attributes
    if new_sf_name:
        keep.sf_name = new_sf_name
    if delete.monthly_target and not keep.monthly_target:
        keep.monthly_target = delete.monthly_target
    if delete.annual_stretch and not keep.annual_stretch:
        keep.annual_stretch = delete.annual_stretch
    db.add(keep)
    
    # 2. Merge MonthlyAdvisorTarget entries
    delete_monthly = db.query(MonthlyAdvisorTarget).filter(MonthlyAdvisorTarget.advisor_target_id == delete_id).all()
    for dm in delete_monthly:
        # Check if keep_id already has a monthly target for this year and month
        existing = db.query(MonthlyAdvisorTarget).filter(
            MonthlyAdvisorTarget.advisor_target_id == keep_id,
            MonthlyAdvisorTarget.year == dm.year,
            MonthlyAdvisorTarget.month == dm.month
        ).first()
        
        if existing:
            # Keep the one with actual target, or if both exist, prefer the one updated by user over 'system-seed'
            if dm.updated_by_email != 'system-seed' and existing.updated_by_email == 'system-seed':
                # Delete existing, keep dm (update dm to point to keep_id)
                db.delete(existing)
                dm.advisor_target_id = keep_id
                db.add(dm)
            else:
                # Delete the duplicate dm row
                db.delete(dm)
        else:
            # Point dm to keep_id
            dm.advisor_target_id = keep_id
            db.add(dm)
            
    # 3. Delete the duplicate AdvisorTarget row
    db.delete(delete)
    print(f"Merged successfully.")

def main():
    db = SessionLocal()
    try:
        # Define merge groups based on our analysis:
        # (keep_id, delete_id, optional_new_name)
        groups = [
            (5, 91, 'Jayne Kaiser'),
            (25, 138, 'Amy Mannara'),
            (18, 86, 'Jennifer Dudek'),
            (27, 287, 'Catherine McCarthy'),
            (98, 32, 'Kimberly Greene'),
            (63, 207, 'Nadine Hermanski'),
            (28, 100, 'Robin Mitchell')
        ]
        
        for keep_id, delete_id, new_name in groups:
            merge_advisors(db, keep_id, delete_id, new_name)
            
        db.commit()
        print("All merges committed successfully.")
    except Exception as e:
        db.rollback()
        print("Error during merges, rolled back:", e)
    finally:
        db.close()

if __name__ == '__main__':
    main()
