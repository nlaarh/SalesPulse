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

*Last updated: 2026-04-12. Update this file when new data patterns, field behaviors, or business rules are discovered.*

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
