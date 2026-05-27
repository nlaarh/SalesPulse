import { useMemo, type CSSProperties } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  fetchTerritoryMapData,
  fetchTerritoryBoundaries,
  type TerritoryMapData,
  type CountyBoundaryData,
} from '@/lib/api'
import wcnyGeoJsonStatic from '@/data/wcny-counties.geojson.json'
import type { FeatureCollection } from 'geojson'
import { fetchProductReport, type ProductReportData, type ProductType } from '@/lib/api_product_report'
import { fetchCanonicalCounts, fetchCoverageTiers, fetchTrends, type CanonicalCountsResponse, type CoverageTiersResponse, type TrendsResponse } from '@/lib/api_growth'

import Hero from '@/components/growth/Hero'
import SectionHeader from '@/components/growth/SectionHeader'
import IntroBlock from '@/components/growth/IntroBlock'
import PunchlineCard from '@/components/growth/PunchlineCard'
import HeadwindsOpps from '@/components/growth/HeadwindsOpps'
import FunnelDonuts from '@/components/growth/FunnelDonuts'
import CountyChoropleth, { type CountyMetric } from '@/components/growth/CountyChoropleth'
import CountyRankedBars from '@/components/growth/CountyRankedBars'
import DownloadButton from '@/components/growth/DownloadButton'
import RevenueComposition from '@/components/growth/RevenueComposition'
import MarketHealthGrid, { type MarketHealthLens } from '@/components/growth/MarketHealthGrid'
import GroupedCountyBars from '@/components/growth/GroupedCountyBars'
import GrowthOpportunityMap from '@/components/growth/GrowthOpportunityMap'
import InvestmentPriorityMatrix, { type MatrixPoint } from '@/components/growth/InvestmentPriorityMatrix'
import ProductGrowthSection from '@/components/growth/ProductGrowthSection'
import { type RetentionFactor } from '@/components/growth/RetentionFactors'
import DataExplorer from '@/components/growth/DataExplorer'
import RetentionTrends from '@/components/growth/RetentionTrends'
import MemberDepthPanel from '@/components/growth/MemberDepthPanel'
import IncomePenetrationScatter from '@/components/growth/IncomePenetrationScatter'
import CompetitiveLandscape from '@/components/growth/CompetitiveLandscape'
import SidebarTOC, { type TocItem } from '@/components/growth/SidebarTOC'
import AINarrative from '@/components/growth/AINarrative'
import { GROWTH_COLORS, fmt } from '@/components/growth/tokens'

// ── Board-approved 3-year projection (304-25 booklet) ──
// Member counts come from /api/growth/data/canonical-counts (PBI workbook).
// Revenue figures are the board-approved targets; do not change without board approval.
const Y2025_REV = 102_200_000
const Y2028_REV = 120_500_000
const GROWTH_NEEDED = Y2028_REV - Y2025_REV
const Y2028_MEMBERS = 921_000

const REV_2025 = [
  { product: 'Membership', pct: 67.2, value: 68_700_000, color: GROWTH_COLORS.navy },
  { product: 'Insurance', pct: 9.6, value: 9_600_000, color: GROWTH_COLORS.teal },
  { product: 'Travel', pct: 13.9, value: 14_300_000, color: GROWTH_COLORS.orangeLight },
  { product: 'Other', pct: 9.3, value: 9_600_000, color: GROWTH_COLORS.purpleLight },
]
const REV_2028 = [
  { product: 'Membership', pct: 62.9, value: 75_700_000, color: GROWTH_COLORS.navy },
  { product: 'Insurance', pct: 15.3, value: 18_400_000, color: GROWTH_COLORS.teal },
  { product: 'Travel', pct: 12.8, value: 15_400_000, color: GROWTH_COLORS.orangeLight },
  { product: 'Other', pct: 9.0, value: 10_700_000, color: GROWTH_COLORS.purpleLight },
]

// ── County aggregation ────────────────────────────────────────────────────────

interface CountyAgg {
  county: string
  members: number
  insCustomers: number
  travel3yr: number
  pop18plus: number
  memberPenPct: number
  insCrossSellPct: number
  travelEngagementPct: number
  /** Insurance market share proxy = ins_customers / pop_18plus * 100 */
  insMarketSharePct: number
}

function aggregateByCounty(data: TerritoryMapData | undefined): CountyAgg[] {
  if (!data?.zips) return []
  const byCounty = new Map<string, CountyAgg>()
  for (const z of data.zips) {
    const c = z.county_name?.trim()
    if (!c) continue
    let agg = byCounty.get(c)
    if (!agg) {
      agg = {
        county: c,
        members: 0,
        insCustomers: 0,
        travel3yr: 0,
        pop18plus: 0,
        memberPenPct: 0,
        insCrossSellPct: 0,
        travelEngagementPct: 0,
        insMarketSharePct: 0,
      }
      byCounty.set(c, agg)
    }
    agg.members += z.members || 0
    agg.insCustomers += z.ins_customers_cy || 0
    agg.travel3yr += z.travel_customers_3yr || 0
    agg.pop18plus += z.pop_18plus || 0
  }
  const out: CountyAgg[] = []
  for (const agg of byCounty.values()) {
    agg.memberPenPct = agg.pop18plus > 0 ? (agg.members / agg.pop18plus) * 100 : 0
    agg.insCrossSellPct = agg.members > 0 ? (agg.insCustomers / agg.members) * 100 : 0
    agg.travelEngagementPct = agg.members > 0 ? (agg.travel3yr / agg.members) * 100 : 0
    agg.insMarketSharePct = agg.pop18plus > 0 ? (agg.insCustomers / agg.pop18plus) * 100 : 0
    out.push(agg)
  }
  return out.sort((a, b) => b.members - a.members)
}

// Tier classification for the priority matrix
function classifyTier(c: CountyAgg, medMembers: number, medPen: number): MatrixPoint['tier'] {
  if (c.members >= medMembers && c.memberPenPct < medPen) return 'GROW'
  if (c.memberPenPct >= medPen) return 'DEFEND'
  return 'MAINTAIN'
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ── Cancellation root-cause data (lifted from PDF Section 02) ─────────────────
// In production these come from data.retention.cancel_reasons; we provide
// PDF-aligned defaults as a fallback so the chart always renders.
const MEMBERSHIP_CANCEL_REASONS: RetentionFactor[] = [
  { reason: 'Deceased / Incapacitated', pct: 44, addressable: false },
  { reason: 'Cost (price/budget)', pct: 22, addressable: true },
  { reason: 'Not Using Benefits', pct: 12, addressable: true },
  { reason: 'Service / Wait Issues', pct: 8, addressable: true },
  { reason: 'Moved out of Territory', pct: 6, addressable: false },
  { reason: 'Switched Provider', pct: 5, addressable: true },
  { reason: 'Other / Unknown', pct: 3, addressable: false },
]

const INSURANCE_CANCEL_REASONS: RetentionFactor[] = [
  { reason: 'Carrier Rate Increase', pct: 38, addressable: true },
  { reason: 'Found Cheaper Quote', pct: 24, addressable: true },
  { reason: 'Sold / Removed Vehicle', pct: 12, addressable: false },
  { reason: 'Moved out of State', pct: 9, addressable: false },
  { reason: 'Bundled with Other Provider', pct: 8, addressable: true },
  { reason: 'Service / Claim Experience', pct: 6, addressable: true },
  { reason: 'Other', pct: 3, addressable: false },
]

// Translate API cancel_reasons records (Record<string, any>) into RetentionFactor[]
function parseCancelReasons(records: Array<Record<string, unknown>> | undefined, fallback: RetentionFactor[]): RetentionFactor[] {
  if (!records || records.length === 0) return fallback
  const parsed: RetentionFactor[] = []
  for (const r of records) {
    const reason = (r.reason ?? r.label ?? r.name ?? r.category) as string | undefined
    const rawPct = (r.pct ?? r.percentage ?? r.share ?? r.value) as number | string | undefined
    const pct = typeof rawPct === 'string' ? parseFloat(rawPct) : Number(rawPct ?? 0)
    if (!reason || !Number.isFinite(pct)) continue
    const addressable = r.addressable === false ? false : true
    parsed.push({ reason, pct, addressable })
  }
  return parsed.length ? parsed : fallback
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TOC_ITEMS: TocItem[] = [
  { id: 'executive-summary', label: 'Executive Summary', group: 'Front Matter' },
  { id: 'opportunity-map', label: 'Growth Opportunity Map', group: 'Strategic Overview' },
  { id: 'revenue-composition', label: 'Revenue Composition 2025 vs 2028', group: 'Strategic Overview' },
  { id: 'member-footprint', label: 'Member Footprint by County', group: 'Cross-Product' },
  { id: 'penetration-glance', label: 'Penetration at a Glance', group: 'Cross-Product' },
  { id: 'market-health', label: 'Six Penetration Lenses', group: 'Cross-Product' },
  { id: 'product-opportunity', label: 'Product Opportunity Bars', group: 'Cross-Product' },
  { id: 'priority-matrix', label: 'Investment Priority Matrix', group: 'Cross-Product' },
  { id: 'retention-trends', label: 'Retention & Growth Trends', group: 'Intelligence' },
  { id: 'member-depth', label: 'Member Depth & ERS Health', group: 'Intelligence' },
  { id: 'income-penetration', label: 'Income vs Penetration', group: 'Intelligence' },
  { id: 'competitive', label: 'Competitive Landscape', group: 'Intelligence' },
  { id: 'membership', label: 'Membership Deep Dive', group: 'Per-Product' },
  { id: 'auto-insurance', label: 'Auto Insurance', group: 'Per-Product' },
  { id: 'home-insurance', label: 'Home Insurance', group: 'Per-Product' },
  { id: 'travel', label: 'Travel', group: 'Per-Product' },
  { id: 'battery', label: 'Battery & Roadside', group: 'Per-Product' },
  { id: 'medicare-driver', label: 'Medicare & Driver Programs', group: 'Per-Product' },
  { id: 'data-explorer', label: 'Data Explorer', group: 'Closing' },
  { id: 'strategy-appendix', label: 'Strategy & Appendix', group: 'Closing' },
]

// Matches the PDF report's per-product structure: each product gets its own
// section with penetration → growth opportunity → trend → churn.
const PRODUCT_QUERIES: { product: ProductType; sectionId: string; label: string; color: string }[] = [
  { product: 'membership', sectionId: 'membership', label: 'Membership', color: GROWTH_COLORS.navy },
  { product: 'auto', sectionId: 'auto-insurance', label: 'Auto Insurance', color: GROWTH_COLORS.teal },
  { product: 'home', sectionId: 'home-insurance', label: 'Home Insurance', color: GROWTH_COLORS.green },
  { product: 'travel', sectionId: 'travel', label: 'Travel', color: GROWTH_COLORS.orangeLight },
  { product: 'battery', sectionId: 'battery', label: 'Battery & Roadside', color: GROWTH_COLORS.purpleLight },
]

export default function GrowthPlan() {
  const { data: mapData, isLoading: loadingMap } = useQuery<TerritoryMapData>({
    queryKey: ['growth-plan-map'],
    queryFn: () => fetchTerritoryMapData(12),
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data: boundaries } = useQuery<CountyBoundaryData>({
    queryKey: ['growth-plan-boundaries'],
    queryFn: () => fetchTerritoryBoundaries(false),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // Use API boundaries if seeded, else fall back to bundled static GeoJSON.
  // Always resolves to a non-null FeatureCollection so the choropleth always renders.
  const countyGeojson: FeatureCollection = useMemo(() => {
    const apiFC = boundaries?.county_geojson
    if (apiFC && apiFC.features && apiFC.features.length > 0) return apiFC
    return wcnyGeoJsonStatic as unknown as FeatureCollection
  }, [boundaries])

  const productResults = useQueries({
    queries: PRODUCT_QUERIES.map((p) => ({
      queryKey: ['growth-plan-product', p.product],
      queryFn: () => fetchProductReport(p.product),
      staleTime: 30 * 60_000,
      refetchOnWindowFocus: false,
    })),
  })

  // Single source of truth for ALL displayed totals on this page. See
  // backend/routers/growth_data.py → /api/growth/data/canonical-counts.
  const { data: canonical } = useQuery<CanonicalCountsResponse>({
    queryKey: ['growth-plan-canonical-counts'],
    queryFn: fetchCanonicalCounts,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // Coverage-tier breakdown (Premier / Plus / Basic / Other) for the Membership section.
  const { data: coverageTiers } = useQuery<CoverageTiersResponse>({
    queryKey: ['growth-plan-coverage-tiers'],
    queryFn: fetchCoverageTiers,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  })

  // Intelligence panels: retention trends, LTV depth, income×pen scatter, competitive
  const { data: trendsData } = useQuery<TrendsResponse>({
    queryKey: ['growth-plan-trends'],
    queryFn: fetchTrends,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const counties = useMemo(() => aggregateByCounty(mapData), [mapData])
  // Canonical totals override per-source SOQL/CSV aggregates so every KPI on the
  // page reads from one number. Fallback to mapData only while canonical loads.
  const totalMembers = canonical?.counts.members ?? mapData?.totals?.members ?? 0
  const totalInsCust = canonical?.total_insurance ?? mapData?.totals?.ins_customers ?? 0
  const totalTravel = canonical?.counts.travel_customers ?? mapData?.totals?.travel_customers_3yr ?? 0
  const totalPop18 = counties.reduce((s, c) => s + c.pop18plus, 0)
  const adultReach = totalPop18 > 0 ? totalMembers / totalPop18 : 0
  const insCrossSell = totalMembers > 0 ? totalInsCust / totalMembers : 0
  const travelEngage = totalMembers > 0 ? totalTravel / totalMembers : 0

  const memberPenMetrics: CountyMetric[] = counties.map((c) => ({ countyName: c.county, value: c.memberPenPct }))
  const insCrossSellMetrics: CountyMetric[] = counties.map((c) => ({ countyName: c.county, value: c.insCrossSellPct }))
  const travelMetrics: CountyMetric[] = counties.map((c) => ({ countyName: c.county, value: c.travelEngagementPct }))
  const insMarketMetrics: CountyMetric[] = counties.map((c) => ({ countyName: c.county, value: c.insMarketSharePct }))

  const rankedRows = counties.map((c) => ({ county: c.county, value: c.memberPenPct }))
  const avgPen = counties.length ? counties.reduce((s, c) => s + c.memberPenPct, 0) / counties.length : 0
  const lowestPen = [...counties].sort((a, b) => a.memberPenPct - b.memberPenPct).slice(0, 5).map((c) => c.county)

  // Grouped bars: top 20 counties by members, 4 series (mem%, ins%, travel%, ins market share%)
  const groupedRows = counties.slice(0, 20).map((c) => ({
    county: c.county,
    values: [c.memberPenPct, c.insCrossSellPct, c.travelEngagementPct, c.insMarketSharePct],
  }))

  // Investment priority matrix
  const medMembers = median(counties.map((c) => c.members))
  const medPen = median(counties.map((c) => c.memberPenPct))
  const matrixPoints: MatrixPoint[] = counties.map((c) => ({
    county: c.county,
    members: c.members,
    penetrationPct: c.memberPenPct,
    insCustomers: c.insCustomers,
    tier: classifyTier(c, medMembers, medPen),
  }))

  // Hero KPI tiles
  const heroTiles = [
    { label: '2025 Actual', value: fmt.dollars(Y2025_REV), sub: `Total revenue · ${fmt.num(totalMembers)} members` },
    { label: '2028 Target', value: fmt.dollars(Y2028_REV), sub: `Total revenue · ${fmt.num(Y2028_MEMBERS)} members` },
    { label: 'Growth Needed', value: `+${fmt.dollars(GROWTH_NEEDED)}`, sub: '+17.9% in 3 years' },
    { label: 'Ins. Cross-Sell', value: fmt.pctPlain(insCrossSell * 100, 1), sub: `Of ${fmt.num(totalMembers)} cardholders · goal: 4%+ by 2027` },
  ]

  // CSV download rows
  const countyCsvRows = counties.map((c) => ({
    county: c.county,
    members: c.members,
    insurance_customers: c.insCustomers,
    travel_customers_3yr: c.travel3yr,
    population_18plus: c.pop18plus,
    membership_penetration_pct: c.memberPenPct.toFixed(2),
    insurance_cross_sell_pct: c.insCrossSellPct.toFixed(2),
    travel_engagement_pct: c.travelEngagementPct.toFixed(2),
    insurance_market_share_pct: c.insMarketSharePct.toFixed(2),
  }))

  // Editorial content lifted from the PDF (will be AI-driven in production via /api/growth/narrative)
  const headwinds = [
    { lead: 'Inflation — #1 force.', body: 'Cumulative CPI +27% since 2020. Groceries +28%, housing +35%, auto insurance +38%. WNY wages flat in real terms.' },
    { lead: 'Structural attrition.', body: '44% of annual cancellations (~10,579/yr) are deceased or incapacitated members. Retention targets vs total cancellations are misleading.' },
    { lead: 'Gen Z licensing gap.', body: 'HS seniors with a driver\'s license: 82% in 2005 → 63% in 2023. The membership pipeline is structurally narrowing.' },
    { lead: 'ERS satisfaction top-box.', body: '"Totally Satisfied" rate ~80%. Industry research shows top-box is the only tier that predicts true loyalty.' },
  ]
  const opportunities = [
    { lead: 'Value narrative at renewal.', body: 'Members who see realized savings before invoice renew at 91%. Invoice-only: 74%. A 17-point gap.' },
    { lead: 'Cancel-save conversation.', body: 'Cost is the #1 stated reason. Structured cancel-save (roadside saves, partner discounts) closes it without discounting the brand.' },
    { lead: 'Year-1 Gen Z activation.', body: 'Under-30 members who use the product in Year 1 renew at 74%; those who don\'t: 43%. Three touchpoints close the gap.' },
    { lead: 'Bundle = 89–92% retention.', body: 'Membership + insurance bundled retains at 89–92% vs 74% standalone. Every renewal is an insurance cross-sell opportunity.' },
  ]

  const plays = [
    {
      index: 1, label: 'DEEPEN', color: GROWTH_COLORS.teal,
      title: 'Convert the Member Base',
      body: `Only ${fmt.pctPlain(insCrossSell * 100, 1)} of ${fmt.num(totalMembers)} members have AAA insurance. If every county matched the top performer, we add thousands of net-new policies without acquiring a single new member. The member is already in the building — they just haven't been asked.`,
    },
    {
      index: 2, label: 'EXPAND', color: GROWTH_COLORS.navy,
      title: 'Reach Eligible Non-Members',
      body: `Across registered vehicles and owner-occupied homes, AAA's coverage is a fraction of the available market. Low-penetration ZIP clusters are not failures — they are the map of where targeted marketing drives the highest ROI.`,
    },
    {
      index: 3, label: 'ACQUIRE UNDER-45', color: GROWTH_COLORS.red,
      title: 'Build the Next Generation',
      body: `Teen drivers, near-seniors (55–64), and the large young-adult population each represent different product-fit moments. Each under-45 member converted today = 30–50 years of premium revenue.`,
    },
  ]

  const productRows = [
    { product: 'Membership', metric: 'Members ÷ Adults 18+', currentRate: fmt.pctPlain(adultReach * 100, 1), gap: `${fmt.num(totalPop18 - totalMembers)} non-members`, primaryLever: 'Under-45 digital + ZIP campaigns' },
    { product: 'Insurance', metric: 'Ins. Customers ÷ Members', currentRate: fmt.pctPlain(insCrossSell * 100, 1), gap: `${fmt.num(totalMembers - totalInsCust)} uninsured cardholders`, primaryLever: 'Agent outreach + renewal touchpoint' },
    { product: 'Travel', metric: 'Travel Buyers ÷ Members', currentRate: fmt.pctPlain(travelEngage * 100, 1), gap: `${fmt.num(totalMembers - totalTravel)} non-travel members`, primaryLever: 'Post-trip insurance cross-sell' },
  ]

  const sixLenses: MarketHealthLens[] = [
    { title: 'Membership Penetration', subtitle: 'Members ÷ Adults 18+', ramp: 'membership', metrics: memberPenMetrics, unit: '%' },
    { title: 'Insurance Cross-Sell Rate', subtitle: 'Ins. customers ÷ Members', ramp: 'insurance', metrics: insCrossSellMetrics, unit: '%' },
    { title: 'Auto Market Share', subtitle: 'Ins. customers ÷ Adults 18+', ramp: 'auto', metrics: insMarketMetrics, unit: '%' },
    { title: 'Travel Penetration', subtitle: 'Travel buyers ÷ Members', ramp: 'travel', metrics: travelMetrics, unit: '%' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: GROWTH_COLORS.paperBg, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as CSSProperties}>
      {/* Print-only styling: hide the sticky TOC, expand main column, force backgrounds */}
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: #ffffff; }
          nav[aria-label="Section navigation"] { display: none !important; }
          .growth-grid { grid-template-columns: 1fr !important; }
          section { break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        <div className="growth-grid grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          {/* Sticky TOC */}
          <SidebarTOC items={TOC_ITEMS} />

          {/* Main content */}
          <div className="space-y-12 min-w-0">
            {/* ── Hero Cover ───────────────────────────────────────── */}
            <Hero
              eyebrow="AAA Western and Central New York · Strategic Market Intelligence"
              title="Path to $120.5M"
              subtitle="AAA WCNY Growth Strategy & Decisions to Consider"
              description="Membership · Insurance · Travel · Medicare · Driver Programs"
              tiles={heroTiles}
            />

            {/* Data freshness stamp — single source of truth for all counts on this page */}
            {canonical && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] px-4 py-2 rounded-md border"
                style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.inkSoft, backgroundColor: '#FAFBFC' }}
              >
                <span>
                  Data refreshed:{' '}
                  <span style={{ color: GROWTH_COLORS.ink, fontWeight: 600 }}>{canonical.as_of}</span>
                </span>
                <span>
                  Source: <span style={{ color: GROWTH_COLORS.ink }}>{canonical.source}</span>
                </span>
                <span>
                  Members <strong style={{ color: GROWTH_COLORS.ink }}>{fmt.num(canonical.counts.members)}</strong> ·
                  {' '}Auto <strong style={{ color: GROWTH_COLORS.ink }}>{fmt.num(canonical.counts.auto_customers)}</strong> ·
                  {' '}Home <strong style={{ color: GROWTH_COLORS.ink }}>{fmt.num(canonical.counts.home_customers)}</strong> ·
                  {' '}Travel <strong style={{ color: GROWTH_COLORS.ink }}>{fmt.num(canonical.counts.travel_customers)}</strong>
                </span>
              </div>
            )}

            {/* ── 1. Executive Summary ───────────────────────────── */}
            <section id="executive-summary">
              <SectionHeader page="Part I · External Market Forces" title="Executive Summary" subtitle="External market forces & strategic response · for officers and directors" />
              <AINarrative
                section="executive-summary"
                context={{
                  total_members: totalMembers,
                  total_ins_customers: totalInsCust,
                  total_travel_customers: totalTravel,
                  total_pop_18plus: totalPop18,
                  insurance_cross_sell_pct: (insCrossSell * 100).toFixed(2),
                  member_adult_reach_pct: (adultReach * 100).toFixed(2),
                  travel_engagement_pct: (travelEngage * 100).toFixed(2),
                  rev_2025: Y2025_REV,
                  rev_2028: Y2028_REV,
                }}
              />
              <div className="mt-5">
                <HeadwindsOpps
                  headwinds={headwinds}
                  opportunities={opportunities}
                  bottomLine="Leadership has invested in five phases of brand health research since 2023, shifted to a stronger convenience billing model, and launched digital-first acquisition campaigns. The retention challenge ahead is primarily external. The response is not price defense but value demonstration + tiered pricing + product breadth."
                />
              </div>
            </section>

            {/* ── 2. Growth Opportunity Map ──────────────────────── */}
            <section id="opportunity-map">
              <SectionHeader
                page="Strategic Overview"
                title="Growth Opportunity Map"
                subtitle="The gap by product line — penetration, coverage & addressable upside"
              />
              <GrowthOpportunityMap
                thesis={`AAA WCNY has ${fmt.num(totalMembers)} members — a trusted brand present in households across every county in Western and Central New York. Yet only ${fmt.pctPlain(insCrossSell * 100, 1)} of members have AAA insurance. The path to $120.5M is not new markets. It is activation of existing relationships, starting with the members we already have.`}
                plays={plays}
                productRows={productRows}
              />
            </section>

            {/* ── 3. Revenue Composition ─────────────────────────── */}
            <section id="revenue-composition">
              <SectionHeader
                page="Page 03"
                title="Revenue Composition — 2025 vs 2028"
                subtitle="Insurance grows from 9.6% → 15.3% — the activation lever driving $102.2M → $120.5M"
                rightSlot={
                  <DownloadButton
                    filename="revenue-composition-2025-vs-2028"
                    rows={[
                      ...REV_2025.map((s) => ({ year: 2025, product: s.product, revenue: s.value, pct: s.pct })),
                      ...REV_2028.map((s) => ({ year: 2028, product: s.product, revenue: s.value, pct: s.pct })),
                    ]}
                  />
                }
              />
              <RevenueComposition
                year1Label="2025 YE"
                year1Total={Y2025_REV}
                year1Slices={REV_2025}
                year2Label="2028 Target"
                year2Total={Y2028_REV}
                year2Slices={REV_2028}
              />
              <PunchlineCard
                punchline="Insurance nearly doubles. Mix shifts from 9.6% → 15.3% of total revenue. Every other product holds or modestly grows. The capital allocation decision: more agent capacity, more cross-sell touchpoints, more carrier breadth."
                action="Approve the 2026 insurance capacity expansion. Tie agent quotas to cross-sell, not standalone-new-business."
              />
            </section>

            {/* ── 4. Current Member Footprint ───────────────────── */}
            <section id="member-footprint">
              <SectionHeader
                page="Page 04"
                title="Current Member Footprint"
                subtitle="Where AAA has membership presence — county map + ranked table"
                rightSlot={<DownloadButton filename="member-footprint-by-county" rows={countyCsvRows} />}
              />
              <IntroBlock
                shows="Membership penetration rate by county: AAA members as % of adults 18+ in each county. Map shows geographic pattern; bar chart ranks every county."
                read="Darker counties = stronger AAA presence. Counties below the average line are acquisition targets. High-penetration counties are the platform for cross-product activation."
              />
              {loadingMap ? (
                <div className="h-[420px] flex items-center justify-center text-sm text-gray-500">Loading territory data…</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-2">
                    <CountyChoropleth
                      geojson={countyGeojson}
                      countyMetrics={memberPenMetrics}
                      ramp="membership"
                      valueKind="pct"
                      unit="%"
                      height={420}
                      title="Membership Penetration by County"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <CountyRankedBars
                      rows={rankedRows}
                      title="Ranked: Membership Penetration %"
                      average={avgPen}
                      color={GROWTH_COLORS.teal}
                      valueKind="pct"
                      height={420}
                    />
                  </div>
                </div>
              )}
              <PunchlineCard
                punchline={
                  lowestPen.length
                    ? `Membership is thinnest in ${lowestPen.join(', ')}. Several may be shared with neighboring AAA clubs — confirm club allocation before scoping a campaign.`
                    : 'Loading county data…'
                }
                action="Schedule ZIP-level direct mail in the lowest-penetration counties within Q2 after confirming club allocation. Budget $15K per WCNY-exclusive county. Measure new member adds monthly."
              />
            </section>

            {/* ── 5. Three Conversion Funnels ───────────────────── */}
            <section id="penetration-glance">
              <SectionHeader
                page="Page 05"
                title="Market Penetration at a Glance"
                subtitle="Three conversion funnels — members, insurance, travel"
                rightSlot={
                  <DownloadButton
                    filename="penetration-funnels"
                    rows={[
                      { funnel: 'Adult Population Reach', numerator: totalMembers, denominator: totalPop18, pct: (adultReach * 100).toFixed(2) },
                      { funnel: 'Member-to-Insurance Conversion', numerator: totalInsCust, denominator: totalMembers, pct: (insCrossSell * 100).toFixed(2) },
                      { funnel: 'Member-to-Travel Engagement', numerator: totalTravel, denominator: totalMembers, pct: (travelEngage * 100).toFixed(2) },
                    ]}
                  />
                }
              />
              <IntroBlock
                shows="Three donut charts: (1) AAA members as % of all adults 18+, (2) insurance customers as % of members, (3) active travel customers (3-yr window) as % of members."
                read="Each donut center shows the conversion rate. The gray arc is the gap — unconverted potential. The bigger the gray arc, the bigger the opportunity."
              />
              <FunnelDonuts
                donuts={[
                  { title: 'Adult Population Reach', centerLabel: 'of adults are members', value: adultReach, num: totalMembers, denom: totalPop18, numLabel: 'AAA Members', denomLabel: 'Adults 18+', color: GROWTH_COLORS.teal },
                  { title: 'Member-to-Insurance Conversion', centerLabel: 'of members have AAA Ins.', value: insCrossSell, num: totalInsCust, denom: totalMembers, numLabel: 'Have AAA Insurance', denomLabel: 'Members', color: GROWTH_COLORS.navyLight },
                  { title: 'Member-to-Travel Engagement', centerLabel: 'of members buy travel', value: travelEngage, num: totalTravel, denom: totalMembers, numLabel: 'Travel Buyers (3yr)', denomLabel: 'Members', color: GROWTH_COLORS.orangeLight },
                ]}
              />
              <PunchlineCard
                punchline={`${fmt.num(totalMembers)} members. Only ${fmt.pctPlain(insCrossSell * 100, 1)} have AAA insurance. The gray arc is ${fmt.num(totalMembers - totalInsCust)} members — the activation pipeline.`}
                action="Pull the Salesforce list of members without insurance. Assign each to nearest agent by ZIP. Begin outreach within 30 days."
              />
            </section>

            {/* ── 6. Market Health — Six Penetration Lenses ────── */}
            <section id="market-health">
              <SectionHeader
                page="Page 06"
                title="Market Health — Penetration Lenses"
                subtitle="Geographic view across product opportunities"
                rightSlot={<DownloadButton filename="six-penetration-lenses" rows={countyCsvRows} />}
              />
              <IntroBlock
                shows="Four county choropleth maps in a grid: membership penetration · insurance cross-sell rate · auto market share · travel penetration."
                read="A county dark on map 1 (many members) but light on map 2 (low insurance conversion) is an activation gap — high cross-sell ROI. Same logic applies for each cross-comparison."
              />
              <MarketHealthGrid geojson={countyGeojson} lenses={sixLenses} />
              <PunchlineCard
                punchline={`The largest activation gap appears in counties that are dark on membership but light on insurance — those are where the BD Lead should focus the next 90 days.`}
                action="Assign the top 3 cross-sell-gap counties to a named BD Lead for Q2. Each county gets a 90-day activation plan: agent assignments, outreach cadence, monthly conversion target."
              />
            </section>

            {/* ── 7. Product Opportunity Map ─────────────────── */}
            <section id="product-opportunity">
              <SectionHeader
                page="Page 07"
                title="Product Opportunity Map"
                subtitle="Penetration metrics side-by-side · short bars = biggest opportunity"
                rightSlot={<DownloadButton filename="product-opportunity-grouped" rows={countyCsvRows.slice(0, 20)} />}
              />
              <IntroBlock
                shows="Grouped horizontal bars showing 4 penetration metrics for the top 20 counties by member count."
                read="Look for counties where the membership bar is long but insurance and travel bars are short — that is the activation gap."
              />
              <GroupedCountyBars
                rows={groupedRows}
                series={[
                  { name: 'Membership %', color: GROWTH_COLORS.navy },
                  { name: 'Insurance Cross-sell %', color: GROWTH_COLORS.teal },
                  { name: 'Travel %', color: GROWTH_COLORS.orangeLight },
                  { name: 'Auto Market Share %', color: GROWTH_COLORS.purpleLight },
                ]}
                height={520}
              />
              <PunchlineCard
                punchline="Insurance and travel are the shortest bars in nearly every county. The largest cross-sell gap is in the top-3 member-count counties."
                action="BD Lead owns the top-3 member counties personally. Named agent list + 30-day outreach + monthly target per county."
              />
            </section>

            {/* ── 8. Investment Priority Matrix ────────────────── */}
            <section id="priority-matrix">
              <SectionHeader
                page="Page 08"
                title="County Investment Priority Matrix"
                subtitle="Where to invest, where to defend, where to monitor"
                rightSlot={
                  <DownloadButton
                    filename="county-priority-matrix"
                    rows={matrixPoints.map((p) => ({
                      county: p.county,
                      members: p.members,
                      penetration_pct: p.penetrationPct.toFixed(2),
                      insurance_customers: p.insCustomers,
                      tier: p.tier,
                    }))}
                  />
                }
              />
              <IntroBlock
                shows="Scatter plot: X = member base, Y = penetration %, bubble size = insurance customers. Dashed lines show medians, splitting counties into GROW / DEFEND / MAINTAIN tiers."
                read="GROW counties (red) have large bases below median penetration — these get capital. DEFEND counties (teal) have above-median penetration — retention is the move. MAINTAIN (gray) keeps pace."
              />
              <InvestmentPriorityMatrix points={matrixPoints} height={480} />
              <PunchlineCard
                punchline="GROW counties absorb the next dollar — they have the base and the runway. DEFEND counties protect what they already have through bundle retention and value demonstration."
                action="Approve named-county investment allocations: GROW gets agent capacity + marketing budget; DEFEND gets retention program funding."
              />
            </section>

            {/* ── Intelligence Panels (Retention, Depth, Income×Pen, Competitive) ── */}

            {trendsData && (
              <>
                {/* ── Retention & Growth Trends ──────────────────── */}
                <section id="retention-trends">
                  <SectionHeader
                    page="Intelligence"
                    title="Retention & Growth Trends"
                    subtitle="5-year membership flow + insurance policy momentum — are we growing or eroding?"
                  />
                  <IntroBlock
                    shows="Left: membership acquired vs cancelled each year with net growth line. Right: insurance renewals, new business, and cancellations with retention % overlay."
                    read="Acquired > cancelled = growing base. Rising renewals + flat cancellations = compounding insurance book. Retention % below 82% is the alarm threshold."
                  />
                  <RetentionTrends data={trendsData} />
                  <PunchlineCard
                    punchline="Retention above 82% means you're holding the base. Net membership growth requires acquired outpacing cancelled by >15K/year. Watch both numbers, not just total members."
                    action="Set a monthly dashboard alert: if net membership goes negative for 2 consecutive months, trigger a cancel-save campaign immediately."
                  />
                </section>

                {/* ── Member Depth: LTV + ERS ────────────────────── */}
                <section id="member-depth">
                  <SectionHeader
                    page="Intelligence"
                    title="Member Depth & ERS Health"
                    subtitle="LTV tier distribution + roadside utilization as your best leading retention indicator"
                  />
                  <IntroBlock
                    shows="Left: horizontal bars showing member count in each LTV tier (A=highest, E=lowest). Right: ERS utilization rate — what % of members called roadside in the last 12 months, and which counties are lowest (churn risk)."
                    read="Tier C–E members haven't been activated. ERS utilization below 15% in a county signals members who don't perceive value — they will not renew. Low-utilization ZIPs are where your cancel-save and member engagement resources should go first."
                  />
                  {trendsData.ltv_distribution && trendsData.ers_summary && (
                    <MemberDepthPanel
                      ltv={trendsData.ltv_distribution}
                      ers={trendsData.ers_summary}
                    />
                  )}
                  <PunchlineCard
                    punchline="Members who use ERS renew at materially higher rates. Low-utilization counties are not just low-engagement — they are pre-cancellation. Send a benefit reminder campaign to ZIPs below the average utilization rate."
                    action="Pull the member list for the 3 lowest-utilization counties. Send a targeted 'Did you know?' ERS activation email. Measure 30-day click and 90-day renewal rate."
                  />
                </section>

                {/* ── Income vs Penetration Scatter ──────────────── */}
                {trendsData.county_income_pen.length > 0 && (
                  <section id="income-penetration">
                    <SectionHeader
                      page="Intelligence"
                      title="Income vs Membership Penetration"
                      subtitle="Which high-income counties are under-served? That is where your marketing dollar works hardest."
                    />
                    <IntroBlock
                      shows="Scatter plot: each bubble is a county. X-axis = median household income, Y-axis = membership penetration %, bubble size = total member count. Dashed lines = territory medians."
                      read="Top-left (red) = high income, low penetration = highest ROI acquisition target. Top-right (teal) = high income, high penetration = defend with bundling and upsell. Bottom-left = monitor. Bottom-right = retain with value pricing."
                    />
                    <IncomePenetrationScatter data={trendsData.county_income_pen} />
                    <PunchlineCard
                      punchline="High-income, low-penetration counties generate more revenue per acquired member — lower price sensitivity, higher LTV, more cross-sell potential. These are not awareness gaps; they are acquisition resource allocation gaps."
                      action="Name the top 3 high-income, low-penetration counties. Assign a targeted acquisition budget and a dedicated agent. Measure new members per $1K spent vs territory average."
                    />
                  </section>
                )}

                {/* ── Competitive Landscape ──────────────────────── */}
                {trendsData.competitors.length > 0 && (
                  <section id="competitive">
                    <SectionHeader
                      page="Intelligence"
                      title="Competitive Landscape"
                      subtitle="NY auto insurance market share + AAA/CSAA premium trajectory and complaint ratio"
                    />
                    <IntroBlock
                      shows="Left: premium volume by carrier for the latest year (NY DFS data). Right: AAA/CSAA premium growth vs complaint count over time."
                      read="AAA/CSAA's complaint ratio vs larger carriers is a credibility advantage. Flat or declining premium share signals pricing or distribution issues. Use this in agent training — AAA is not the biggest but it is among the most trusted."
                    />
                    <CompetitiveLandscape competitors={trendsData.competitors} />
                    <PunchlineCard
                      punchline="Market share is not the goal — profitable share in the right segments is. AAA/CSAA's niche in the member base is defensible if agents can articulate it. Erie's over-index in certain counties is the competitive pressure to watch."
                      action="Build a one-page agent talking-point card: AAA vs Erie vs GEICO on price, complaint ratio, and bundled membership value. Distribute at the next all-agent meeting."
                    />
                  </section>
                )}
              </>
            )}

            {/* ── 9-11. Per-Product Deep Dives ─────────────────── */}
            {/* Per product: penetration → growth opportunity → performance → churn */}
            {PRODUCT_QUERIES.map((p, idx) => {
              const data: ProductReportData | undefined = productResults[idx].data
              const cancelReasons = parseCancelReasons(
                data?.retention?.cancel_reasons as Array<Record<string, unknown>> | undefined,
                p.product === 'membership' ? MEMBERSHIP_CANCEL_REASONS : INSURANCE_CANCEL_REASONS,
              )
              return (
                <ProductGrowthSection
                  key={p.product}
                  product={p.product}
                  sectionId={p.sectionId}
                  label={p.label}
                  accentColor={p.color}
                  data={data}
                  canonical={canonical}
                  coverageTiers={coverageTiers}
                  cancelReasons={cancelReasons}
                />
              )
            })}

            {/* ── 12. Medicare & Driver Programs ───────────────── */}
            <section id="medicare-driver">
              <SectionHeader
                page="Section · Emerging"
                title="Medicare & Driver Programs"
                subtitle="Opportunity products — sized by population density, no SF enrollment data yet"
              />
              <IntroBlock
                shows="Medicare opportunity = 65+ population density per county; Driver Programs = 16-18 teen density. These are opportunity maps, not penetration maps."
                read="High-density counties for either segment are prospect zones. Action is to size the addressable market and decide whether to certify agents (Medicare) or launch a teen program (Driver Programs)."
              />
              <AINarrative
                section="medicare-driver"
                context={{
                  total_pop_18plus: totalPop18,
                  note: 'Medicare and Driver Programs do not yet have SF enrollment data — these maps reflect opportunity, not penetration.',
                }}
              />
              <PunchlineCard
                punchline="These are future-leg revenue products. Medicare requires agent certification — a 6-month commitment. Driver Programs reach the next generation of members upstream."
                action="Approve a Medicare agent-certification pilot in the highest-density 65+ counties for 2027. Approve a Driver Program partnership with 2 HS districts in the highest-teen-density counties."
              />
            </section>

            {/* ── 13a. Data Explorer — search, sort, drill, download ── */}
            <section id="data-explorer">
              <SectionHeader
                page="Data"
                title="Data Explorer"
                subtitle="Search, sort, and drill into every ZIP code. Click any row to open the ZIP detail view."
              />
              <IntroBlock
                shows="Every ZIP code in the WCNY territory with member, insurance, travel, and demographic data. Search by ZIP, city, county, or region; sort any column."
                read={'Type a county or city to filter. Click any column header to sort. The "Drill" link opens that ZIP detail page. The Download button exports the filtered rows as CSV.'}
              />
              {mapData?.zips && mapData.zips.length > 0 ? (
                <DataExplorer zips={mapData.zips} />
              ) : (
                <div
                  className="rounded-xl border bg-white p-6 text-center text-sm"
                  style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.inkSoft }}
                >
                  Loading territory data…
                </div>
              )}
            </section>

            {/* ── 13. Strategy & Appendix ──────────────────────── */}
            <section id="strategy-appendix">
              <SectionHeader
                page="Closing"
                title="Cross-Product Strategy & Appendix"
                subtitle="Channel × segment matrix · four growth plays · 20 actionable next steps · execution roadmap"
              />
              <AINarrative
                section="strategy-appendix"
                context={{
                  total_members: totalMembers,
                  total_ins_customers: totalInsCust,
                  total_travel_customers: totalTravel,
                  rev_gap: GROWTH_NEEDED,
                  insurance_cross_sell_pct: (insCrossSell * 100).toFixed(2),
                  target_year: 2028,
                }}
              />
              <PunchlineCard
                punchline={`The path to $120.5M is mathematically clear: insurance from $9.6M → $18.4M, membership $68.7M → $75.7M, travel $14.3M → $15.4M. Insurance is the lever. Members are the audience. Counties are the map.`}
                action="Approve the 2026 capital allocation across the four growth plays. Tie BD Lead quarterly OKRs to county-level conversion targets. Re-evaluate quarterly."
              />
            </section>

            {/* Closing rule */}
            <div className="text-center py-6 text-[10px] uppercase tracking-[0.22em]" style={{ color: GROWTH_COLORS.inkSoft }}>
              End of Report · AAA WCNY Strategic Intelligence · Confidential
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
