import os
import sys
import time

# Add backend to python path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import main
from routers.sales_agent_profile import agent_profile

def test():
    # Warm up / run once to check correctness and compile
    print("Executing agent profile request for 'Mamie Cimato'...")
    t0 = time.time()
    res = agent_profile(name="Mamie Cimato", line="Travel", period=12, ai=False)
    t1 = time.time()
    
    print(f"Request took: {t1 - t0:.3f} seconds")
    print("Keys returned in profile:")
    print(list(res.keys()))
    print("Current Year summary:", res.get('summary'))
    print("Prior Year summary:", res.get('prior'))
    print("YoY deltas:", res.get('yoy'))

if __name__ == "__main__":
    test()
