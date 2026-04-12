"""Helper formatting functions for customer profiles."""
MEMBER_STATUS = {'A': 'Active', 'X': 'Expired', 'C': 'Cancelled', 'L': 'Lapsed', 'P': 'Pending'}

def _fmt_summary(r: dict) -> dict:
    return {
        'id':           r.get('Id'),
        'name':         r.get('Name'),
        'email':        r.get('PersonEmail'),
        'member_id':    r.get('Account_Member_ID__c'),
        'member_status': r.get('Member_Status__c'),
        'member_status_label': MEMBER_STATUS.get(r.get('Member_Status__c', ''), r.get('Member_Status__c', '')),
        'member_since': r.get('Account_Member_Since__c'),
        'coverage':     r.get('ImportantActiveMemCoverage__c'),
        'region':       r.get('Region__c'),
        'mpi':          r.get('MPI__c'),
        'city':         r.get('BillingCity'),
        'state':        r.get('BillingState'),
    }


def _fmt_account(r: dict, base_url: str = '') -> dict:
    status = r.get('Member_Status__c', '')
    return {
        'id':                    r.get('Id'),
        'name':                  r.get('Name'),
        'email':                 r.get('PersonEmail'),
        'phone':                 r.get('Phone'),
        'birthdate':             r.get('PersonBirthdate'),
        'member_id':             r.get('Account_Member_ID__c'),
        'member_status':         status,
        'member_status_label':   MEMBER_STATUS.get(status, status),
        'member_since':          r.get('Account_Member_Since__c'),
        'coverage':              r.get('ImportantActiveMemCoverage__c'),
        'membership_expiry':     r.get('ImportantActiveMemExpiryDate__c'),
        'insurance_customer_id': r.get('Insuance_Customer_ID__c'),
        'insurance_since':       r.get('FinServ__InsuranceCustomerSince__c'),
        'total_premiums':        r.get('FinServ__TotalHouseholdPremiums__c'),
        'region':                r.get('Region__c'),
        'mpi':                   r.get('MPI__c'),
        'ltv':                   r.get('LTV__c'),
        'address': {
            'street': r.get('BillingStreet'),
            'city':   r.get('BillingCity'),
            'state':  r.get('BillingState'),
            'zip':    r.get('BillingPostalCode'),
        },
        'ers_calls_made':      r.get('ERS_Calls_Made_CP__c'),
        'ers_calls_available': r.get('ERS_Calls_Available_CP__c'),
        'sf_url': f"{base_url}/lightning/r/Account/{r.get('Id')}/view" if base_url else None,
    }


def _fmt_membership(r: dict, base_url: str = '') -> dict:
    parts = [p.strip() for p in (r.get('Name') or '').split(' - ')]
    sf_id = r.get('Id', '')
    return {
        'id':           sf_id,
        'name':         r.get('Name'),
        'level':        parts[1] if len(parts) > 1 else None,
        'member_number': parts[0] if parts else None,
        'status':       r.get('Status'),
        'purchase_date': r.get('PurchaseDate'),
        'expiry_date':  r.get('UsageEndDate'),
        'price':        r.get('Price'),
        'sf_url':       f"{base_url}/{sf_id}" if base_url and sf_id else None,
    }


def _fmt_vehicle(r: dict) -> dict:
    return {
        'id':          r.get('Id'),
        'name':        r.get('Name'),
        'status':      r.get('Status'),
        'vin':         r.get('SerialNumber'),
        'description': r.get('Description'),
    }


def _fmt_opp(r: dict, base_url: str = '') -> dict:
    return {
        'id':           r.get('Id'),
        'name':         r.get('Name'),
        'stage':        r.get('StageName'),
        'amount':       r.get('Amount'),
        'commission':   r.get('Earned_Commission_Amount__c'),
        'close_date':   r.get('CloseDate'),
        'created_date': (r.get('CreatedDate') or '')[:10],
        'record_type':  (r.get('RecordType') or {}).get('Name', 'Other'),
        'destination':  r.get('Destination_Region__c'),
        'trip_id':      r.get('Axis_Trip_ID__c'),
        'owner':        (r.get('Owner') or {}).get('Name'),
        'sf_url': f"{base_url}/lightning/r/Opportunity/{r.get('Id')}/view" if base_url else None,
    }


def _fmt_lead(r: dict, base_url: str = '') -> dict:
    return {
        'id':             r.get('Id'),
        'name':           r.get('Name'),
        'status':         r.get('Status'),
        'is_converted':   bool(r.get('IsConverted')),
        'converted_date': (r.get('ConvertedDate') or '')[:10] or None,
        'created_date':   (r.get('CreatedDate') or '')[:10],
        'record_type':    (r.get('RecordType') or {}).get('Name', 'Other'),
        'owner':          (r.get('Owner') or {}).get('Name'),
        'lead_source':    r.get('LeadSource'),
        'sf_url': f"{base_url}/lightning/r/Lead/{r.get('Id')}/view" if base_url else None,
    }
