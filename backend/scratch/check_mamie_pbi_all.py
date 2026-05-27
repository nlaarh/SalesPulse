import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import travel_by_advisor_day

try:
    print("--- Fetching 2025 PBI Travel data ---")
    rows_2025 = travel_by_advisor_day("2025-01-01", "2025-12-31")
    mamie_2025 = [r for r in rows_2025 if r['name'] and "cimato" in r['name'].lower()]
    
    comm_2025 = [0.0] * 12
    sales_2025 = [0.0] * 12
    for r in mamie_2025:
        m = int(r['date'].split('-')[1])
        comm_2025[m-1] += r['commission']
        sales_2025[m-1] += r['sales']
        
    print("2025 Commission (by Month):")
    for i, val in enumerate(comm_2025):
        print(f"  Month {i+1}: ${val:,.2f}")
    print(f"2025 Commission Total: ${sum(comm_2025):,.2f}")
    
    print("\n2025 Bookings (by Month):")
    for i, val in enumerate(sales_2025):
        print(f"  Month {i+1}: ${val:,.2f}")
    print(f"2025 Bookings Total: ${sum(sales_2025):,.2f}")

    print("\n--- Fetching 2026 PBI Travel data ---")
    rows_2026 = travel_by_advisor_day("2026-01-01", "2026-12-31")
    mamie_2026 = [r for r in rows_2026 if r['name'] and "cimato" in r['name'].lower()]
    
    comm_2026 = [0.0] * 12
    sales_2026 = [0.0] * 12
    for r in mamie_2026:
        m = int(r['date'].split('-')[1])
        comm_2026[m-1] += r['commission']
        sales_2026[m-1] += r['sales']
        
    print("2026 Commission (by Month):")
    for i, val in enumerate(comm_2026):
        print(f"  Month {i+1}: ${val:,.2f}")
    print(f"2026 Commission Total: ${sum(comm_2026):,.2f}")
    
    print("\n2026 Bookings (by Month):")
    for i, val in enumerate(sales_2026):
        print(f"  Month {i+1}: ${val:,.2f}")
    print(f"2026 Bookings Total: ${sum(sales_2026):,.2f}")

except Exception as e:
    print("Error:", e)
