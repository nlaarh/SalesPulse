# Insurance Concierge Scorecard — Full Specification & Rebuild Guide

> **Status**: Live in SalesPulse since 2026-06-11.
> **Companion docs**: `memory/sales-analyst.md` §16 (business rules), `memory/pbi_table_inventory.json` (all 57 PBI dataset schemas).
> If this file and sales-analyst.md ever disagree, sales-analyst.md wins — update both.

---

## 1. What This Is

Reproduces the manual **"Performance Metric Data Entries"** table from the Insurance
Concierge Scorecards spreadsheet (`Copy of ... Insurance Concierge Scorecards 2026.xlsx`,
monthly tabs) — but **live, date-filterable, and from authoritative systems** instead of
manual copy/paste.

Exact column layout (matches the spreadsheet image, with Membership split in two):

| Employee | Customers Helped ||| Answer Rate || Quality || Membership Sales ||
|---|---|---|---|---|---|---|---|---|---|
| | Activities | Calls Answered | Walk-Ins | Alerted | Answered | Audits Scored | Audit Correct | New Members | Mbr Points |

Two row blocks: **Call Center** agents first, then a separator, then **Branch** agents.
Walk-Ins is blank for CC agents (they don't take walk-ins).

---

## 2. Architecture

```
Browser (InsuranceScorecard.tsx)
   │  GET /api/insurance-scorecard?start_date&end_date
   ▼
FastAPI (backend/routers/insurance_scorecard.py)
   │  5 parallel pulls (ThreadPoolExecutor), merged by normalized agent name,
   │  cached 1hr memory / 24hr disk (key = ins_scorecard_{sd}_{ed})
   ├──► PBI executeQueries → Insurance Comprehensive  → activities (Epic, DirectQuery→Databricks)
   ├──► PBI executeQueries → TTEC Standard v2         → alerted, answered
   ├──► PBI executeQueries → Membership Sales v2      → new_members, mbr_points
   ├──► PBI executeQueries → TTEC Quality v2          → audits_scored, audits_correct
   └──► Salesforce REST (SOQL)                        → walkins
```

**Why PBI and not Databricks directly**: Databricks workspace `914760079271974` enforces
an IP allowlist (VPN only). Azure App Service cannot reach it. PBI's gateway IS whitelisted,
so DirectQuery datasets bridge Databricks to the internet. This is the production path.

---

## 3. Data Sources — Exact Locations

All PBI datasets live in workspace **Business Intelligence Datasets**
(`019c6471-5f67-4838-970b-35b186425c78`), tenant `87c1e7cf-b6c4-434f-b18e-5444b1bce3bb`.

### 3.1 Activities — Epic insurance activity records

- **Dataset**: `BI Dataset - Insurance Comprehensive` (v1!) — `ec6cf035-8a75-4cd3-b049-4274576a45bb`
  - NOT v3 (`61c03e69...`) — v3 only has `insurance_policies_f`.
- **Table**: `insurance_activity_f` [DirectQuery → Databricks `dev_bronze_catalog.epic.activity`]
- **Key columns**: `activity_category_code`, `closed_status`, `closed_date`,
  `closed_by_name` (pre-joined — no securityuser join needed), `closed_by_code`
- **Logic**: count rows where
  - `activity_category_code IN` the 17 codes:
    `CHGE CNPY CPOL CRAK CS24 DPRI ECAN EMCO EMRM EREC EREI ENON KEMP OCOP MAIL RMAL SSIG`
  - `closed_status IN ('S','U')` (Successful / Unsuccessful — i.e., closed)
  - `closed_date >= start AND closed_date < end+1day` ← **exclusive upper bound, see §6.1**
  - group by `closed_by_name`
- **Name override**: `michael pappa` → `mike pappas` (Epic stores his name differently)
- **Validation**: 37/44 agents exact vs frozen Databricks extract (April 2026); +1/+2 drift
  on others = Databricks backfilling late-closed records, live is more current.

### 3.2 Alerted / Answered — TTEC phone system

- **Dataset**: `_TTEC Insights Standard Model v2 Incremental` — `5638b93f-2099-4708-8827-39d6d31beba0`
- **Tables/measures**: `Users` (roster) + model measures `[nAlert]`, `[nAnswered]`,
  date via `'Global Calendar'[TheDate]` (pure date dim — `<=` end is safe)
- **ROSTER RULE (discovered 2026-06-12 by diffing TTEC attributes against the manual sheet)**:
  the scorecard covers the *Insurance Concierge job family* only — NOT all insurance agents:
  - `Users[Department] IN ('Insurance Concierge CC', 'Insurance Concierge Branch')`
  - `Users[Job Title]` contains `"Insurance Concierge"` (covers Insurance Concierge,
    Senior Insurance Concierge, Insurance Concierge Branch)
  - excludes titles containing `"Commercial"` (Cindy VanHoesen) or `"Quality Control"` (Charley Loftus)
  - **NO status filter** — departed agents (Yasmin Brown, status=deleted) keep historical data
  - All-zero rows dropped post-merge — clears legacy departed "Member Experience"-titled agents
  - This excludes the 20 `Insurance Sales CC` advisors (Karl Osterman, Tyler Cory, ...) and all MIA/Medicare
- The TTEC pull is the **roster** (sole source of agent list, dept, manager). Use
  `ADDCOLUMNS(FILTER(Users, ...), "x", CALCULATE([nAlert], <date filter>))` — NOT
  SUMMARIZECOLUMNS, which drops agents with zero calls in the period.
- The department drives the CC/Branch grouping (`Insurance Concierge Branch` → branch; else cc).
- **TTEC is authoritative** — the spreadsheet has verified copy errors here
  (e.g., Mason Saunders April: sheet 145 alerted vs TTEC 232).

### 3.3 New Members / Mbr Points — Membership MEID

- **Dataset**: `BI Dataset - Membership Sales v2` — `ecbfc836-a420-45d7-8dbc-ff8560cff4b0`
- **Tables**: `Membership Transactions Points` + `Employee` (dept filter:
  Home Department contains "MIA" or "Insurance")
- **Date field**: `[Business Date]` — NOT the date the PBI visual report uses; the visual
  (`be41cc35`) uses a different date dim and shows LOWER numbers for the same month.
  Business Date is authoritative.
- **new_members** = COUNTROWS where any flag = "Y":
  `New Basic, New Plus, New Plus Rv, New Premier, New Premier Rv`
- **mbr_points** = SUM(`[Membership Coverage Points]`) — includes renewals/upgrades,
  so points ≠ new members and neither bounds the other.
- The manual sheet's "Membership Sales" column is 2–4× higher than new_members — those are
  the manager's manual entries from an unknown broader definition. We show both our columns.

### 3.4 Walk-Ins — Salesforce FSL (Branch agents only)

- **Org**: `https://aaawcny.my.salesforce.com`
- **SOQL**:
  ```sql
  SELECT ServiceResource.RelatedRecord.Name agent, COUNT(Id) total
  FROM AssignedResource
  WHERE ServiceAppointment.WorkType.Name IN ('Personal Lines - Sales','Personal Lines - Service')
    AND ServiceAppointment.Status = 'Completed'
    AND ServiceAppointment.SchedStartTime >= {start}T00:00:00Z
    AND ServiceAppointment.SchedStartTime <= {end}T23:59:59Z
  GROUP BY ServiceResource.RelatedRecord.Name
  ```
- 100% exact match vs reference extract. Known anomaly: Juliana Calamis Feb
  (21 SF vs 69 sheet — sheet error).

### 3.5 Audits Scored / Audit Correct — TTEC Quality

- **Dataset**: `_TTEC Insights Quality Model v2` — `0b720ee0-a037-4a53-a2a7-a0418f1ba884`
- **Tables**: `Evaluations` (one row per audit; date = `[Conversation Date]`, has TIME
  component → exclusive upper bound required) + `Evaluation Scores` (`[TotalScore]`, 0–1 scale)
- **audits_scored** = COUNTROWS(Evaluations); **audits_correct** = COUNTROWS where
  TotalScore >= 0.9 (`AUDIT_CORRECT_THRESHOLD` constant)
- **REALITY CHECK (verified 2026-06-11)**: insurance agents have essentially ZERO
  evaluations in this system (44 all-time, none in Apr/May 2026). The 5s/4s in the
  manual sheet are the manager's MANUAL audit entries, not in any queryable system.
  Columns stay wired so they populate if insurance audits ever start flowing into TTEC Quality.

---

## 4. Code Map

| File | Role |
|---|---|
| `backend/routers/insurance_scorecard.py` | Router: all 5 pulls, merge, cache, 3 endpoints |
| `backend/pbi_client.py` | `dax_query(ws, ds, query)` + service-principal auth (env: `POWERBI_TENANT_ID/CLIENT_ID/CLIENT_SECRET`) |
| `backend/sf_client.py` | `sf_query_all(soql)` (env: `SF_*`) |
| `backend/cache.py` | `cached_query(key, fn, ttl, disk_ttl)` |
| `frontend/src/pages/InsuranceScorecard.tsx` | The page: exact table, month presets, custom range, export |
| `frontend/src/lib/api.ts` | `fetchInsuranceScorecard`, `exportInsuranceScorecard`, types |
| `frontend/src/App.tsx` | Route: `/reports/insurance-scorecard` |
| `frontend/src/pages/Reports.tsx` | Card linking to the scorecard |
| `insurancescorecard/extract_scorecard_data.py` | LEGACY local extract (Databricks direct, needs VPN) — kept for cross-validation |
| `insurancescorecard/scorecard_data_YYYYMM.csv` | Frozen reference extracts used by `/validate` |

### Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/insurance-scorecard?start_date&end_date` | Scorecard JSON (agents[], sources{} with verify links, source_errors{}) |
| `GET /api/insurance-scorecard/export?start_date&end_date` | CSV download, exact column layout |
| `GET /api/insurance-scorecard/validate` | Live April 2026 vs `scorecard_data_202604.csv`, per-field exact-match stats |

### Merge logic (in `_build_scorecard`)

1. Roster = TTEC agents (they carry dept/manager) ∪ Epic-only agents (dept unknown → cc).
2. Join all sources on `_norm(name)` = lowercase, strip hyphens and commas.
3. Drop agents with all-zero rows for the period.
4. `group` = "branch" iff department == `Insurance Concierge Branch`, else "cc".
5. Per-source failures don't fail the request — affected columns are zero and the
   failure surfaces in `source_errors` (frontend shows an amber banner).

---

## 5. The Discovery Technique (how the table names were found)

Blind TOPN probing (400+ guesses) finds NOTHING on DirectQuery datasets. The way in:

```dax
EVALUATE SELECTCOLUMNS(INFO.VIEW.TABLES(), "name", [Name], "mode", [StorageMode])
EVALUATE FILTER(SELECTCOLUMNS(INFO.VIEW.COLUMNS(),
    "table", [Table], "column", [Name], "type", [DataType]), [table] = "X")
```

- Works through `executeQueries` REST API with **Build** permission (`ReadWriteExplore`).
- The older `INFO.TABLES()` needs XMLA admin → fails. `COLUMNSTATISTICS()` times out
  on DirectQuery. DMV `$SYSTEM.*` queries fail. **INFO.VIEW.* is the only one that works.**
- "Never refreshed" on a dataset = it's DirectQuery; refresh doesn't apply. Not an error.
- Full inventory of every dataset in the workspace: `memory/pbi_table_inventory.json`.
- Useful misc findings: MCC Scorecard dataset = Member Care Center (NOT insurance);
  CRM Dashboards (`e4e52c20`) = Salesforce data via Databricks DirectQuery.

---

## 6. Gotchas (each one cost real debugging time)

### 6.1 Datetime-bearing "Date" columns need exclusive upper bounds
`insurance_activity_f[closed_date]` and `Evaluations[Conversation Date]` carry time parts.
`<= DATE(end)` (= midnight) silently drops the end day's afternoon records (April test:
Katie Cultrara 118 vs correct 128). **Always `< DATE(end + 1 day)`** on these columns.
`Global Calendar[TheDate]` and MEID `[Business Date]` are pure dates — `<=` is fine.

### 6.2 SUMMARIZE returns None for text columns via executeQueries
Use **SUMMARIZECOLUMNS** everywhere (established codebase rule, see `pbi_client.py` header).

### 6.3 NULL closed_by_name rows
Epic has unattributable activities (~58 in April). Skip them — don't let an empty-name
key absorb fuzzy matches (this corrupted an early validation run).

### 6.4 Same-value coincidences are not bugs
Karl Osterman nAlert = 507 in BOTH April and May. Verified the filter works
(1 day = 17, 1 week = 125, Jan = 702). Check granularity before assuming a broken filter.

### 6.5 Known people quirks
- **Hannah Vought**: sheet shows 311 activities vs ~88 in Epic — known sheet exception.
- **Mike Pappas**: three spellings — TTEC/Epic "Michael Pappa", SF "Michael Pappas",
  sheet "Mike Pappas". `NAME_OVERRIDES` in `_norm()` canonicalizes ALL sources to
  "mike pappas" (this fixed his walk-ins showing 0).
- **Melissa McCarthy**: passes the roster rule and was on the April sheet — she belongs,
  even though some monthly tabs leave her row blank.
- **Domonique Acoff**: not in TTEC (different phone platform) — fell off the roster when
  it became TTEC-only; he was on early-2026 sheets. Revisit if he reappears.
- **Gabi vs Gabrielle Kalinowski**: two different people (MIA Admin vs IC Branch).

### 6.7 SELECTCOLUMNS alias bracketing
`SELECTCOLUMNS(..., "[nAlert]", [x])` produces output key `[[nAlert]]` — the API wraps
aliases in brackets. Use plain aliases (`"nAlert"`) → key `[nAlert]`.

### 6.6 localhost:5174 collision (dev only)
`localhost` resolves IPv6 first, where another dev server (FSL) may listen.
Use `http://127.0.0.1:5174` for SalesPulse frontend testing.

---

## 7. How to Rebuild From Scratch (checklist)

1. **Env**: `.env` needs `POWERBI_TENANT_ID/CLIENT_ID/CLIENT_SECRET` (service principal
   with Build on the BI workspace datasets) + `SF_*` creds.
2. **Verify schema availability**: run INFO.VIEW.TABLES() (§5) against the four dataset IDs
   in §3 — confirm tables/columns still exist (dataset owners can rename things).
3. **Backend**: create `backend/routers/insurance_scorecard.py` per §3 logic + §6 gotchas;
   register in `main.py` (import list + `app.include_router`).
4. **Frontend**: page per §1 layout; API fns in `api.ts` (180s timeout — DirectQuery is slow
   cold); route in `App.tsx`; card in `Reports.tsx`.
5. **Validate**: `GET /api/insurance-scorecard/validate` → expect ≥85% exact on activities,
   100% on alerted/answered/walkins vs the frozen April CSV. Investigate anything lower.
6. **Browser-test**: table renders both blocks, export downloads, console clean.
7. **Source links**: response `sources{}` carries verify URLs (PBI reports + SF) — keep
   these current if reports are republished (report IDs change, dataset IDs usually don't).

## 8. Validation Protocol (run after any change)

```bash
TOKEN=...  # mint via auth.create_token or login
curl -s "http://localhost:8002/api/insurance-scorecard/validate" -H "Authorization: Bearer $TOKEN"
```
Compares live April 2026 vs `scorecard_data_202604.csv` (frozen, verified extract).
Reference hierarchy when numbers disagree:
1. **PBI / SF live** (authoritative)
2. Frozen CSV extracts (point-in-time; drift = Databricks backfill, expected +1/+2)
3. Manual spreadsheet (NOT authoritative — has verified copy errors; use only as a sanity
   reference for column layout and rough magnitude)
