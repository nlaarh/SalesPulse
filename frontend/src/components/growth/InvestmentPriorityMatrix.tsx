import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

export interface MatrixPoint {
  county: string
  members: number       // x-axis (size of base)
  penetrationPct: number  // y-axis (penetration)
  insCustomers: number  // bubble size
  tier: 'GROW' | 'DEFEND' | 'MAINTAIN'
}

interface InvestmentPriorityMatrixProps {
  points: MatrixPoint[]
  height?: number
}

const TIER_COLOR: Record<MatrixPoint['tier'], string> = {
  GROW: GROWTH_COLORS.red,
  DEFEND: GROWTH_COLORS.teal,
  MAINTAIN: GROWTH_COLORS.inkSoft,
}

export default function InvestmentPriorityMatrix({ points, height = 460 }: InvestmentPriorityMatrixProps) {
  const xValues = points.map((p) => p.members)
  const yValues = points.map((p) => p.penetrationPct)
  const xMedian = median(xValues)
  const yMedian = median(yValues)

  const option = {
    grid: { top: 36, right: 24, bottom: 50, left: 60 },
    title: {
      text: 'County Investment Priority Matrix',
      subtext: 'X = member base · Y = penetration · size = insurance customers',
      left: 'center',
      top: 6,
      textStyle: { fontSize: 11, fontWeight: 600, color: GROWTH_COLORS.navy, fontFamily: 'inherit' },
      subtextStyle: { fontSize: 10, color: GROWTH_COLORS.inkSoft, fontFamily: 'inherit' },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { data: [number, number, number, string, MatrixPoint['tier']] }
        const [x, y, size, county, tier] = p.data
        return `<b>${county}</b> · <span style="color:${TIER_COLOR[tier]}">${tier}</span><br/>
          Members: ${fmt.num(x)}<br/>
          Penetration: ${fmt.pctPlain(y, 1)}<br/>
          Insurance custs: ${fmt.num(size)}`
      },
    },
    xAxis: {
      type: 'value',
      name: 'Member base',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => fmt.num(v) },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Penetration %',
      nameLocation: 'middle',
      nameGap: 42,
      nameTextStyle: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: (v: number[]) => Math.min(40, Math.max(6, Math.sqrt(v[2]) * 0.7)),
        data: points.map((p) => ({
          value: [p.members, p.penetrationPct, p.insCustomers, p.county, p.tier],
          itemStyle: {
            color: metallicGradient(TIER_COLOR[p.tier], { direction: 'vertical', alpha: 0.85 }),
            borderColor: '#FFFFFF',
            borderWidth: 1.5,
            ...metallicShadow(TIER_COLOR[p.tier], 0.32),
          },
        })),
        label: {
          show: true,
          formatter: (params: { data: { value: unknown[] } }) => String(params.data.value[3]),
          fontSize: 8.5,
          color: GROWTH_COLORS.ink,
          position: 'top',
          distance: 4,
          // Hide labels that would collide with another label
          // (ECharts handles this via labelLayout below)
        },
        labelLayout: {
          hideOverlap: true,
          moveOverlap: 'shiftY',
        },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: '#9CA3AF', type: 'dashed', width: 1 },
          data: [
            { xAxis: xMedian, label: { formatter: 'Median', color: GROWTH_COLORS.inkSoft, fontSize: 9 } },
            { yAxis: yMedian },
          ],
        },
        animationDuration: 700,
      },
    ],
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
      <div className="px-4 pb-3 pt-1 flex gap-4 text-[11px]" style={{ color: GROWTH_COLORS.inkSoft }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLOR.GROW }} />
          GROW · large base, below-median penetration
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLOR.DEFEND }} />
          DEFEND · above-median penetration
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLOR.MAINTAIN }} />
          MAINTAIN
        </span>
      </div>
    </div>
  )
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
