import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from database import SessionLocal
from models import AdvisorTarget, MonthlyAdvisorTarget

db = SessionLocal()
try:
    print("--- Searching DB for Mamie Cimato ---")
    adv = db.query(AdvisorTarget).filter(
        (AdvisorTarget.sf_name.like("%Cimato%")) | 
        (AdvisorTarget.raw_name.like("%Cimato%"))
    ).first()
    
    if adv:
        print(f"Advisor found: ID={adv.id}, sf_name='{adv.sf_name}', raw_name='{adv.raw_name}', title='{adv.title}', branch='{adv.branch}'")
        
        for yr in [2025, 2026]:
            m_rows = db.query(MonthlyAdvisorTarget).filter(
                MonthlyAdvisorTarget.advisor_target_id == adv.id,
                MonthlyAdvisorTarget.year == yr
            ).order_by(MonthlyAdvisorTarget.month).all()
            print(f"\nFound {len(m_rows)} monthly target rows for year {yr} in DB:")
            total_target = 0
            for r in m_rows:
                print(f"  Month {r.month}: target_amount={r.target_amount}, target_bookings={r.target_bookings}, updated_by_email={r.updated_by_email}")
                total_target += r.target_amount or 0
            print(f"  Total Target for {yr}: {total_target}")
    else:
        print("No AdvisorTarget record found in DB for Mamie Cimato")
finally:
    db.close()
