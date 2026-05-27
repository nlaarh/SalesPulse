import sys
import os
import time

sys.path.insert(0, '.')

from fastapi import HTTPException
import cache

# Bypass cache so we can measure actual execution times
def bypass_cached_query(key, fetch_fn, ttl=1800, disk_ttl=43200):
    print(f"[CACHE] Bypassing cache for key: {key}")
    t0 = time.time()
    res = fetch_fn()
    print(f"  -> fetch completed in {time.time() - t0:.2f}s")
    return res

cache.cached_query = bypass_cached_query

from routers.sales_agent_profile import agent_profile

print("Starting profile query for 'Natalie Herb' (Travel)...")
start_time = time.time()
try:
    # Run with ai=True to check OpenAI call performance
    profile = agent_profile(name="Natalie Herb", line="Travel", period=12, ai=True, start_date=None, end_date=None)
    print("Profile query succeeded in {:.2f}s".format(time.time() - start_time))
    print("Summary:")
    print("  Revenue:", profile['summary']['revenue'])
    print("  Commission:", profile['summary']['commission'])
    print("  Deals:", profile['summary']['deals'])
    print("  Months Count:", len(profile['months']))
except Exception as e:
    import traceback
    print("Profile query failed:")
    traceback.print_exc()
