import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

import requests
from sf_client import _get_auth

try:
    token, base = _get_auth()
    url = f"{base}/services/data/v60.0/sobjects/User/describe"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    fields = r.json().get("fields", [])
    
    print("--- Printing ALL Salesforce User Fields ---")
    for f in sorted(fields, key=lambda x: x.get("name")):
        print(f"  Field: {f.get('name'):35} | Label: {f.get('label'):35} | Type: {f.get('type')}")
        
except Exception as e:
    print("Error:", e)
