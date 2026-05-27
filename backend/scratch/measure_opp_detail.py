import sys, time
sys.path.insert(0, '/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend')
from dotenv import load_dotenv
load_dotenv('/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env', override=True)

import cache
from sf_client import sf_query_all
from routers.sales_opportunities import opportunity_detail

def test():
    # Find an open opportunity to test with
    print("Finding a valid open opportunity...")
    opps = sf_query_all("SELECT Id, Name FROM Opportunity WHERE IsClosed = false LIMIT 1")
    if not opps:
        print("No open opportunities found!")
        return
    opp_id = opps[0]['Id']
    name = opps[0]['Name']
    print(f"Testing opportunity: {name} (ID: {opp_id})")

    # Force cold load
    print("\n--- Cold Load (clearing cache) ---")
    cache.clear_all()
    start = time.time()
    res = opportunity_detail(opp_id)
    cold_time = time.time() - start
    print(f"Cold load time: {cold_time:.2f} seconds")
    print(f"AI analysis length: {len(res.get('ai_analysis', ''))}")
    
    # Warm load
    print("\n--- Warm Load ---")
    start = time.time()
    res2 = opportunity_detail(opp_id)
    warm_time = time.time() - start
    print(f"Warm load time: {warm_time:.4f} seconds")
    print(f"AI analysis length: {len(res2.get('ai_analysis', ''))}")

if __name__ == '__main__':
    test()
