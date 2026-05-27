import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS, INSURANCE_DS

try:
    print("--- Querying Travel Dataset Columns via DMV ---")
    # DMV query to get all columns in the model
    # $SYSTEM.TMSCHEMA_COLUMNS contains metadata about table columns
    columns_travel = dax_query(PBI_WS, TRAVEL_DS, "SELECT [TableID], [ExplicitName], [SourceColumn] FROM $SYSTEM.TMSCHEMA_COLUMNS")
    print(f"Total columns in Travel: {len(columns_travel)}")
    
    # Let's filter columns where table name contains 'Advisor' or 'Transaction'
    # First we get table IDs
    tables_travel = dax_query(PBI_WS, TRAVEL_DS, "SELECT [ID], [Name] FROM $SYSTEM.TMSCHEMA_TABLES")
    table_id_map = {t['ID']: t['Name'] for t in tables_travel}
    
    print("\nSome tables in Travel Dataset:")
    for tid, name in list(table_id_map.items())[:10]:
        print(f"  ID {tid}: {name}")
        
    print("\nColumns in 'Travel Transactions f transformed' table:")
    for col in columns_travel:
        table_name = table_id_map.get(col.get('TableID'))
        if table_name == 'Travel Transactions f transformed':
            print(f"  {col.get('ExplicitName')} (Source: {col.get('SourceColumn')})")
            
except Exception as e:
    print("Error:", e)
