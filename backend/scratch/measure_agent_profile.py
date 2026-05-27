import sys, time
sys.path.insert(0, '/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend')
from dotenv import load_dotenv
load_dotenv('/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env', override=True)

import cache
from routers.sales_agent_profile import agent_profile

def test():
    name = "Kevin Bloom"
    line = "Travel"
    cache.clear_all()
    
    # Dates will resolve to trailing 12 months (e.g. 2025-05-24 to 2026-05-24)
    # Let's invalidate cache with matching date keys. We'll find out the resolved dates by running it once first.
    
    print("--- Cold Load ---")
    start = time.time()
    res = agent_profile(name=name, line=line, period=12, start_date=None, end_date=None, ai=True)
    print(f"Cold load time: {time.time() - start:.2f} seconds")
    print(f"AI brief len: {len(res.get('writeup', ''))}")
    
    print("\n--- Verification of Data ---")
    print(f"Name: {res.get('name')}, Line: {res.get('line')}, Email: {res.get('email')}")
    print(f"Current Year: {res.get('current_year')}, Prior Year: {res.get('prior_year')}")
    print("Summary Metrics:")
    for k, v in res.get('summary', {}).items():
        print(f"  {k}: {v}")
    print("Prior Year Metrics:")
    for k, v in res.get('prior', {}).items():
        print(f"  {k}: {v}")
    print("YoY Metrics:")
    for k, v in res.get('yoy', {}).items():
        print(f"  {k}: {v}")
    print(f"Months count: {len(res.get('months', []))}")
    print(f"Top opportunities count: {len(res.get('top_opportunities', []))}")
    print(f"Won opportunities count: {len(res.get('won_opportunities', []))}")
    print("Team averages:")
    for k, v in res.get('team', {}).items():
        print(f"  {k}: {v}")
    print(f"Strengths: {res.get('strengths')}")
    print(f"Improvements: {res.get('improvements')}")
    print(f"Tasks: {len(res.get('tasks', {}).get('open_tasks', []))} open, completion rate: {res.get('tasks', {}).get('stats', {}).get('completion_rate')}%")

    print("\n--- Warm Load (with existing code) ---")
    start = time.time()
    res2 = agent_profile(name=name, line=line, period=12, start_date=None, end_date=None, ai=True)
    print(f"Warm load time: {time.time() - start:.2f} seconds")

if __name__ == '__main__':
    test()
