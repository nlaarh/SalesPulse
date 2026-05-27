import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS, INSURANCE_DS

try:
    print("--- Querying Travel with Teller Code ---")
    q_travel = """
    EVALUATE TOPN(5, 
        SUMMARIZECOLUMNS(
            'Travel Transactions f transformed'[Primary Advisor Full Name],
            'Travel Transactions f transformed'[Primary Advisor Teller Code],
            'Travel Transactions f transformed'[Primary Advisor Branch Name],
            FILTER(ALL('Travel Transactions f transformed'), 
                'Travel Transactions f transformed'[Invoice Date] >= DATE(2026,4,1) &&
                'Travel Transactions f transformed'[Invoice Date] <= DATE(2026,4,5)
            ),
            "commission", SUM('Travel Transactions f transformed'[Revenue Club Commission Amount]),
            "sales",      SUM('Travel Transactions f transformed'[Gross Sales Amount])
        )
    )
    """
    rows_travel = dax_query(PBI_WS, TRAVEL_DS, q_travel)
    print(f"Travel rows found: {len(rows_travel)}")
    for r in rows_travel:
        print(r)
        
    print("\n--- Querying Insurance with Inserted By Code ---")
    q_ins = """
    EVALUATE TOPN(5, 
        SUMMARIZECOLUMNS(
            'insurance_transactions_f'[inserted_by_name],
            'insurance_transactions_f'[inserted_by_code],
            'insurance_transactions_f'[branch_name],
            FILTER(ALL('insurance_transactions_f'), 
                'insurance_transactions_f'[invoice_date_generation] >= DATE(2026,4,1) &&
                'insurance_transactions_f'[invoice_date_generation] <= DATE(2026,4,5)
            ),
            "commission", SUM('insurance_transactions_f'[commission_amount]),
            "sales",      SUM('insurance_transactions_f'[transaction_amount])
        )
    )
    """
    rows_ins = dax_query(PBI_WS, INSURANCE_DS, q_ins)
    print(f"Insurance rows found: {len(rows_ins)}")
    for r in rows_ins:
        print(r)
        
except Exception as e:
    print("Error:", e)
