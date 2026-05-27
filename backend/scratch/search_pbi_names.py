import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import travel_by_advisor_day

try:
    print("--- Searching PBI Travel for Mamie ---")
    # Fetch a large range in 2025 to find how her name is represented
    rows = travel_by_advisor_day("2025-01-01", "2025-12-31")
    names = set(r['name'] for r in rows if r['name'] and "cimato" in r['name'].lower())
    print("Unique names matching 'cimato' in 2025 PBI:", names)
    
    # Let's also print monthly aggregates for each unique name found
    for name in names:
        name_rows = [r for r in rows if r['name'] == name]
        total_comm = sum(r['commission'] for r in name_rows)
        total_sales = sum(r['sales'] for r in name_rows)
        print(f"Name: '{name}' | Total Comm: {total_comm:,.2f} | Total Sales: {total_sales:,.2f} | Rows count: {len(name_rows)}")
except Exception as e:
    print("Error:", e)
