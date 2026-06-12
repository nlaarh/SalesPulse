# SalesInsight — Sales Analyst Knowledge Base

> Authoritative reference for AAA WCNY Salesforce schema, business rules, data quality, and cross-sell analysis.
> Updated: 2026-04-12

---

## 1. Opportunity Record Types

| Record Type | RT ID | 2025 Won Opps | 2025 Revenue | Has Amount? | Notes |
|---|---|---|---|---|---|
| **Travel** | `012Pb0000006hIjIAI` | 14,115 | $45.9M | ✅ Yes | Core travel booking revenue |
| **Insurance** | `012Pb0000006hIgIAI` | 9,991 | $11.9M | ✅ Yes | Personal lines (auto, home, etc.) |
| **Medicare** | `012Pb0000006hIhIAI` | 1,595 | $0 | ❌ Always null | Referral-based, no revenue tracked |
| **Financial Services** | `012Pb0000006hIfIAI` | 0 | — | — | Record type exists but **no opps** since 2024 |
| **Membership Services** | `012Pb0000006hIiIAI` | 0 | — | — | Record type exists but **no opps** since 2024 |
| **Driver Programs** | `012Pb0000006hIdIAI` | 3 (New) | — | — | Negligible volume |
| General | `012Pb0000006AjZIAU` | — | — | — | Not used for sales |
| Retirement Planning | `012Pb0000006AjaIAE` | — | — | — | Not used for sales |
| Opportunity (Wallet Share) | `012Pb0000006AjbIAE` | — | — | — | Not used for sales |

**Key takeaway**: Only **Travel**, **Insurance**, and **Medicare** have meaningful sales data.

---

## 2. Stage Definitions

### Travel Stages
| Stage | 2025 Count | Notes |
|---|---|---|
| Closed Won | 16,064 | Revenue recognized |
| Invoice | 6,747 | **Travel-only stage** — also counts as won revenue |
| Closed Lost | 9,098 | |
| Quote | 306 | Active pipeline |
| Qualifying/Research | 191 | Early pipeline |
| Booked | 35 | Intermediate stage |
| New | 19 | |

**Won filter**: `StageName IN ('Closed Won', 'Invoice')` — Invoice is Travel-only.

### Insurance Stages
| Stage | 2025 Count | Notes |
|---|---|---|
| Closed Won | 12,997 | Revenue recognized |
| Closed Lost | 15,292 | High loss rate |
| Quote | 2,194 | Active pipeline |
| New | 711 | |
| Qualifying/Research | 69 | |

**No Invoice stage** for Insurance. Won = `Closed Won` only.

### Medicare Stages
| Stage | 2025 Count | Notes |
|---|---|---|
| Closed Won | 1,666 | Enrollment completed |
| New | 909 | |
| Closed Lost | 250 | |
| Quote | 85 | |
| Qualifying/Research | 32 | |

**SOA (Scope of Appointment)**: `SOA_Completed__c` — Yes: 2,746, No: 946 (since 2024). Required before Medicare sales discussion.

### Medicare Agents (2025)
Only **4 agents** sell Medicare:
- David Kamholz: 754 won
- Sam Bacher: 508 won
- Shawn Cutler: 357 won
- Alyssa McGovern: 47 won

---

## 3. Opportunity Type Field

Values on won opps (2025):
| Type | Travel Count | Insurance Count | Meaning |
|---|---|---|---|
| NWQ | 28,141 (all RTs) | 11,184 | New quote/business |
| REW | 1,826 | 1,803 | Rewrite/re-quote |
| REN | 759 | 9 | Renewal |
| RIS | 1 | 1 | Reinstatement |

---

## 4. Key Opportunity Fields

| Field | Type | Groupable | Filterable | Notes |
|---|---|---|---|---|
| `Amount` | currency | ❌ | ✅ | Trip/policy revenue. Always add `Amount != null` for SUM |
| `CloseDate` | date | ✅ | ✅ | **No** `T00:00:00Z` suffix |
| `CreatedDate` | datetime | ❌ | ✅ | **Requires** `T00:00:00Z` suffix |
| `RecordTypeId` | reference | ✅ | ✅ | Use RT IDs, not RecordType.Name for perf |
| `Destination_Region__c` | picklist | ✅ | ✅ | **Travel only**. Top: US (9,678), Caribbean (2,066), Europe (1,171) |
| `Number_Traveling__c` | double | ❌ | ✅ | **Formula field**, not groupable. Travel only. |
| `Axis_Trip_ID__c` | string | ✅ | ✅ | **Travel only**. Format: "13*1077564". No matching FK on Insurance. |
| `Earned_Commission_Amount__c` | currency | ❌ | ✅ | Commission earned on the deal |
| `SOA_Completed__c` | picklist | ✅ | ✅ | **Medicare only**. Values: Yes, No, null |
| `Description` | textarea | ❌ | ❌ | **Cannot filter in WHERE** |
| `PushCount` | int | ✅ | ✅ | Times close date was pushed back |
| `ForecastCategoryName` | picklist | ✅ | ✅ | Pipeline, Best Case, Commit, Closed, Omitted |

---

## 5. Account (Person Account) Fields — Membership & Demographics

### Membership Tier (`ImportantActiveMemCoverage__c`)
**NOT groupable** — must use individual COUNT queries or bulk extract + Python aggregation.

| Tier | Active Members (A + expiry, WCNY) | Upgrade Target |
|---|---|---|
| B (Basic) | ~194K | → PLUS |
| PLUS | ~406K | → PREMIER |
| PREMIER | ~117K | Top tier |
| **Total (B/PLUS/PREMIER)** | **~717K** | |

*Counts as of 2026-04-12, filtered by PersonAccount + Status A + expiry >= TODAY + WCNY region.*
**Membership hierarchy**: B → PLUS → PREMIER.
Other coverage values exist (PLRV, etc.) but are excluded from Territory Map's active member count.

### Membership Status (`Member_Status__c`)
| Status | Count | Meaning |
|---|---|---|
| A | 842,363 | Active |
| X | 252,925 | Cancelled |
| L | 13,623 | Lapsed? |
| S | 12,774 | Suspended? |
| B | 9,432 | ? |
| C | 6,267 | ? |
| P | 962 | Pending? |

### Membership Expiry (`ImportantActiveMemExpiryDate__c`)
- **5,664** memberships expiring Q2 2025 (Apr–Jun)
- **2,183** already expired (past due as of Apr 10, 2025)
- Filterable by date range — excellent for renewal campaigns

### Member Since (`Account_Member_Since__c`)
- Date field, available on most accounts
- Useful for tenure-based analysis (long-term members more likely to buy services)

### LTV Tier (`LTV__c`)
| Tier | Count | Notes |
|---|---|---|
| A (highest) | 497,934 | Best customers |
| B | 220,338 | |
| C | 144,524 | |
| D | 102,128 | |
| E (lowest) | 26,626 | |
| *N variants | ~93K total | "New" segment (C\*N=52K, D\*N=18.5K, B\*N=15.5K, A\*N=5K, E\*N=2.5K) |

**LTV is a picklist tier (A=best, E=lowest), NOT a dollar amount.**

### Age / Birthdate (`PersonBirthdate`)
- Available on person accounts, date field
- **286,381** active members age 65+ (Medicare-eligible)
- **~14,880** active members turning 65 within next year (born Apr 2060–Apr 2061)
- **92,290** active members age 64–69 (near-Medicare)

### Sorting Limitation (Person Accounts)
**`Name` and `LastName` cannot be used in ORDER BY** on Person Account queries. SF returns: "field 'Name' can not be sorted in a query call". Use `CreatedDate` or omit ORDER BY entirely.

### BillingPostalCode Stores Zip+4
`BillingPostalCode` often contains zip+4 format (e.g. "14221-3456"). Use `LIKE '14225%'` instead of `= '14225'` for zip-level filtering.

### Other Account Fields
| Field | Type | Groupable | Notes |
|---|---|---|---|
| `ImportantActiveMemCoverage__c` | string | ❌ | Formula/derived — filter-only |
| `ImportantActiveMemStatus__c` | string | ❌ | Formula/derived — filter-only |
| `ImportantActiveMemExpiryDate__c` | date | ✅ | Expiry date — great for renewal |
| `MPI__c` | double | ❌ | Member Product Index — not groupable |
| `FinServ__CustomerSegment__c` | multipicklist | ❌ | Not groupable |
| `Member_Type__pc` | picklist | ✅ | HNR=17K, EMP=760, MIL=698, FAC=104 |
| `Club_Code__c` | string | ✅ | Club affiliation |
| `PersonEmail` | email | ✅ | For contact purposes |
| `PersonMobilePhone` | phone | — | |

---

## 6. Cross-Sell Dimensions — What's Actually Possible

### ✅ Dimension 1: Travel → Insurance (IMPLEMENTED)
**Signal**: Travel customer has no insurance purchase within ±30 days of trip CloseDate.
**Data quality**: RELIABLE. Match by AccountId + CloseDate proximity.
**Enhancement opportunities**:
- International trips (non-US destination) need insurance more urgently
- Higher `Number_Traveling__c` = more people at risk
- Higher `Amount` = bigger financial exposure
- Destination risk: Caribbean, Europe, Asia > domestic US

### ✅ Dimension 2: Membership Upgrade (NEW — BUILDABLE)
**Signal**: Active member at B or PLUS tier who has recent travel spend or high LTV.
**Data quality**: RELIABLE. `ImportantActiveMemCoverage__c` is filterable.
**Logic**:
- B members (217K) with travel bookings → pitch PLUS (travel benefits)
- PLUS members (446K) with high spend or LTV A/B → pitch PREMIER
- Cross-reference with `ImportantActiveMemExpiryDate__c` for timing (near renewal = best time)

### ✅ Dimension 3: Medicare Eligibility (NEW — BUILDABLE)
**Signal**: Active member with `PersonBirthdate` putting them at age 64–65 who has no Medicare opp.
**Data quality**: RELIABLE. Birthdate is clean, Medicare RT has real data.
**Logic**:
- Members turning 65 within next 12 months (~15K/year)
- Cross-reference against existing Medicare opps by AccountId
- Exclude members who already have a Medicare opp (won or open)
- Route to Medicare team (4 agents only)
- **SOA_Completed__c** tracks if compliant discussion happened

### ⚠️ Dimension 4: Membership Renewal / Lapse Prevention (BUILDABLE — needs validation)
**Signal**: Membership expiring in next 30/60/90 days or already expired.
**Data quality**: PARTIAL. Expiry dates look clean but unclear if membership renewal is tracked via Opportunity or external system.
**Concern**: Membership Services RT has ZERO opps — renewals may happen outside Salesforce.

### ⚠️ Dimension 5: Insurance → Travel (WEAK — low priority)
**Signal**: Insurance customer who has never booked travel.
**Data quality**: RELIABLE data but WEAK business signal — not all insurance customers want travel.
**Logic**: Could identify high-LTV insurance-only customers for travel marketing, but low conversion expectation.

### ❌ Dimension 6: Financial Services / Retirement (NOT BUILDABLE)
**No data**. Financial Services and Retirement Planning RTs have zero opportunities.

---

## 7. SOQL Constraints & Gotchas

### Cannot GROUP BY
- `ImportantActiveMemCoverage__c` (string formula)
- `ImportantActiveMemStatus__c` (string formula)
- `MPI__c` (double, not groupable)
- `FinServ__CustomerSegment__c` (multipicklist)
- `Number_Traveling__c` (formula field)
- `Amount` (currency — use SUM() or filter, not GROUP BY)

### Cannot Filter
- `Description` (textarea) — cannot use in WHERE clause

### SOQL Doesn't Support
- `COUNT(DISTINCT field)` — must GROUP BY + count in Python
- Subquery on same object in WHERE: `Opportunity WHERE AccountId IN (SELECT AccountId FROM Opportunity...)` **fails** with "inner and outer selects should not be on same object type"
- Workaround: two-step query — fetch IDs first, then use IN clause with literals

### Date Field Types
- `CloseDate`, `ConvertedDate`, `ImportantActiveMemExpiryDate__c` = **Date** → no `T00:00:00Z`
- `CreatedDate`, `LastModifiedDate` = **DateTime** → requires `T00:00:00Z`

### Won Stage Logic
```
Travel: StageName IN ('Closed Won', 'Invoice')  — Invoice is Travel-only
Insurance: StageName = 'Closed Won'             — no Invoice stage
Medicare: StageName = 'Closed Won'              — no Invoice stage
```

### Revenue Gotchas
- Medicare `Amount` is always null/$0 — referral-based, no revenue tracked in SF
- Always add `Amount != null` when using `SUM(Amount)`
- Always add `CloseDate <= {end_date}` on revenue/won queries
- Insurance naming: "LastName - IN - Personal Lines - YYYY-MM-DD"
- Travel naming: "LastName - TR - Destination - YYYY-MM-DD"

---

## 8. Insurance Opp Naming Pattern

Format: `{LastName} - IN - Personal Lines - {YYYY-MM-DD}`

Insurance Type distribution (2025 won):
- NWQ (New Quote): 11,184 (86%)
- REW (Rewrite): 1,803 (14%)
- REN (Renewal): 9
- RIS (Reinstatement): 1

**No trip-to-insurance FK exists.** Travel opps have `Axis_Trip_ID__c` but insurance opps don't reference it. Match by AccountId + date proximity only.

---

## 9. Travel Destinations (2025 Won)

| Destination | Count | Insurance Priority |
|---|---|---|
| United States | 9,678 | Low (domestic) |
| Caribbean | 2,066 | **HIGH** (international) |
| Europe | 1,171 | **HIGH** (international) |
| Mexico | 296 | **HIGH** (international) |
| Canada | 291 | Medium |
| Walt Disney World | 282 | Low (domestic) |
| Italy | 281 | **HIGH** |
| Hawaii | 212 | Medium (domestic but remote) |
| Bahamas | 184 | **HIGH** |
| Ireland | 152 | **HIGH** |
| Alaska | 140 | Medium |
| European River Cruise | 125 | **HIGH** |
| Asia | 104 | **HIGH** |
| France | 98 | **HIGH** |
| Great Britain | 87 | **HIGH** |

**International trips have higher insurance cross-sell value.** ~5,000 international trips in 2025 are primary cross-sell targets.

---

## 10. Repeat Travel Customers

Heavy travelers exist — top accounts have 10-19 trips in 2025 alone.
These high-frequency travelers are:
- Prime candidates for PREMIER membership upgrade
- Prime candidates for annual travel insurance policies (vs. per-trip)
- High LTV customers to protect

---

*Last updated: 2026-06-11. Update this file when new data patterns, field behaviors, or business rules are discovered.*

---

## 11. Active Member Filtering

**Critical**: The `Account` table contains ALL accounts including expired/cancelled memberships.
Unfiltered count: **~1,182,000**.

### Territory Map — Active Members (~716K)
The Territory Map uses the strictest definition for "active member with a real membership":
```sql
IsPersonAccount = true
AND Member_Status__c = 'A'
AND ImportantActiveMemExpiryDate__c >= TODAY
AND ImportantActiveMemCoverage__c IN ('B','PLUS','PREMIER')
AND Out_of_Territory_Member__c = false
```

This filters for:
- **PersonAccount only** — excludes business accounts
- **Status A** — active membership status
- **Non-expired** — membership expiry date in the future
- **Known tier** — Basic, Plus, or Premier (excludes null/unknown coverage)
- **In-territory** — excludes out-of-territory members

### Why this filter matters (tested 2026-04-12)
| Filter Combination | Count | Notes |
|---|---|---|
| Status A OR future expiry | 874K | Over-counts: includes non-A with future expiry |
| Status A only | 808K | Too broad: includes null-coverage & OOT |
| Status A AND expiry | 753K | Better: but includes null-coverage & OOT |
| **A + expiry + tiers + not OOT** | **~716K** | **Best: real members with known plans, in-territory** |
| Primary household only | 442K | Under-counts: excludes associate/family members |

### Insurance Customer Filter (~25K)
Insurance customers must also have active membership:
```sql
Insuance_Customer_ID__c != null AND Member_Status__c = 'A'
```
Without the `Member_Status__c = 'A'` filter, count inflates to ~43K (includes lapsed/cancelled members).

### Key Account Fields for Filtering
| Field | Type | Groupable | Notes |
|---|---|---|---|
| `Is_Primary_Account_Through_Membership_c__c` | boolean | ✅ | Household primary account (442K of 753K) |
| `Out_of_Territory_Member__c` | boolean | ✅ | Members outside WCNY territory |
| `ImportantActiveMemCoverage__c` | string | ❌ | Tier: B, PLUS, PREMIER (not groupable) |
| `Important_Active_Membership__c` | reference | ✅ | FK to membership record |
| `Primary_Account_Through_Membership__c` | reference | ✅ | FK to primary account |
| `ImpotantActiveMemNumberId__c` | string | ✅ | Member number |

### Member_Status__c values
| Status | Count | Meaning |
|--------|-------|---------|
| A | ~808K | Active |
| X | ~237K | Cancelled/expired |
| L | ~14K | Lapsed |
| S | ~12K | Suspended |
| B | ~9K | Unknown (billing?) |
| C | ~6K | Unknown |
| P | ~1K | Pending |
| null | ~97K | No status set |

---

## 12. Territory Map Data Architecture

### ZIP+4 Normalization (CRITICAL)
Insurance opportunities in Salesforce use ZIP+4 format (e.g., "14211-2506") for ~92% of records.
Travel opportunities and Account records use standard 5-digit zips.

**Always normalize to 5-digit**: `zip[:5]` and aggregate values when multiple ZIP+4 entries map to the same 5-digit zip.

Without normalization, ~86% of insurance revenue ($3.19M of $3.7M) is invisible because
ZIP+4 keys don't match 5-digit Account zip lookups.

### Member / Customer Totals — Dedicated COUNT Queries Required
SOQL `GROUP BY` with `LIMIT 2000` + `HAVING COUNT(Id) >= N` misses the long tail.
ZIP+4 fragmentation creates ~208K distinct postal codes in Accounts.

**Critical**: Totals for members, insurance customers, and travel customers MUST use
dedicated `SELECT COUNT(Id)` queries (no GROUP BY / HAVING / LIMIT). Summing the grouped
per-zip results will severely undercount (~209K instead of ~716K for members).

The grouped queries are only for per-zip map display. Current threshold: `MIN_MEMBERS = 10`.

### Operating Regions
Three regions: Western, Rochester, Central.
Filter: `Billing_Region__c IN ('Western','Rochester','Central')`

### County Boundaries
26 counties in AAA WCNY territory. GeoJSON polygons stored in `geo_counties` table.
Total polygon data: ~19KB (very lightweight). County boundaries loaded once and cached 1 hour.

---

## 13. Census / Demographic Data

### Data Source
US Census Bureau ACS (American Community Survey) via census.data.gov API.
Seeded into SQLite tables: `geo_counties` (26 rows), `geo_zips` (1,107 rows).

### Seed Data Files (in `backend/seed_data/`)
- `census_counties.json` — 26 NY counties with boundaries + demographics
- `census_zips.json` — 1,107 NY zip codes with demographics + centroids

These JSON files are the source of truth for restoring census data after a fresh deployment.
Run `seed_geodata.py` or the admin "Refresh Census Data" action to re-seed.

### Fields Available
| Field | Description | Source |
|-------|-------------|--------|
| population | Total population | ACS |
| pop_18plus | Adult population (18+) | ACS |
| median_income | Median household income ($) | ACS |
| median_age | Median age | ACS |
| housing_units | Total housing units | ACS |
| median_home_value | Median home value ($) | ACS |
| college_educated | Bachelor's degree or higher (25+) | ACS |
| county_name | County name | ACS/FIPS lookup |
| geojson | County boundary polygon (GeoJSON) | Census TIGER/Line |

### Market Share Calculation
```
Market Share % = (AAA Active Members in zip / Census Population in zip) × 100
```
Uses active member filter (Section 11) for accurate numerator.

---

## 14. Power BI Data Sources

### Access
- **Service principal**: `85f2ef18-703b-4b5f-9b7f-09d93b703217`
- **Workspace**: `019c6471-5f67-4838-970b-35b186425c78` — "Business Intelligence Datasets"
- All datasets listed below are in that single workspace.
- Auth: client_credentials flow, scope `https://analysis.windows.net/powerbi/api/.default`
- Constants live in `backend/pbi_client.py`

### Dataset Catalog

| Line | Dataset Name | Constant | ID | Purpose |
|---|---|---|---|---|
| Travel | BI Dataset - Travel Scorecard | `TRAVEL_DS` | `5c60c1bf` | **Advisor performance** — commission, gross sales, branch. Currently wired to all advisor endpoints. |
| Travel | BI Dataset - Travel Transactions | `TRAVEL_TRANSACTIONS_DS` | `e03a823a` | Raw booking-level transactions. More granular than Scorecard. Has historical data from 2022-2025. |
| Insurance | BI Dataset - Insurance Transactions Invoices | `INSURANCE_DS` | `2e3c94a1` | **Advisor performance** — commission, premium, branch. Currently wired to all advisor endpoints. |
| Insurance | BI Dataset - Insurance Comprehensive v3 | `INSURANCE_COMPREHENSIVE_DS` | `61c03e69` | Full book of business view. Also used by "Insurance Daily Report v2". Not yet wired. |
| Membership | BI Dataset - Membership Comprehensive | `MEMBERSHIP_DS` | `d7cdf3bc` | Two key tables: **Membership Consolidated** (current state snapshot) and **Membership Transactions** (transaction history). Not yet wired. |

> [!NOTE]
> **Dataset Temporal Scope Mismatch**:
> - `TRAVEL_DS` (Travel Scorecard) only contains data for calendar years **2024 and 2025** (2022 and 2023 queries return empty/null).
> - `TRAVEL_TRANSACTIONS_DS` (Travel Transactions) contains full historical transaction data from **2022 to 2025** (4 full years). Always query `TRAVEL_TRANSACTIONS_DS` when historical trend analysis prior to 2024 is needed.


### Table / Column Reference

**Travel Scorecard** (`TRAVEL_DS`) — table: `Travel Transactions f transformed`
| Column | Type | Notes |
|---|---|---|
| `Primary Advisor Full Name` | text | Advisor name |
| `Primary Advisor Branch Name` | text | Branch |
| `Primary Advisor Teller Code` | text | Advisor code |
| `Invoice Date` | date | Transaction date. Use `DATE(y,m,d)` in DAX filters. |
| `Revenue Club Commission Amount` | decimal | Commission earned |
| `Gross Sales Amount` | decimal | Gross trip value (bookings) |

**Insurance Transactions Invoices** (`INSURANCE_DS`) — table: `insurance_transactions_f`
| Column | Type | Notes |
|---|---|---|
| `inserted_by_name` | text | Advisor name |
| `branch_name` | text | Branch |
| `invoice_date_generation` | date | Transaction date |
| `transaction_type` | text | RENB, ENDT, NEWB, CANC, REIN, REWR, AUDI |
| `commission_amount` | decimal | Commission (RENB+ENDT have commission; NEWB=$0) |
| `transaction_amount` | decimal | Premium written |
| `assoc_job_title_grps` | text | **Always filter**: `= "Insurance Advisors"` to get AAA staff only |

**Insurance transaction type reference:**
| Type | Meaning | Has Commission? |
|---|---|---|
| RENB | Renewal | ✅ Yes — primary commission source |
| ENDT | Endorsement (policy change) | ✅ Yes |
| NEWB | New Business | ❌ No ($0 commission in this table) |
| CANC | Cancellation | ⚠️ Commission stored POSITIVE even when premium negative (verified 2026-06-11, all sampled rows ≥ 0). Raw sum across all types ($6.8M for 2025) matches the strategic appendix's ~$7–8M commission figure — so SUM as-is, do NOT flip CANC sign. |
| REIN | Reinstatement | ✅ Small |
| REWR | Rewrite | ✅ Small |

**Official 2025 figures (validated vs board docs + M365 Copilot, 2026-06-11):**
| Metric | Value | Source |
|---|---|---|
| Travel commission | $14.37M | PBI Travel Scorecard = board decks (~$14.4M) ✅ |
| Travel gross sales | $109.7M | PBI = board (~$110M) ✅. Both travel PBI datasets agree exactly. |
| Insurance commission (all staff) | $6.82M | PBI insurance_transactions_f, NO job-title filter. Strategic appendix: ~$7–8M ✓ |
| Insurance commission (Insurance Advisors only) | $4.05M | The app's `assoc_job_title_grps="Insurance Advisors"` filter — advisor production subset, NOT division revenue |
| Insurance written premium (period, all staff) | $67.0M | PBI transactions. Board summit forecast said $63M. |
| Board-book "Members Insurance" revenue 2025 | $9,901,214 | Board Book 02.03.26 — includes commission + other income (contingents/fees) beyond the transaction file |
| ❌ "$14M insurance commission" | WRONG | Appears in AAA_WCNY_Strategic_Appendix / Path_To_114M draft (AXIS GL 2.47xx incl. Epic + bulk carriers). Same appendix elsewhere says $7–8M. Never cite $14M. |

**Revenue semantics (agency business model):** AAA WCNY is an *agency* — revenue = COMMISSION for both lines. Travel gross sales and insurance written premium are production volume, not revenue. Any UI field labeled "revenue" must map to commission.

**Insurance TWO revenue streams (validated 2026-06-12 vs board FS + Copilot):**
1. **Policy commission** (writing/servicing) — lives in PBI `insurance_transactions_f` (all staff, no job filter)
2. **Carrier income** (contingent commission, profit share, CSAA/Plymouth Rock/Progressive bulk payments) — lives ONLY in AXIS GL 2.47xx accounts (Internal Audit - Finance dataset `94427963`, GLT_HISTORY + GLT_HISTORY_LINE joined on GLTRAN; FISCAL_PERIOD format "MAR16"). NOT in any transaction-level PBI dataset.

| Year | PBI policy commission | Board FS total insurance revenue | Implied carrier income |
|---|---|---|---|
| 2023 | $5.86M | ~$7.0M (Strategic Plan Rev 4) | ~$1.1M |
| 2024 | $6.73M | $8,018,446 (2025-AAA-Draft-FS) | ~$1.3M |
| 2025 | $6.82M | $9,901,214 (2025-AAA-Draft-FS / Board Book 02.03.26) | ~$3.1M |

- PBI commission + carrier income ≈ board revenue, every year. The model holds.
- The "$12–14M" in strategy drafts = blended/gross GL 2.47xx view incl. accrual reversals — NOT the official number. AXIS GL 2.47xx is unreliable for 2025+ (DR-only entries, migration artifact).
- App KPI design: "Commission (policy)" from transactions is live/monthly; "Total insurance revenue" ($9.9M) is a finance-only yearly figure — no live PBI feed exists (Executive KPIs dataset has Merged GLTran tables for Membership/Travel/CreditCard but NOT Insurance).

**Membership Comprehensive** (`MEMBERSHIP_DS`) — two tables:
- `Membership Consolidated` — current state of all memberships (snapshot). Use for counts, tier distribution, active member analysis.
- `Membership Transactions` — history of membership transactions (joins, renewals, upgrades, cancellations). Use for trend/activity analysis.
- Schema not yet explored. Run `COLUMNSTATISTICS()` DAX query before building any endpoint.

---

## 15. Power BI Query Design

### The SUMMARIZE vs SUMMARIZECOLUMNS Problem

**Problem discovered 2026-05-22**: The PBI `executeQueries` REST API returns `None` for all text column values when using `SUMMARIZE` or `GROUPBY`. Numeric measures aggregate correctly but the group-by text columns are blank.

```python
# BROKEN — returns rows but all name/branch values are None
EVALUATE
SUMMARIZE(
    'Travel Transactions f transformed',
    'Travel Transactions f transformed'[Primary Advisor Full Name],
    "commission", SUM(...)
)
# Result: {"[Primary Advisor Full Name]": None, "[commission]": 47086.0}
```

**Solution**: Use `SUMMARIZECOLUMNS` (a different DAX function). Fully supported via `executeQueries` as of June 2024. Returns correct text + numeric aggregations.

```python
# CORRECT — returns pre-aggregated rows with text columns populated
EVALUATE
SUMMARIZECOLUMNS(
    'Travel Transactions f transformed'[Primary Advisor Full Name],
    'Travel Transactions f transformed'[Primary Advisor Branch Name],
    FILTER(ALL('Travel Transactions f transformed'),
        'Travel Transactions f transformed'[Invoice Date] >= DATE(2026,4,1) &&
        'Travel Transactions f transformed'[Invoice Date] <= DATE(2026,4,30)
    ),
    "commission", SUM('Travel Transactions f transformed'[Revenue Club Commission Amount]),
    "sales",      SUM('Travel Transactions f transformed'[Gross Sales Amount]),
    "txns",       COUNTROWS('Travel Transactions f transformed')
)
ORDER BY [commission] DESC
```

**Row key format**: Columns appear as `TableName[ColumnName]` (no brackets around table). Measures appear as `[measure_name]`.
```python
row["Travel Transactions f transformed[Primary Advisor Full Name]"]  # text column
row["[commission]"]                                                    # measure
```

### Filter Pattern for Date + Extra Conditions

The `extra_filter` goes **inside** the `FILTER(ALL(...), ...)` clause alongside the date filter:
```dax
FILTER(ALL('table'),
    'table'[date_col] >= DATE(...) &&
    'table'[date_col] <= DATE(...) &&
    'table'[extra_col] = "value"       -- extra filter appended with &&
)
```

### Data Volume — Why This Matters

| Query type | Old approach (raw rows) | New approach (SUMMARIZECOLUMNS) | Reduction |
|---|---|---|---|
| Leaderboard — Travel | ~11,000 rows/month | 151 rows (1 per advisor) | 70× |
| Leaderboard — Insurance | 4,724 rows/month | 41 rows (1 per advisor) | 115× |
| YoY full year — either line | ~50,000+ rows | ~140 rows (1 per day) | 350× |
| Branch monthly — Travel | ~44,000 rows | ~300 rows (branch+day) | 150× |

### Generic Query Builders in pbi_client.py

Three generic functions handle all aggregation patterns. Pass table/column names; they build the DAX and normalize the response:

| Function | Groups by | Use for |
|---|---|---|
| `_by_advisor(ws, ds, table, ...)` | name + branch | Leaderboard |
| `_by_day(ws, ds, table, ...)` | date | Summary totals, YoY, trend |
| `_by_branch_day(ws, ds, table, ...)` | branch + date | Branch tab |

Line-specific wrappers (`travel_by_advisor`, `insurance_by_day`, etc.) call these with the correct constants.

### What Doesn't Work via executeQueries

- `SUMMARIZE` — text column values come back `None`
- `GROUPBY` — same problem
- `INFO.TABLES()` — error code 3239575574 (not supported)
- MDX queries — not supported, DAX only
- Row limit: 100,000 rows or 1,000,000 values per query (whichever comes first)

### Schema Discovery

When exploring a new dataset, use `COLUMNSTATISTICS()`:
```dax
EVALUATE COLUMNSTATISTICS()
```
Returns all tables and columns with cardinality. Use this before building any new endpoint.
Then pull 20 sample rows with `SELECTCOLUMNS + FILTER` to verify column meanings.


---

## 15. Lead Funnel & Conversion

### Record Types
- **Travel Leads**: `012Pb0000006hIdIAI`
- **Insurance Leads**: `012Pb0000006hIbIAI`
- **Financial Services Leads**: `012Pb0000006hIaIAI`
- **Drivers Programs Leads**: `012Pb0000006hIZIAY`

### Key Fields on Leads Table
- `Id`: Lead ID (used for Salesforce links: `https://aaawcny.my.salesforce.com/{Id}`).
- `Name`: Full name of the lead.
- `Status`: Lead status (e.g., `New`, `Working`, `Contacted`, `Converted`, `Expired`).
- `LeadSource`: Source channel (e.g., `Web`, `Direct Mail`, `Referral`).
- `CreatedDate`: Date and time the lead was created.
- `OwnerId`: Used to join with `User` mapping to get owner name.
- `IsConverted`: Boolean indicating if the lead has been converted to an opportunity.
- `ConvertedDate`: Date when the lead was converted.
- `ConvertedOpportunityId` / `ConvertedOpportunity.Name` / `ConvertedOpportunity.Amount`: Details about the opportunity spawned from conversion.

### Agent Whitelist Filter
When querying leads for dashboards and drilldown reports, always filter the results to only include leads owned by active sales agents matching the division (`Travel` or `Insurance`). If the owner field is null or not found in the user list, the lead is preserved by default to catch unassigned web/queue leads.

---

## 9. Membership Renewal Rate (PBI / MCR Transactions)

**Correct formula — MCR transactions only, no Epic/consolidated data:**

  Renewal Rate = PAY / (PAY + ADD + CAN)

Where all three codes come from `membership_transactions` filtered to YTD with `business_date` range.

- PAY = renewal payments
- ADD = new member acquisitions  
- CAN = cancellation transactions (only 2,752 YTD — much lower than consolidated which has 160,535 AXIS migration artifacts)

**2026 YTD result**: 343,842 / 387,654 = **88.7%**
**2025 same period**: 346,852 / 390,739 = **88.8%**

### Why NOT to use membership_consolidated for attrition:
- `membership_consolidated` has 206,211 cancellation records YTD
- 160,535 of them are `"CANCEL LEGACY AXIS SUSPENDS CANCELLING PRE-SALESFORCE"` — a one-time migration artifact from the AXIS legacy system (Epic data)
- Only 45,676 are real cancellations (27,103 lapsed + 18,573 explicit)
- If you use consolidated without filtering, attrition is inflated 3.5×

### Membership Transaction Codes:
- `ADD` = new member acquisition
- `PAY` = renewal payment
- `CAN` / `CANC` / `CXL` = explicit cancellation
- `LPS` = lapse (90-day non-renewal) — may appear but low volume in transactions; lapses also tracked in consolidated

### PBI Dataset:
- Dataset ID: `d7cdf3bc-dcf4-48ed-b4bb-200563dcfd7f`
- Tables: `membership_transactions` (SOURCE=MCR, 5.27M rows), `membership_consolidated` (2.23M rows incl. cancelled)
- Channel field: `membership_transactions[membership_sales_source_desc]`
- Renewal rate uses transactions only — avoids Epic/AXIS contamination in consolidated

### Top Sales Channels (2026 YTD by renewals):
1. Branch / Walk-in: 74,015 renewals, 3,210 new, $6.8M revenue
2. Call Center: 47,701 renewals, 6,009 new, $4.9M revenue
3. Digital / Online: 42,265 renewals, 4,286 new, $3.3M revenue
4. Associate Add-on: 30,446 renewals, 2,277 new
5. Auto Renewal (batch): 27,039 renewals (PS2021 = system batch, not human-driven)
6. ERS Conversion: 7,989 renewals, 2,404 new (highest-intent acquisition channel)

---

## 16. Insurance Concierge Scorecard — Data Sources & Column Definitions

**Purpose**: Monthly performance scorecard for Insurance Concierge agents (CC and Branch).  
**FULL SPEC & REBUILD GUIDE**: `insurancescorecard/SPEC.md` — architecture, endpoints, code map, gotchas, validation protocol. Read it before touching the scorecard.  
**Production**: `backend/routers/insurance_scorecard.py` + `frontend/src/pages/InsuranceScorecard.tsx` (live, all-PBI/SF, no VPN)  
**Legacy script**: `insurancescorecard/extract_scorecard_data.py` (Databricks direct, VPN only — kept for cross-validation)  
**Reference output**: `insurancescorecard/scorecard_data_YYYYMM.csv`

### The 4 Data Sources

| Column | Source | System | Dataset/Table | Date Field |
|---|---|---|---|---|
| `activities` | Epic activity records | **Power BI (production)** | Dataset `ec6cf035` (BI Dataset - Insurance Comprehensive) → `insurance_activity_f` [DirectQuery→Databricks] | `closed_date` |
| `activities` (alt) | Epic activity records | Databricks Bronze (VPN only) | `dev_bronze_catalog.epic.activity` + `activitycode` + `securityuser` | `closed_date` |
| `n_alert` | TTEC phone system | Power BI | Dataset `5638b93f` (_TTEC Insights Standard Model v2 Incremental) | `Global Calendar[TheDate]` |
| `n_handled` | TTEC phone system | Power BI | Same as above | Same |
| `new_member_count` | Membership MEID | Power BI | Dataset `ecbfc836` (BI Dataset - Membership Sales v2) | `Membership Transactions Points[Business Date]` |
| `membership_points` | Membership MEID | Power BI | Same as above | Same |
| `walkins` | Salesforce FSL | Salesforce | `AssignedResource` + `ServiceAppointment` | `SchedStartTime` |

### Epic Activities via PBI — PRODUCTION PATH (no VPN needed)

**Discovered 2026-06-11**: `insurance_activity_f` in **BI Dataset - Insurance Comprehensive** (`ec6cf035-8a75-4cd3-b049-4274576a45bb`, the v1 dataset, NOT v3) is a DirectQuery table to Databricks. Queries route: SalesPulse → PBI executeQueries API → PBI gateway → Databricks → results. Works over the internet — Azure App Service can use it.

Key columns (86 total): `activity_category_code` (the 17 codes), `closed_status`, `closed_date`, `closed_by_code`, `closed_by_name` (pre-joined — no securityuser join needed), `branch_name`, `department_name`, `policy_number`, `associate_job_title`.

**Validated April 2026 vs Databricks extract: 37/44 agents exact, 4 within ±2.** Outliers: Denise May +32 and Cindy VanHoesen +10 (likely data drift since CSV extract — Databricks backfills late-closed activities), Mike Pappas missing (name mismatch in `closed_by_name`, known issue).

Working DAX:
```dax
EVALUATE
CALCULATETABLE(
    SUMMARIZECOLUMNS(
        'insurance_activity_f'[closed_by_name],
        "activity_count", COUNTROWS('insurance_activity_f')
    ),
    FILTER(ALL('insurance_activity_f'),
        'insurance_activity_f'[activity_category_code] IN {"CHGE","CNPY",...17 codes}
        && 'insurance_activity_f'[closed_status] IN {"S", "U"}
        && 'insurance_activity_f'[closed_date] >= DATE(2026,4,1)
        && 'insurance_activity_f'[closed_date] < DATE(2026,5,1)
    )
)
```
Note: DirectQuery → slower than Import datasets (~10-30s); cache results.

### PBI Schema Discovery — INFO.VIEW.TABLES() (CRITICAL TECHNIQUE)

To enumerate tables/columns in ANY PBI dataset with Build permission (no admin needed):
```dax
EVALUATE SELECTCOLUMNS(INFO.VIEW.TABLES(), "name", [Name], "mode", [StorageMode])
EVALUATE FILTER(SELECTCOLUMNS(INFO.VIEW.COLUMNS(), "table", [Table], "column", [Name], "type", [DataType]), [table] = "TableName")
```
- `INFO.VIEW.TABLES()` works via executeQueries with Build permission. The older `INFO.TABLES()` requires XMLA admin and fails.
- This is THE way to discover schemas — blind TOPN probing fails on DirectQuery tables (400+ name guesses found nothing; INFO.VIEW.TABLES found everything in one call).
- Full inventory of all 57 workspace datasets saved: `/tmp/pbi_table_inventory.json` (2026-06-11).
- **MCC Scorecard dataset** (`01603790`) = **Member Care Center** (membership call center: CallsHandled, Sales, ConvBilling, VOM surveys, MCCScore) — NOT Insurance Concierge. Tables: `MCC Scorecard Aggregate`, `Calls - Detail`, `Evaluations - Detail`, `Sales - Detail`, `VOM - Detail`, `Mem Trx - New Households`, `Employee List`. All DirectQuery. "Never refreshed" is normal for DirectQuery datasets.
- **CRM Dashboards** (`e4e52c20`) = Salesforce data via Databricks: `CRM - Activity`, `CRM - Opportunity`, `CRM - Cases`, `Leads - Insurance`, `Leads - Travel`, etc. All DirectQuery.
- **Insurance Comprehensive v1** (`ec6cf035`) has 7 tables incl. `insurance_activity_f`, `insurance_contacts_f`, `insurance_client_accounts_f` — richer than v3 (which has only `insurance_policies_f` + `R_INS_LifeInsurancePolicies`).
- **active_epic_employees table** exists in Insurance BoB (`0cd02fab`, Import) and Retention Only (`68c18509`, DirectQuery) — Epic employee lookup if needed.

### Membership Columns — Critical Distinction

Both columns come from the MEID dataset (`ecbfc836`) via the `Membership Transactions Points` table:

**`new_member_count`** = count of transactions where any of these flags = "Y":
- `New Basic`, `New Plus`, `New Plus Rv`, `New Premier`, `New Premier Rv`
- Meaning: actual **new memberships written** and attributed to this agent
- DAX: `COUNTROWS(FILTER('Membership Transactions Points', [New Basic]="Y" || [New Plus]="Y" || ...))`

**`membership_points`** = `SUM('Membership Transactions Points'[Membership Coverage Points])`
- Meaning: **incentive scoring points** earned from membership-related transactions
- Points are higher per transaction for higher-tier memberships (Premier > Plus > Basic)
- Points also come from renewals, upgrades, convenience billing — not just new members
- This is why `membership_points` ≥ `new_member_count` is NOT guaranteed (points < count is possible if only basic sales happened)

**IMPORTANT — Date Field**: Both columns use `Business Date` (the date the transaction was processed in the membership system). This is NOT the same date field as the visual slicer in the PBI MEID report (`be41cc35` — "Membership Employee Incentive Detail - 00752"), which uses a different date dimension. The MEID report visual will show LOWER numbers for the same month because its slicer connects to a different date field.

### Why Manual Spreadsheet Differs from MEID Extract

The manual scorecard spreadsheet (`Insurance Concierge Scorecards 2026.xlsx`, APR tab) has a "Membership Sales" column with values that are 2–4× higher than `new_member_count` from the extract (April 2026: Annette=14 manual vs 7 extract; Kelly=17 vs 4; Gabrielle=16 vs 0). The comparison analysis flagged this as a "new metric — no baseline." **Explanation**: The manual entries were likely pulled by the manager from a different view, different date range, or a broader definition that includes referrals or credits. The extract's `new_member_count` is the authoritative MEID figure using `Business Date`.

### Epic Activities — 17 Activity Codes

```python
EPIC_ACTIVITY_CODES = (
    "CHGE", "CNPY", "CPOL", "CRAK", "CS24", "DPRI",
    "ECAN", "EMCO", "EMRM", "EREC", "EREI", "ENON",
    "KEMP", "OCOP", "MAIL", "RMAL", "SSIG",
)
```
Filter: `closed_status IN ('S', 'U')`, grouped by `closed_by_code` → joined to `securityuser.full_name`.  
Date: `closed_date >= start AND closed_date < end_exclusive` (end date passed as day+1).

### Roster Rule — Who Is On The Scorecard (CRITICAL, discovered 2026-06-12)

The scorecard covers the **Insurance Concierge job family ONLY** — not all insurance agents:
- TTEC `Users[Department] IN ('Insurance Concierge CC', 'Insurance Concierge Branch')`
- AND `Users[Job Title]` contains "Insurance Concierge" (incl. Senior)
- EXCLUDING titles with "Commercial" (Cindy VanHoesen) or "Quality Control" (Charley Loftus)
- NO status filter (departed agents like Yasmin Brown keep historical data); all-zero rows dropped post-merge
- This EXCLUDES the ~20 Insurance Sales CC advisors (Karl Osterman, Tyler Cory, …) and all MIA/Medicare reps

Result = the exact 16-agent roster of the manual sheet (8 CC + 8 Branch incl. Melissa McCarthy).
TTEC is the sole roster source; other systems only contribute data for roster members.

MEID still pulls broadly (`Employee[Home Department]` contains "MIA" OR "Insurance") — the
roster intersection happens at merge time.

### Walk-ins (Branch agents only)

SF query: `AssignedResource` where `ServiceAppointment.WorkType.Name IN ('Personal Lines - Sales', 'Personal Lines - Service')` AND `Status = 'Completed'`. CC agents always have `walkins = 0`.

### Known Data Quality Issues

- **Hannah Vought**: Epic activities show ~88 in PBI but spreadsheet shows 311 — known exception, documented in `ANALYSIS_NOTES.md`
- **Domonique Acoff / Mike Pappas**: Not in TTEC system — `n_handled = 0` even when they handled calls; these agents use a different phone platform
- **Name normalization**: Epic uses `securityuser.full_name`; normalize with `_normalize()` (lowercase + strip hyphens). Override map: `{"michael pappa": "Mike Pappas"}`
- **Gabi vs Gabrielle Kalinowski**: Two different people — "Gabi Kalinowski" (MIA Administration, CC, no walkins) vs "Gabrielle Kalinowski" (Insurance Concierge Branch, has walkins)

### SalesPulse Scorecard Display Columns

The scorecard in SalesPulse shows **both** membership columns:

| Display Label | Source Field | Group |
|---|---|---|
| Activities | `activities` | Customers Helped |
| Calls Answered | `n_handled` | Customers Helped |
| Walk-Ins | `walkins` | Customers Helped (Branch only) |
| Alerted | `n_alert` | Answer Rate |
| Answered | `n_handled` | Answer Rate |
| Audits Scored | hardcoded 0 | Quality |
| Audit Correct | hardcoded 0 | Quality |
| New Members | `new_member_count` | Membership Sales |
| Mbr Points | `membership_points` | Membership Sales |

Two groups: **Call Center** (no Walk-Ins column) and **Branch** (has Walk-Ins column).

