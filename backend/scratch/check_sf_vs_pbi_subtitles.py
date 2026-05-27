import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_client import dax_query, PBI_WS, TRAVEL_DS
from sf_client import sf_query_all

try:
    print("--- Fetching Travel Scorecard Subtitles from PBI ---")
    pbi_rows = dax_query(PBI_WS, TRAVEL_DS, "EVALUATE 'Travel Scorecard Subtitles'")
    print(f"Loaded {len(pbi_rows)} rows from PBI.")
    
    print("\n--- Fetching Active Salesforce Users ---")
    sf_users = sf_query_all("SELECT Id, Name, EmployeeNumber, FederationIdentifier, Epic_ID__c, Username, Alias FROM User WHERE IsActive = true")
    print(f"Loaded {len(sf_users)} active users from SF.")
    
    # Check if there are any matches between PBI 'ID' and SF 'EmployeeNumber'
    pbi_ids = {r.get("Travel Scorecard Subtitles[ID]"): r for r in pbi_rows if r.get("Travel Scorecard Subtitles[ID]")}
    pbi_axis_ids = {r.get("Travel Scorecard Subtitles[Axis ID]"): r for r in pbi_rows if r.get("Travel Scorecard Subtitles[Axis ID]")}
    
    sf_emp_numbers = {u.get("EmployeeNumber"): u for u in sf_users if u.get("EmployeeNumber")}
    sf_federation_ids = {u.get("FederationIdentifier"): u for u in sf_users if u.get("FederationIdentifier")}
    
    print("\n--- Matching PBI ID with SF EmployeeNumber ---")
    matches = 0
    for sf_emp, sf_u in sf_emp_numbers.items():
        if sf_emp in pbi_ids:
            p_row = pbi_ids[sf_emp]
            print(f"Match: SF User '{sf_u['Name']}' (Emp: {sf_emp}) matches PBI Subtitles Name '{p_row['Travel Scorecard Subtitles[Name]']}' (PBI ID: {sf_emp})")
            matches += 1
            
    print(f"Total Matches by ID: {matches}")
    
    print("\n--- Matching PBI Axis ID with SF User Fields ---")
    axis_matches = 0
    for axis_id, p_row in pbi_axis_ids.items():
        # Check if this Axis ID matches any SF User's Alias or Federation ID or Username
        for u in sf_users:
            alias = u.get("Alias") or ""
            username = u.get("Username") or ""
            fed_id = u.get("FederationIdentifier") or ""
            epic = u.get("Epic_ID__c") or ""
            
            # Check if axis_id matches alias, epic, or is a prefix/suffix
            if (axis_id.lower() == alias.lower() or 
                axis_id.lower() == epic.lower() or 
                axis_id.lower() in username.lower() or 
                axis_id.lower() in fed_id.lower()):
                print(f"Match: PBI Axis ID '{axis_id}' (Name: '{p_row['Travel Scorecard Subtitles[Name]']}') relates to SF User '{u['Name']}' (Alias: '{alias}', Epic: '{epic}', Username: '{username}')")
                axis_matches += 1
                
    print(f"Total Matches by Axis ID: {axis_matches}")
    
except Exception as e:
    print("Error:", e)
