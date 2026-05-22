# Growth Plan Page — Implementation Plan

**Goal:** Build a new page at `/growth-plan` that replicates `AAA_WCNY_Path_To_120M_Growth_Plan_v1.pdf` as a live, interactive React experience with live Salesforce/Census/DMV data.

**Current page `/strategic-insights` is NOT touched.** Stays as-is.

---

## User-Confirmed Decisions (2026-05-21)
- **Sidebar label "Strategic Insights" now points to NEW page** (Option A confirmed)
- Old `/strategic-insights` URL keeps working (ProductReport.tsx untouched, just unlinked from sidebar)
- **AI-generated narratives per section** (reuse `fetchProductNarrative` pattern)
- **Per-section data download** (CSV export of the underlying data behind each chart/table)

## Architecture

### New Route
- **Path:** `/growth-plan`
- **Sidebar entry:** "Strategic Insights" → `/growth-plan` (was → `/strategic-insights`)
- **Old route:** `/strategic-insights` still works, just removed from sidebar
- **File:** `frontend/src/pages/GrowthPlan.tsx` (orchestrator)

### Component Structure
```
frontend/src/pages/GrowthPlan.tsx          # Orchestrator + section anchors + TOC
frontend/src/components/growth/
  GrowthHero.tsx                            # Cover: "Path to $120.5M" + KPI tiles
  ExecutiveSummary.tsx                      # External Forces + Headwinds/Opps columns
  GrowthOpportunityMap.tsx                  # 3-Plays cards + product gap table
  RevenueComposition.tsx                    # 3D pie 2025 vs 2028 + mix shift tiles
  CountyChoropleth.tsx                      # Reusable map (one metric per instance)
  MarketHealthGrid.tsx                      # 2×3 grid of choropleths (6 lenses)
  ConversionFunnelTrio.tsx                  # 3 donuts: members/insurance/travel
  CountyPenetrationBars.tsx                 # Ranked horizontal bars
  ProductOpportunityBars.tsx                # 5-metric grouped bars × county
  PunchlineCard.tsx                         # "PUNCHLINE → Action" reusable callout
  HeadwindsOpportunities.tsx                # Two-column ↓/↑ list
  ProductDeepDive.tsx                       # Reusable per-product section
  SidebarTOC.tsx                            # Anchor-link sticky TOC
```

### Chart Libraries
- **Add:** `echarts-for-react` (~340KB gz) — 3D pie, donuts, grouped bars, sharp visuals
- **Add:** `react-simple-maps` (~80KB gz) — county choropleth using existing GeoCounty.geojson
- **Keep:** Recharts — used elsewhere, no removal

### Data Sources (reuse existing endpoints)
- `/api/territory/map` — county polygons + penetration metrics
- `/api/product-report?product=X` — per-product KPIs/trends
- `/api/cross-sell/...` — penetration breakdowns
- `/api/census/...` — population/demographics
- Add new endpoint **only if** existing ones can't deliver the data needed.

### Color Palette (lift from PDF)
- Navy: `#002B5C`, Light Navy: `#004494`
- Teal: `#00838F`
- Red accent: `#C41E3A`
- Green ↑: `#2E7D32`
- Choropleth gradients: green (membership), red (insurance), purple (auto), orange (travel)

---

## Sections — In PDF Order

| # | Section | Component | Charts |
|---|---|---|---|
| 0 | Hero Cover | `GrowthHero` | 4 KPI tiles |
| 1 | Why Leadership Should Read | `ReaderGuide` | None (text columns) |
| 2 | Executive Summary | `ExecutiveSummary` | None (editorial text) |
| 3 | Headwinds / Opportunities (per product) | `HeadwindsOpportunities` | None |
| 4 | Growth Opportunity Map | `GrowthOpportunityMap` | 3-play cards + table |
| 5 | Revenue Composition 2025→2028 | `RevenueComposition` | ECharts 3D pie |
| 6 | Current Member Footprint | `CountyChoropleth` + `CountyPenetrationBars` | Map + ranked bars |
| 7 | Market Penetration at a Glance | `ConversionFunnelTrio` | 3 donuts |
| 8 | Market Health — Six Penetration Lenses | `MarketHealthGrid` | 6 choropleths |
| 9 | Product Opportunity Map | `ProductOpportunityBars` | Grouped bars |
| 10 | County Investment Priority Matrix | (priority quadrant chart) | ECharts scatter |
| 11 | Membership Deep Dive | `ProductDeepDive` | Acquisition vs cancellation, retention, age cohort |
| 12 | Roadside & Battery Deep Dive | `ProductDeepDive` | |
| 13 | Auto & Home Insurance Deep Dive | `ProductDeepDive` | + competitive landscape, age, retention |
| 14 | Small Commercial Insurance | `ProductDeepDive` | |
| 15 | Travel Deep Dive | `ProductDeepDive` | Funnel, age, segment |
| 16 | Medicare & Driver Programs | `ProductDeepDive` | |
| 17 | Cross-Product Strategy & Appendix | `StrategySection` | Channel matrix, growth plays, roadmap |

Every section ends with a `PunchlineCard` (lifted from PDF style).

---

## Implementation Phases

### Phase 1 — Foundation + Visual Signature (Day 1)
**Deliverable:** New route renders cover + exec summary + county choropleth + 3-funnel donuts.

Steps:
1. Install `echarts-for-react` + `react-simple-maps` + `d3-scale` (for color ramps)
2. Add `/growth-plan` route in `App.tsx`
3. Add nav item in `Layout.tsx` (NAV_EXTERNAL group)
4. Build `GrowthHero` — large typography, navy bg, 4 KPI tiles, "Path to $120.5M"
5. Build `CountyChoropleth` (reusable, takes metric prop)
6. Build `ConversionFunnelTrio` (3 donuts via ECharts)
7. Build `PunchlineCard` (reusable Tailwind component)
8. Build `HeadwindsOpportunities` (two-column with ↓/↑ icons)
9. Build `ExecutiveSummary` orchestrator wiring the above
10. Verify in browser at full width + responsive

**Gate after Phase 1:** Show to user. If visual quality matches PDF bar → continue. If not → reassess library/styling before doing more work.

### Phase 2 — Quantitative Sections (Day 2)
1. `RevenueComposition` — ECharts 3D pie (2025 vs 2028 side by side) + mix tiles
2. `MarketHealthGrid` — 2×3 choropleth grid (reuses `CountyChoropleth`)
3. `CountyPenetrationBars` — ranked horizontal bars with average dotted line
4. `ProductOpportunityBars` — grouped horizontal bars
5. `GrowthOpportunityMap` — 3-play cards + product gap table

### Phase 3 — Per-Product Deep Dives (Day 3-4)
1. `ProductDeepDive` reusable component with slots for charts
2. Membership section: acquisition vs cancellation trend, retention bands, age cohort
3. Insurance section (Auto+Home): competitive landscape, age, retention, carrier mix
4. Travel section: funnel, segment, age
5. Medicare + Driver Programs (lighter — these are opportunity-only in PDF)
6. Small Commercial Insurance

### Phase 4 — Polish + Navigation (Day 4)
1. `SidebarTOC` — sticky anchor-link sidebar with scroll-spy
2. Print/PDF export styling
3. Smoke test on full territory data
4. Final review against PDF page by page

---

## Acceptance Criteria

- New page renders at `/growth-plan`
- `/strategic-insights` is untouched and still works
- All 17 sections from PDF TOC are present
- County choropleth uses live data from `GeoCounty` table
- 3D pie, donut, choropleth, grouped bar visuals all match PDF aesthetic
- Sidebar TOC scrolls with content
- Page loads under 3 seconds at full data
- Mobile-responsive (sections stack, charts shrink)

---

## Out of Scope (Explicit)

- Editing `/strategic-insights` or `ProductReport.tsx`
- New backend endpoints (only add if existing can't deliver)
- PDF export from the page (printing CSS is enough)
- Real-time data refresh (existing cache TTLs apply)
- The full 94-page text — only the data sections and structural narrative blocks. Long-form text from the PDF is summarized in punchline cards.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| ECharts 3D pie not as sharp as PDF | Fallback: animated 2D donut with gradients (still better than nothing) |
| Choropleth performance with 100+ ZIP polygons | Stick to county-level (20 counties), not ZIP, for the main maps |
| Per-product deep dives bloat the page | Lazy-load each section, anchor navigation, collapsible by default |
| Existing endpoints missing a metric | Document gap, decide per-metric: add endpoint vs derive client-side |

---

## Ready to Start When

- User confirms route name `/growth-plan` and label "Growth Plan"
- User says "go"
