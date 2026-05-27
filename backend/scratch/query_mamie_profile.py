import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, "/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend")
load_dotenv("/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env", override=True)

from routers.sales_agent_profile import agent_profile

# Clean cache first to ensure we get fresh data
import cache
cache.cached_query = lambda key, fetch_fn, *args, **kwargs: fetch_fn()

print("--- Querying Mamie Cimato 2025 ---")
p25 = agent_profile("Mamie Cimato", line="Travel", period=12, start_date="2025-01-01", end_date="2025-12-31", ai=False)
print("Summary 2025:")
print(f"Revenue: {p25['summary']['revenue']:,.2f}")
print(f"Commission: {p25['summary']['commission']:,.2f}")
print(f"Deals: {p25['summary']['deals']}")
print("Months 2025:")
for m in p25["months"]:
    print(f"  Month {m['month']} ({m['label']}): Revenue={m.get('revenue', 0):,.2f}, Commission={m.get('commission', 0):,.2f}, Leads={m.get('leads', 0)}, Opps={m.get('opps', 0)}")
