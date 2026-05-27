import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from pbi_utils import pbi_monthly_map, norm_name, overlay_pbi_on_month_map

line = 'Travel'
cy = 2025
py = 2024
name = 'Mamie Cimato'

nk = norm_name(name)
print("Normalized name:", nk)

pbi_cur = pbi_monthly_map(line, f"{cy}-01-01", f"{cy}-12-31")
pbi_pri = pbi_monthly_map(line, f"{py}-01-01", f"{py}-12-31")

print("Keys in pbi_cur:", list(pbi_cur.keys())[:10])
print(f"Mamie in pbi_cur? {nk in pbi_cur}")

if nk in pbi_cur:
    print("Mamie 2025 PBI data:", pbi_cur[nk])
else:
    print("Mamie NOT found in pbi_cur!")

mo_rev_cur_map = {}
overlay_pbi_on_month_map(mo_rev_cur_map, pbi_cur, nk, cy)
print("mo_rev_cur_map after overlay:", sorted(mo_rev_cur_map.values(), key=lambda x: x['mo']))
