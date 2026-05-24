import os
import sys
import io

# Set environment
os.environ['USE_SQLITE'] = '1'
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal, init_db
from models import TargetUpload, AdvisorTarget, User
import bcrypt

# Initialize DB tables
init_db()

db = SessionLocal()

# Add test user
hashed = bcrypt.hashpw(b'testpass123', bcrypt.gensalt()).decode()
user = db.query(User).filter(User.email == 'test@nyaaa.com').first()
if not user:
    user = User(email='test@nyaaa.com', name='Test User', password_hash=hashed, role='superadmin', is_active=True)
    db.add(user)
    db.commit()
else:
    user.role = 'superadmin'
    db.add(user)
    db.commit()

# Add test target upload
upload = db.query(TargetUpload).filter(TargetUpload.filename == '__sf_auto__').first()
if not upload:
    upload = TargetUpload(filename='__sf_auto__', line='Travel', uploaded_by_id=0, uploaded_by_email='system', advisor_count=1)
    db.add(upload)
    db.commit()

# Add test advisor target
adv = db.query(AdvisorTarget).filter(AdvisorTarget.sf_name == 'Ashley Gielow').first()
if not adv:
    adv = AdvisorTarget(
        upload_id=upload.id,
        raw_name='Gielow, Ashley',
        sf_name='Ashley Gielow',
        branch='Amherst',
        title='Sr. Travel Advisor',
        monthly_target=15000.0,
    )
    db.add(adv)
    db.commit()

client = TestClient(app, raise_server_exceptions=True)

# Login to get token
resp = client.post('/api/auth/login', json={'email': 'test@nyaaa.com', 'password': 'testpass123'})
token = resp.json()['token']
headers = {'Authorization': f'Bearer {token}'}

# Mock Power BI call dependencies in pbi_client
import pbi_client
pbi_client.travel_by_advisor_day = lambda sd, ed: [
    {'name': 'Ashley Gielow', 'branch': 'Amherst', 'date': '2026-01-15', 'commission': 1000.0, 'sales': 10000.0},
    {'name': 'Ashley Gielow', 'branch': 'Amherst', 'date': '2026-02-15', 'commission': 2000.0, 'sales': 20000.0},
]
pbi_client.insurance_by_advisor_day = lambda sd, ed: []

import sf_client
sf_client.sf_query_all = lambda q: [
    {'Name': 'Ashley Gielow', 'Title': 'Sr. Travel Advisor'}
]

# Check DB before request
print("DB AdvisorTargets before request:")
for at in db.query(AdvisorTarget).all():
    print(f"  ID: {at.id}, sf_name: {at.sf_name}, title: {at.title}, branch: {at.branch}")

# Run export request
print("Triggering export request...")
res = client.get('/api/targets/monthly/2026/export?line=Travel&base=commission', headers=headers)
print("Status Code:", res.status_code)

# Load workbook from export response
import openpyxl
wb = openpyxl.load_workbook(io.BytesIO(res.content), data_only=True)
ws = wb["All Advisors"]
# Edit a cell
ws.cell(row=2, column=7, value=12500)

# Save back to byte stream
out_buf = io.BytesIO()
wb.save(out_buf)
out_buf.seek(0)

# Run import request
print("Triggering import request...")
files = {
    'file': (
        'Monthly_Targets_Travel_2026.xlsx',
        out_buf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
}
res_import = client.post('/api/targets/monthly/2026/import?line=Travel&base=commission', files=files, headers=headers)
print("Import Status Code:", res_import.status_code)
if res_import.status_code != 200:
    print("Import Error Response:", res_import.text)
