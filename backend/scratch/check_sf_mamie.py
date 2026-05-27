import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from sf_client import sf_query_all

try:
    print("--- Searching SF Users for Cimato ---")
    rows = sf_query_all("SELECT Id, Name, Title, Profile.Name, IsActive FROM User WHERE Name LIKE '%Cimato%'")
    for r in rows:
        print(r)
except Exception as e:
    print("Error:", e)
