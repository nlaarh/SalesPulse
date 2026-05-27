import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from sf_client import sf_query_all

# Let's define the known Teller Codes we found in PBI
known_teller_codes = {
    "Mamie Cimato": "WXMAC",
    "Kevin Bloom": "WXKB",
    "Kevin Fairbanks-Bloom": "WXKB",
    "Ashley Gielow": "WKAGI",
    "Jennifer Dudek": "WBJD",
    "Jennifer Ann Dudek": "WBJD",
    "Maureen Bulman": "RIMB",
    "Ted Tomasello": "WSTTO",
    "Carmen Tang": "WXCT",
    "Anne Popeck": "WKAPO"
}

try:
    print("--- Searching SF Users for Teller Codes ---")
    users = sf_query_all("""
        SELECT Id, Name, Alias, Username, CommunityNickname, EmployeeNumber, Epic_ID__c, 
               Title, Department, Branch__c, Cash_Drawer__c, Available_Cash_Drawer__c
        FROM User 
        WHERE IsActive = true
    """)
    
    print(f"Total active users checked: {len(users)}")
    
    # We will search if any field contains any of the known teller codes
    matches_found = 0
    for u in users:
        name = u.get("Name")
        # Check if we have a known teller code for this user name
        expected_code = None
        for k_name, k_code in known_teller_codes.items():
            if k_name.lower() in name.lower() or name.lower() in k_name.lower():
                expected_code = k_code
                break
        
        if expected_code:
            print(f"\nAdvisor: {name} (Expected PBI Code: {expected_code})")
            # Scan all keys and values in the Salesforce User dictionary
            for field, val in sorted(u.items()):
                if val:
                    val_str = str(val)
                    if expected_code.lower() in val_str.lower():
                        print(f"  [MATCH FOUND] Field '{field}' contains '{expected_code}': {val}")
                        matches_found += 1
                    else:
                        print(f"  Field '{field}': {val}")
                        
    print(f"\nTotal matches of teller codes found in Salesforce User fields: {matches_found}")
except Exception as e:
    print("Error:", e)
