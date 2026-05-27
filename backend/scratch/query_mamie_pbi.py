import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS

try:
    print("--- Querying Employee table from TRAVEL_DS ---")
    q = "EVALUATE TOPN(1, 'Employee')"
    rows = dax_query(PBI_WS, TRAVEL_DS, q)
    print("Success! Employee table exists in TRAVEL_DS.")
except Exception as e:
    print("Failed: Employee table does not exist in TRAVEL_DS. Error:", e)
