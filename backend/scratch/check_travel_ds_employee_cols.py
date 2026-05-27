import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS

try:
    print("--- Listing columns for Employee table in TRAVEL_DS ---")
    rows = dax_query(PBI_WS, TRAVEL_DS, "EVALUATE COLUMNSTATISTICS()")
    emp_cols = [r for r in rows if r.get("Table Name") == "Employee" or r.get("[Table Name]") == "Employee"]
    print(f"Found {len(emp_cols)} columns for Employee table in TRAVEL_DS:")
    for r in emp_cols:
        col = r.get("Column Name") or r.get("[Column Name]")
        card = r.get("Cardinality") or r.get("[Cardinality]")
        print(f"  Column: {col} | Cardinality: {card}")
except Exception as e:
    print("Error:", e)
