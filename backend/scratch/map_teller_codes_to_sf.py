import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_TRANSACTIONS_DS
from sf_client import sf_query_all

try:
    print("--- Fetching Teller to Email Map from PBI ---")
    q = """
    EVALUATE 
        FILTER(
            SUMMARIZECOLUMNS(
                Employee[Full Name],
                Employee[Tellercode],
                Employee[Email],
                Employee[Status]
            ),
            Employee[Tellercode] <> "No Data" && 
            NOT(ISBLANK(Employee[Tellercode])) && 
            Employee[Email] <> "" &&
            NOT(ISBLANK(Employee[Email]))
        )
    """
    pbi_rows = dax_query(PBI_WS, TRAVEL_TRANSACTIONS_DS, q)
    print(f"Fetched {len(pbi_rows)} rows from PBI.")
    
    # Store Teller Code to Email mappings (using lowercase emails for case-insensitive matching)
    teller_to_email = {}
    for r in pbi_rows:
        code = r.get("Employee[Tellercode]")
        email = r.get("Employee[Email]")
        name = r.get("Employee[Full Name]")
        if code and email:
            teller_to_email[code.lower()] = {
                'email': email.lower().strip(),
                'name': name
            }
            
    print("\n--- Fetching Salesforce Users ---")
    sf_users = sf_query_all("SELECT Id, Name, Email, Username, IsActive FROM User WHERE IsActive = true")
    print(f"Loaded {len(sf_users)} active users from SF.")
    
    # Check match rates
    matches = 0
    missing = 0
    
    # Let's inspect some travel agents specifically
    travel_agents = [
        "Mamie Cimato", "Kevin Bloom", "Ashley Gielow", "Jennifer Dudek",
        "Maureen Bulman", "Ted Tomasello", "Carmen Tang", "Anne Popeck"
    ]
    
    print("\n--- Testing Specific Travel Advisors ---")
    for name in travel_agents:
        # Search this name in SF Users
        sf_u = next((u for u in sf_users if name.lower() in u['Name'].lower()), None)
        if sf_u:
            sf_email = sf_u['Email'].lower().strip()
            # Find in teller_to_email by matching email
            matched_teller = None
            matched_name = None
            for code, info in teller_to_email.items():
                if info['email'] == sf_email:
                    matched_teller = code.upper()
                    matched_name = info['name']
                    break
            
            if matched_teller:
                print(f"Match Found: SF User '{sf_u['Name']}' (Email: {sf_u['Email']}) maps to PBI Teller: '{matched_teller}' (PBI Name: '{matched_name}')")
                matches += 1
            else:
                print(f"Match Missing: SF User '{sf_u['Name']}' (Email: {sf_u['Email']}) has no matching PBI Teller by email.")
                # Look up by name in teller_to_email as fallback
                fallback_code = None
                for code, info in teller_to_email.items():
                    if name.lower() in info['name'].lower() or info['name'].lower() in name.lower():
                        fallback_code = code.upper()
                        matched_name = info['name']
                        break
                if fallback_code:
                    print(f"  -> But found name fallback: PBI Name '{matched_name}' has Teller Code '{fallback_code}' (email is {info['email']})")
                missing += 1
        else:
            print(f"SF User '{name}' not found.")
            
except Exception as e:
    print("Error:", e)
