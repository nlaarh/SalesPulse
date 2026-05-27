import sys, time
sys.path.insert(0, '/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/backend')
from dotenv import load_dotenv
load_dotenv('/Users/abdennourlaaroubi/Library/CloudStorage/OneDrive-EnProIndustriesInc/AAA/Dev/SalesPulse/.env', override=True)

import cache
import sf_client
sf_client._RATE_LIMIT = 200
from sf_client import sf_query_all
from routers.customer_profile.details import get_customer_profile
from routers.customer_profile.upsell import get_upsell_analysis
from models import User

def test():
    # Find a valid person account in Salesforce to test with
    print("Finding a valid person account...")
    accounts = sf_query_all("SELECT Id, Name FROM Account WHERE IsPersonAccount = true LIMIT 1")
    if not accounts:
        print("No person accounts found!")
        return
    account_id = accounts[0]['Id']
    name = accounts[0]['Name']
    print(f"Testing customer: {name} (ID: {account_id})")

    # Create dummy user for auth dependency
    user = User(email='test@example.com', name='Test User', role='admin')

    # Force cold load
    print("\n--- Cold Load Customer Profile (clearing cache) ---")
    cache.clear_all()
    start = time.time()
    profile = get_customer_profile(account_id, _user=user)
    cold_profile_time = time.time() - start
    print(f"Cold profile load time: {cold_profile_time:.4f} seconds")
    if 'error' in profile:
        print(f"Profile error: {profile['error']}")
        return

    # Warm load
    print("\n--- Warm Load Customer Profile ---")
    start = time.time()
    profile2 = get_customer_profile(account_id, _user=user)
    warm_profile_time = time.time() - start
    print(f"Warm profile load time: {warm_profile_time:.4f} seconds")

    # Cold load AI Upsell (which calls OpenAI API)
    print("\n--- Cold Load AI Upsell (no cached analysis) ---")
    start = time.time()
    upsell = get_upsell_analysis(account_id, _user=user)
    cold_upsell_time = time.time() - start
    print(f"Cold AI Upsell time: {cold_upsell_time:.4f} seconds")
    if 'error' in upsell:
        print(f"AI Upsell error: {upsell['error']}")
    else:
        print(f"AI analysis length: {len(upsell.get('analysis', '') or '')} chars")
        print("\n--- AI Narrative Output ---")
        print(upsell.get('analysis'))

    # Warm load AI Upsell (should read from cache)
    print("\n--- Warm Load AI Upsell ---")
    start = time.time()
    upsell2 = get_upsell_analysis(account_id, _user=user)
    warm_upsell_time = time.time() - start
    print(f"Warm AI Upsell time: {warm_upsell_time:.4f} seconds")
    print(f"AI analysis length: {len(upsell2.get('analysis', '') or '')} chars")

    # Force Refresh AI Upsell
    print("\n--- Force Refresh AI Upsell ---")
    start = time.time()
    upsell3 = get_upsell_analysis(account_id, refresh=True, _user=user)
    refresh_upsell_time = time.time() - start
    print(f"Force refresh AI Upsell time: {refresh_upsell_time:.4f} seconds")

if __name__ == '__main__':
    test()
