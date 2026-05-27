import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from database import SessionLocal
from data.models import AdvisorTarget, MonthlyAdvisorTarget, TargetUpload

db = SessionLocal()
try:
    print("Database connection successfully established.")
    # Check uploads
    uploads = db.query(TargetUpload).all()
    print(f"Total uploads: {len(uploads)}")
    for u in uploads:
        print(f"Upload ID: {u.id}, Filename: {u.filename}, Line: {u.line}, Advisor Count: {u.advisor_count}")
    
    # Check targets count
    travel_uploads = [u.id for u in uploads if u.line == 'Travel']
    print(f"Travel Upload IDs: {travel_uploads}")
    
    # Query AdvisorTarget for Travel
    travel_advisors = db.query(AdvisorTarget).filter(AdvisorTarget.upload_id.in_(travel_uploads)).all()
    print(f"Total Travel AdvisorTargets: {len(travel_advisors)}")
    
    # Sum MonthlyAdvisorTarget for Travel
    monthly_targets = db.query(MonthlyAdvisorTarget).filter(
        MonthlyAdvisorTarget.advisor_target_id.in_([a.id for a in travel_advisors])
    ).all()
    print(f"Total Travel MonthlyAdvisorTarget records: {len(monthly_targets)}")
    
    # Group by year
    by_year = {}
    for m in monthly_targets:
        by_year.setdefault(m.year, []).append(m)
        
    for yr, records in sorted(by_year.items()):
        total_comm = sum(r.target_amount for r in records)
        total_bookings = sum(r.target_bookings for r in records)
        print(f"Year {yr}: Total Target Amount (Commission): {total_comm:,.2f}, Total Target Bookings (Sales): {total_bookings:,.2f}")

except Exception as e:
    print(f"Error querying database: {e}")
finally:
    db.close()
