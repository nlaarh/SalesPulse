import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from sf_client import sf_query_all

try:
    print("--- Querying SF Travel Users ---")
    rows = sf_query_all("""
        SELECT Id, Name, EmployeeNumber, Epic_ID__c, Title, Profile.Name 
        FROM User 
        WHERE IsActive = true 
          AND (Profile.Name = 'Travel User' OR Profile.Name = 'Support User')
    """)
    print(f"Found {len(rows)} active travel/support users:")
    for r in rows:
        print(f"  Name: {r.get('Name'):25} | Title: {r.get('Title'):30} | Emp: {r.get('EmployeeNumber')} | Epic: {r.get('Epic_ID__c')}")
except Exception as e:
    print("Error:", e)
