import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt } from './tokens'
import type { LtvDistribution, ErsSummary } from '@/lib/api_growth'

interface Props {
  ltv: LtvDistribution
  ers: ErsSummary
}

const LTV_TIERS = [
  { key: 'ltv_a', label: 'Tier A — Premier', desc: 'Multi-product, high tenure, active users', color: GROWTH_COLORS.teal },
  { key: 'ltv_b', label: 'Tier B — Engaged', desc: 'At least one cross-product, stable tenure', color: GROWTH_COLORS.navyLight },
  { key: 'ltv_c', label: 'Tier C — Standard', desc: 'Membership only, moderate tenure', color: GROWTH_COLORS.orangeLight },
  { key: 'ltv_d', label: 'Tier D — At-Risk', desc: 'Low engagement, low tenure', color: '#F59E0B' },
  { key: 'ltv_e', label: 'Tier E — Lapsed', desc: 'Minimal usage, high churn probability', color: GROWTH_COLORS.red },
] as const

export default function MemberDepthPanel({ ltv, ers }: Props) {
  const total = ltv.total || 1

  const ltvOption = {
    grid: { top: 8, right: 120, bottom: 8, left: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number; color: string }[]
        if (!arr[0]) return ''
        return `<b>${arr[0].name}</b><br/>${fmt.num(arr[0].value)} members (${((arr[0].value / total) * 100).toFixed(1)}%)`
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => fmt.num(v) },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    yAxis: {
      type: 'category',
      data: LTV_TIERS.map((t) => t.label).reverse(),
      axisLabel: { color: GROWTH_COLORS.ink, fontSize: 9 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: [...LTV_TIERS].reverse().map((t) => ({
        value: ltv[t.key] ?? 0,
        itemStyle: { color: t.color, borderRadius: [0, 3, 3, 0] },
      })),
      barMaxWidth: 24,
      label: {
        show: true, position: 'right',
        formatter: (p: { value: number }) => `${((p.value / total) * 100).toFixed(1)}%`,
        color: GROWTH_COLORS.inkSoft, fontSize: 9,
      },
    }],
    animationDuration: 700,
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* LTV distribution — 2/3 width */}
      <div className="lg:col-span-2 rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GROWTH_COLORS.navy }}>
          Member LTV Tier Distribution
        </p>
        <p className="text-[10px] mb-3" style={{ color: GROWTH_COLORS.inkSoft }}>
          {fmt.num(total)} members segmented by lifetime value tier. Tier A–B are your highest-retention, highest-LTV base.
        </p>
        <ReactECharts option={ltvOption} style={{ height: 200, width: '100%' }} opts={{ renderer: 'svg' }} />
        <p className="text-[10px] mt-2" style={{ color: GROWTH_COLORS.inkSoft }}>
          Tiers C–E ({fmt.num((ltv.ltv_c ?? 0) + (ltv.ltv_d ?? 0) + (ltv.ltv_e ?? 0))} members ·{' '}
          {(((ltv.ltv_c ?? 0) + (ltv.ltv_d ?? 0) + (ltv.ltv_e ?? 0)) / total * 100).toFixed(1)}%) are the cross-sell and
          save-the-member priority pool. Moving one tier up = ~$400 lifetime revenue per member.
        </p>
      </div>

      {/* ERS utilization — 1/3 width */}
      <div className="rounded-xl border bg-white p-4 flex flex-col gap-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GROWTH_COLORS.navy }}>
            ERS Utilization Rate
          </p>
          <p className="text-[10px] mb-3" style={{ color: GROWTH_COLORS.inkSoft }}>
            Members who called roadside in the last 12 months. High utilization = product usage = renewal predictor.
          </p>
          <div className="text-center py-4">
            <div className="text-4xl font-bold" style={{ color: GROWTH_COLORS.teal }}>
              {ers.total_utilization_pct}%
            </div>
            <div className="text-[10px] mt-1" style={{ color: GROWTH_COLORS.inkSoft }}>
              {fmt.num(ers.total_ers_users)} of {fmt.num(ers.total_members)} members used ERS
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: GROWTH_COLORS.navy }}>
            Lowest Utilization (churn risk)
          </p>
          {ers.bottom_counties?.map((c) => (
            <div key={c.county} className="flex justify-between items-center py-0.5">
              <span className="text-[10px]" style={{ color: GROWTH_COLORS.ink }}>{c.county}</span>
              <span className="text-[10px] font-semibold" style={{ color: GROWTH_COLORS.red }}>{c.utilization_pct}%</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: GROWTH_COLORS.navy }}>
            Highest Utilization (most engaged)
          </p>
          {[...(ers.top_counties ?? [])].reverse().map((c) => (
            <div key={c.county} className="flex justify-between items-center py-0.5">
              <span className="text-[10px]" style={{ color: GROWTH_COLORS.ink }}>{c.county}</span>
              <span className="text-[10px] font-semibold" style={{ color: GROWTH_COLORS.teal }}>{c.utilization_pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
