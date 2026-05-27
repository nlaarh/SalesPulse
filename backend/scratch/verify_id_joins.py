import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_utils import get_pbi_advisor_id_map, norm_name

try:
    print("--- Testing Travel ID Map ---")
    travel_map = get_pbi_advisor_id_map('Travel')
    print(f"Travel ID Map loaded with {len(travel_map)} mappings.")
    
    test_travel_codes = ["wxmac", "wxkb", "wkagi", "wbjd", "rimb", "wstto", "wxct", "wkapo"]
    for code in test_travel_codes:
        resolved = travel_map.get(code)
        print(f"  Teller Code: {code:8} -> Resolved Name: {resolved} -> Normalized Name Key: {norm_name(resolved) if resolved else None}")
        
    print("\n--- Testing Insurance ID Map ---")
    ins_map = get_pbi_advisor_id_map('Insurance')
    print(f"Insurance ID Map loaded with {len(ins_map)} mappings.")
    
    test_ins_codes = ["dmay", "jdenicola", "kcook", "sjacoby", "kschmidt", "tcory"]
    for code in test_ins_codes:
        resolved = ins_map.get(code)
        print(f"  Epic ID: {code:12} -> Resolved Name: {resolved} -> Normalized Name Key: {norm_name(resolved) if resolved else None}")
        
except Exception as e:
    print("Error:", e)
