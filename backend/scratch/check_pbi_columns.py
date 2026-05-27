import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS, INSURANCE_DS

try:
    print("--- Querying first row from Travel Transactions f transformed ---")
    rows = dax_query(PBI_WS, TRAVEL_DS, "EVALUATE TOPN(1, 'Travel Transactions f transformed')")
    if rows:
        print("Columns in 'Travel Transactions f transformed':")
        # Columns in SUMMARIZECOLUMNS output format:
        # e.g. "Travel Transactions f transformed[ColumnName]"
        cols = sorted(list(rows[0].keys()))
        for c in cols:
            print(f"  {c}")
    else:
        print("No rows returned.")
        
    print("\n--- Querying first row from insurance_transactions_f ---")
    rows_ins = dax_query(PBI_WS, INSURANCE_DS, "EVALUATE TOPN(1, 'insurance_transactions_f')")
    if rows_ins:
        print("Columns in 'insurance_transactions_f':")
        cols = sorted(list(rows_ins[0].keys()))
        for c in cols:
            print(f"  {c}")
    else:
        print("No rows returned from insurance.")
except Exception as e:
    print("Error:", e)
