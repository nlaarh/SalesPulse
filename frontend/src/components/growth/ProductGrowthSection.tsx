import { GROWTH_COLORS, fmt } from './tokens'
import ProductDeepDive from './ProductDeepDive'
import DownloadButton from './DownloadButton'
import TrendChart from './TrendChart'
import RetentionFactors, { type RetentionFactor } from './RetentionFactors'
import AINarrative from './AINarrative'
import IntroBlock from './IntroBlock'
import type { ProductReportData, ProductType, GeoZip } from '@/lib/api_product_report'
import type { CanonicalCountsResponse, CoverageTiersResponse } from '@/lib/api_growth'

interface Props {
  product: ProductType
  sectionId: string
  label: string
  accentColor: string
  data: ProductReportData | undefined
  canonical: CanonicalCountsResponse | undefined
  coverageTiers: CoverageTiersResponse | undefined
  /** Pre-parsed cancel reasons (with PDF-aligned fallback). */
  cancelReasons: RetentionFactor[]
}

function canonicalFootprintFor(product: ProductType, canonical?: CanonicalCountsResponse): number | undefined {
  if (!canonical) return undefined
  if (product === 'membership') return canonical.counts.members
  if (product === 'auto') return canonical.total_insurance
  if (product === 'home') return canonical.counts.home_customers
  if (product === 'travel') return canonical.counts.travel_customers
  return undefined
}

/** Top performing ZIPs (highest penetration) — what's working today. */
function PenetrationBars({ zips, color }: { zips: GeoZip[]; color: string }) {
  if (!zips.length) return null
  const max = Math.max(...zips.map(z => z.penetration ?? 0))
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: GROWTH_COLORS.rule }}>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold" style={{ color: GROWTH_COLORS.ink }}>Top Penetrated ZIPs</h4>
        <span className="text-[11px]" style={{ color: GROWTH_COLORS.inkSoft }}>highest share of addressable market</span>
      </div>
      <ul className="space-y-2">
        {zips.slice(0, 8).map(z => {
          const pen = (z.penetration ?? 0) * 100
          const w = max > 0 ? (pen / (max * 100)) * 100 : 0
          return (
            <li key={z.zip} className="text-xs">
              <div className="flex items-center justify-between mb-0.5" style={{ color: GROWTH_COLORS.ink }}>
                <span className="font-mono">{z.zip}</span>
                <span className="font-semibold tabular-nums">{pen.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: GROWTH_COLORS.rule }}>
                  <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
                </div>
                <span className="text-[11px] w-32 truncate" style={{ color: GROWTH_COLORS.inkSoft }}>
                  {z.city}, {z.county}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Bottom-penetrated ZIPs — where growth budget should go. */
function OpportunityList({ zips, color }: { zips: GeoZip[]; color: string }) {
  if (!zips.length) return null
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: GROWTH_COLORS.rule }}>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold" style={{ color: GROWTH_COLORS.ink }}>Top Growth Opportunity ZIPs</h4>
        <span className="text-[11px]" style={{ color: GROWTH_COLORS.inkSoft }}>large addressable, low current share</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: GROWTH_COLORS.inkSoft }}>
            <th className="text-left font-medium pb-1.5">ZIP</th>
            <th className="text-left font-medium pb-1.5">City / County</th>
            <th className="text-right font-medium pb-1.5">Current</th>
            <th className="text-right font-medium pb-1.5">Penetration</th>
          </tr>
        </thead>
        <tbody>
          {zips.slice(0, 8).map(z => (
            <tr key={z.zip} className="border-t" style={{ borderColor: GROWTH_COLORS.rule }}>
              <td className="py-1.5 font-mono" style={{ color: GROWTH_COLORS.ink }}>{z.zip}</td>
              <td className="py-1.5" style={{ color: GROWTH_COLORS.inkSoft }}>{z.city}, {z.county}</td>
              <td className="py-1.5 text-right tabular-nums" style={{ color: GROWTH_COLORS.ink }}>{fmt.num(z.value)}</td>
              <td className="py-1.5 text-right tabular-nums">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ color, backgroundColor: `${color}14` }}
                >
                  {((z.penetration ?? 0) * 100).toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Coverage-tier (Premier / Plus / Basic / Other) breakdown — Membership only. */
function CoverageTierBars({ tiers, color }: { tiers: CoverageTiersResponse | undefined; color: string }) {
  if (!tiers || !tiers.rows.length) return null
  const max = Math.max(...tiers.rows.map(r => r.pct_of_total))
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: GROWTH_COLORS.rule }}>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold" style={{ color: GROWTH_COLORS.ink }}>Members by Coverage Tier</h4>
        <span className="text-[11px]" style={{ color: GROWTH_COLORS.inkSoft }}>
          Total {fmt.num(tiers.totals.count)} · refreshed {tiers.as_of}
        </span>
      </div>
      <ul className="space-y-2.5">
        {tiers.rows.map(r => {
          const w = max > 0 ? (r.pct_of_total / max) * 100 : 0
          return (
            <li key={r.tier} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-medium" style={{ color: GROWTH_COLORS.ink }}>{r.tier}</span>
                <span className="tabular-nums" style={{ color: GROWTH_COLORS.inkSoft }}>
                  {fmt.num(r.count)} · {r.pct_of_total.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: GROWTH_COLORS.rule }}>
                <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function ProductGrowthSection({
  product, sectionId, label, accentColor, data, canonical, coverageTiers, cancelReasons,
}: Props) {
  const trends = data?.trends?.yearly ?? []
  const canonicalFootprint = canonicalFootprintFor(product, canonical)

  const kpis = data
    ? [
        { label: 'Footprint', value: fmt.num(canonicalFootprint ?? data.overview.total_footprint), sub: 'Active customers/members' },
        { label: 'Penetration', value: fmt.pctPlain((data.overview.penetration_pct ?? 0) * 100, 1), sub: 'Of addressable market' },
        { label: 'Opportunity', value: fmt.dollars(data.overview.opportunity_dollars), sub: 'Addressable revenue' },
        { label: 'Action Plays', value: fmt.num(data.actions?.plays?.length ?? 0), sub: 'Recommended initiatives' },
      ]
    : []

  const trendSeries: Array<{ name: string; data: number[]; color: string; area?: boolean }> = []
  if (trends.length) {
    const hasAcq = trends.some(t => typeof t.acquired === 'number')
    const hasCanc = trends.some(t => typeof t.cancelled === 'number')
    if (hasAcq) trendSeries.push({ name: 'Acquired', data: trends.map(t => t.acquired ?? 0), color: GROWTH_COLORS.green, area: true })
    if (hasCanc) trendSeries.push({ name: 'Cancelled', data: trends.map(t => t.cancelled ?? 0), color: GROWTH_COLORS.red })
  }
  const xLabels = trends.map(t => String(t.year))

  const topZips: GeoZip[] = data?.geography?.top_zips ?? []
  const bottomZips: GeoZip[] = data?.geography?.bottom_zips ?? []
  const showChurn = product === 'membership' || product === 'auto' || product === 'home'
  const churnTitle = product === 'membership' ? 'Why Members Leave — Root-Cause Analysis' : 'Why Policies Cancel — Root-Cause Analysis'

  return (
    <section id={sectionId}>
      <ProductDeepDive
        page={`Section · ${label}`}
        productName={label}
        subtitle="Penetration · growth opportunity · 5-year trend · retention"
        accentColor={accentColor}
        kpis={kpis}
        rightSlot={
          data
            ? (
              <DownloadButton
                filename={`${product}-trend-and-geo`}
                rows={[
                  ...trends.map(t => ({ kind: 'trend', ...t })),
                  ...topZips.map(z => ({ kind: 'top_zip', ...z })),
                  ...bottomZips.map(z => ({ kind: 'opportunity_zip', ...z })),
                ]}
              />
            )
            : undefined
        }
      >
        {/* 1. Penetration map → where we are present */}
        <IntroBlock
          shows={`Top and bottom ZIPs for ${label} penetration. Top = where ${label.toLowerCase()} works today. Bottom = where the addressable market is largest relative to current share.`}
          read="The bigger the gap between a ZIP's addressable market and its current share, the larger the growth lever. Pair these lists with the cross-product map upstream to prioritize."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PenetrationBars zips={topZips} color={accentColor} />
          <OpportunityList zips={bottomZips} color={accentColor} />
        </div>

        {/* 2. Membership-only: customer segment breakdown */}
        {product === 'membership' && (
          <CoverageTierBars tiers={coverageTiers} color={accentColor} />
        )}

        {/* 3. Performance trend → how we're doing */}
        {trendSeries.length > 0 ? (
          <TrendChart
            xLabels={xLabels}
            series={trendSeries}
            title={`${label} — 5-Year Acquisition vs Cancellation`}
            valueKind="num"
            height={300}
          />
        ) : (
          <div className="rounded-xl border bg-white p-6 text-sm" style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.inkSoft }}>
            Trend data not available for {label}.
          </div>
        )}

        {/* 4. Churn root-cause */}
        {showChurn && (
          <RetentionFactors
            factors={cancelReasons}
            title={churnTitle}
            subtitle="Share of annual cancellations by reason · red = addressable · gray = structural"
          />
        )}

        {/* AI commentary */}
        <AINarrative
          section={sectionId}
          context={
            data
              ? {
                  product,
                  footprint: canonicalFootprint ?? data.overview.total_footprint,
                  penetration_pct: data.overview.penetration_pct,
                  opportunity_dollars: data.overview.opportunity_dollars,
                  top_zip_count: topZips.length,
                  bottom_zip_count: bottomZips.length,
                  trend_years: trends.length,
                  action_plays: data.actions?.plays?.length ?? 0,
                }
              : { product }
          }
        />
      </ProductDeepDive>
    </section>
  )
}
