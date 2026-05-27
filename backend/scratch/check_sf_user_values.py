import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from sf_client import sf_query_all

try:
    print("--- Querying Salesforce User ID Fields ---")
    rows = sf_query_all("SELECT Id, Name, EmployeeNumber, Epic_ID__c, Title, Profile.Name FROM User WHERE IsActive = true LIMIT 50")
    for r in rows:
        name = r.get("Name")
        emp = r.get("EmployeeNumber")
        epic = r.get("Epic_ID__c")
        title = r.get("Title")
        prof = (r.get("Profile") or {}).get("Name")
        if emp or epic:
            print(f"Name: {name:25} | Title: {title:30} | Profile: {prof:20} | Emp: {emp} | Epic: {epic}")
except Exception as e:
    print("Error:", e)
