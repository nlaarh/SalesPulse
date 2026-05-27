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
    
    print("--- Searching User Fields in Salesforce ---")
    matched = []
    for f in fields:
        name = f.get("name")
        label = f.get("label")
        # Search for interesting fields
        nl = name.lower()
        if any(k in nl for k in ["teller", "code", "producer", "agent", "employee", "number", "id"]):
            matched.append((name, label, f.get("type")))
            
    for name, label, ftype in sorted(matched):
        print(f"  Field: {name} | Label: {label} | Type: {ftype}")
        
except Exception as e:
    print("Error:", e)
