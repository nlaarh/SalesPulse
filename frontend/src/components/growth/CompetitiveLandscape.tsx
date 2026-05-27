import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt } from './tokens'

interface Props {
  competitors: Record<string, string>[]
}

export default function CompetitiveLandscape({ competitors }: Props) {
  if (!competitors.length) return null

  // Get latest year
  const years = [...new Set(competitors.map((r) => r.year))].sort()
  const latestYear = years[years.length - 1]
  const rows = competitors
    .filter((r) => r.year === latestYear)
    .sort((a, b) => Number(b.ny_auto_premium_m) - Number(a.ny_auto_premium_m))

  const carriers = rows.map((r) => r.carrier)
  const premiums = rows.map((r) => Number(r.ny_auto_premium_m))
  const complaints = rows.map((r) => Number(r.total_complaints))
  const maxPrem = Math.max(...premiums)

  // Highlight AAA/CSAA
  const barColors = carriers.map((c) =>
    c.toLowerCase().includes('aaa') || c.toLowerCase().includes('csaa')
      ? GROWTH_COLORS.teal
      : GROWTH_COLORS.navy + '88',
  )

  const premOption = {
    grid: { top: 8, right: 100, bottom: 8, left: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number }[]
        return `<b>${arr[0]?.name}</b><br/>NY Auto Premium: ${fmt.dollars((arr[0]?.value ?? 0) * 1_000_000)}`
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => `$${v}M` },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    yAxis: {
      type: 'category', data: [...carriers].reverse(),
      axisLabel: { color: GROWTH_COLORS.ink, fontSize: 9, width: 140, overflow: 'truncate' },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: [...premiums].reverse().map((v, i) => ({
        value: v,
        itemStyle: { color: [...barColors].reverse()[i], borderRadius: [0, 3, 3, 0] },
      })),
      barMaxWidth: 22,
      label: {
        show: true, position: 'right',
        formatter: (p: { value: number }) => `${((p.value / maxPrem) * 100).toFixed(0)}%`,
        color: GROWTH_COLORS.inkSoft, fontSize: 9,
      },
    }],
    animationDuration: 700,
  }

  // Year-over-year trend for AAA/CSAA
  const aaaRows = competitors
    .filter((r) => r.carrier.toLowerCase().includes('aaa') || r.carrier.toLowerCase().includes('csaa'))
    .sort((a, b) => a.year.localeCompare(b.year))

  const trendOption = {
    grid: { top: 8, right: 16, bottom: 28, left: 56 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category', data: aaaRows.map((r) => r.year),
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
      axisLine: { lineStyle: { color: '#E5E7EB' } }, axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value', name: 'Premium $M',
        axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => `$${v}M` },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: '#EEF1F4' } },
      },
      {
        type: 'value', name: 'Complaints',
        axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'NY Auto Premium', type: 'bar', data: aaaRows.map((r) => Number(r.ny_auto_premium_m)),
        barMaxWidth: 28, itemStyle: { color: GROWTH_COLORS.teal },
      },
      {
        name: 'Complaints', type: 'line', yAxisIndex: 1,
        data: aaaRows.map((r) => Number(r.total_complaints)),
        smooth: true, lineStyle: { width: 2, color: GROWTH_COLORS.red },
        itemStyle: { color: GROWTH_COLORS.red }, symbolSize: 5,
      },
    ],
    legend: { bottom: 0, icon: 'rect', itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft } },
    animationDuration: 700,
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GROWTH_COLORS.navy }}>
          NY Auto Insurance Market — Premium by Carrier ({latestYear})
        </p>
        <p className="text-[10px] mb-3" style={{ color: GROWTH_COLORS.inkSoft }}>
          Teal bar = AAA/CSAA. % = share of largest carrier. NY DFS data — directional, excludes specialty lines.
        </p>
        <ReactECharts option={premOption} style={{ height: 260, width: '100%' }} opts={{ renderer: 'svg' }} />
      </div>
      <div className="lg:col-span-2 rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GROWTH_COLORS.navy }}>
          AAA/CSAA — Premium Growth vs Complaints
        </p>
        <p className="text-[10px] mb-3" style={{ color: GROWTH_COLORS.inkSoft }}>
          Premium growing = gaining market share. Rising complaints without premium growth = service quality risk.
        </p>
        <ReactECharts option={trendOption} style={{ height: 220, width: '100%' }} opts={{ renderer: 'svg' }} />
        <p className="text-[10px] mt-2" style={{ color: GROWTH_COLORS.inkSoft }}>
          Low complaint ratio vs larger carriers is a competitive advantage — use it in agent sales conversations.
        </p>
      </div>
    </div>
  )
}
