import os
import sys

sys.path.insert(0, '.')

# Explicitly load .env
from dotenv import load_dotenv
load_dotenv('.env', override=True)

print("PG_HOST in env:", os.environ.get("PG_HOST"))
print("PG_USER in env:", os.environ.get("PG_USER"))
print("PG_DATABASE in env:", os.environ.get("PG_DATABASE"))

try:
    from database import SessionLocal, engine
    from data.models import User, AdvisorTarget
    print("Database dialect/driver:", engine.url.drivername)
    
    db = SessionLocal()
    user_count = db.query(User).count()
    target_count = db.query(AdvisorTarget).count()
    print("Database connection successful!")
    print(f"  Users in database: {user_count}")
    print(f"  Advisor targets in database: {target_count}")
    
    print("Listing first 5 users:")
    for u in db.query(User).limit(5).all():
        print(f"    - {u.email} ({u.name}, role={u.role})")
        
    db.close()
except Exception as e:
    import traceback
    print("Database connection failed:")
    traceback.print_exc()
