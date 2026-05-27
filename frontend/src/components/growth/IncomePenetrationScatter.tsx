import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt } from './tokens'
import type { CountyIncomePen } from '@/lib/api_growth'

interface Props {
  data: CountyIncomePen[]
}

export default function IncomePenetrationScatter({ data }: Props) {
  if (!data.length) return null

  const incomes = data.map((d) => d.median_income)
  const pens = data.map((d) => d.mem_pen_pct)
  const medIncome = [...incomes].sort((a, b) => a - b)[Math.floor(incomes.length / 2)]
  const medPen = [...pens].sort((a, b) => a - b)[Math.floor(pens.length / 2)]
  const maxMembers = Math.max(...data.map((d) => d.members))

  // Quadrant colors
  function quadrantColor(income: number, pen: number): string {
    const hiInc = income >= medIncome
    const hiPen = pen >= medPen
    if (hiInc && !hiPen) return GROWTH_COLORS.red          // High income, low pen = invest here
    if (hiInc && hiPen) return GROWTH_COLORS.teal           // High income, high pen = defend
    if (!hiInc && !hiPen) return GROWTH_COLORS.orangeLight  // Low income, low pen = monitor
    return GROWTH_COLORS.purpleLight                         // Low income, high pen = loyal, lower LTV
  }

  const scatterData = data.map((d) => ({
    value: [d.median_income, d.mem_pen_pct, d.members, d.county],
    symbolSize: Math.max(8, Math.sqrt(d.members / maxMembers) * 48),
    itemStyle: { color: quadrantColor(d.median_income, d.mem_pen_pct), opacity: 0.82 },
    label: { show: d.members > 15000, formatter: d.county, fontSize: 8, color: GROWTH_COLORS.ink, position: 'top' },
  }))

  const option = {
    grid: { top: 24, right: 24, bottom: 40, left: 72 },
    tooltip: {
      trigger: 'item',
      formatter: (p: { value: [number, number, number, string] }) =>
        `<b>${p.value[3]}</b><br/>Income: ${fmt.dollars(p.value[0])}<br/>Penetration: ${p.value[1].toFixed(1)}%<br/>Members: ${fmt.num(p.value[2])}`,
    },
    xAxis: {
      type: 'value',
      name: 'Median Household Income',
      nameLocation: 'middle', nameGap: 28,
      nameTextStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => fmt.dollars(v) },
      axisLine: { lineStyle: { color: '#E5E7EB' } }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    yAxis: {
      type: 'value',
      name: 'Membership Penetration %',
      nameLocation: 'middle', nameGap: 52,
      nameTextStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => `${v}%` },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    markLine: {
      silent: true,
      lineStyle: { type: 'dashed', color: GROWTH_COLORS.inkSoft, opacity: 0.4, width: 1 },
      data: [
        { xAxis: medIncome, label: { formatter: 'Median Income', fontSize: 8 } },
        { yAxis: medPen, label: { formatter: 'Median Pen.', fontSize: 8 } },
      ],
    },
    series: [{
      type: 'scatter',
      data: scatterData,
      label: { show: true },
      markLine: {
        silent: true,
        lineStyle: { type: 'dashed', color: GROWTH_COLORS.inkSoft, opacity: 0.4, width: 1 },
        data: [
          { xAxis: medIncome },
          { yAxis: medPen },
        ],
      },
    }],
    animationDuration: 700,
  }

  const quadrants = [
    { color: GROWTH_COLORS.red, label: 'High Income · Low Pen', action: 'Invest — highest ROI per acquisition' },
    { color: GROWTH_COLORS.teal, label: 'High Income · High Pen', action: 'Defend — bundle & upsell' },
    { color: GROWTH_COLORS.purpleLight, label: 'Low Income · High Pen', action: 'Retain — value-price focus' },
    { color: GROWTH_COLORS.orangeLight, label: 'Low Income · Low Pen', action: 'Monitor — lower priority' },
  ]

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: GROWTH_COLORS.navy }}>
        Income vs Membership Penetration by County
      </p>
      <p className="text-[10px] mb-3" style={{ color: GROWTH_COLORS.inkSoft }}>
        Bubble size = member count. Dashed lines = territory medians. Top-left (red) = high-income, low-penetration — your highest-ROI investment targets.
      </p>
      <ReactECharts option={option} style={{ height: 360, width: '100%' }} opts={{ renderer: 'svg' }} />
      <div className="flex flex-wrap gap-4 mt-3">
        {quadrants.map((q) => (
          <div key={q.label} className="flex items-start gap-2">
            <span className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: q.color }} />
            <div>
              <p className="text-[10px] font-semibold" style={{ color: GROWTH_COLORS.ink }}>{q.label}</p>
              <p className="text-[9px]" style={{ color: GROWTH_COLORS.inkSoft }}>{q.action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
