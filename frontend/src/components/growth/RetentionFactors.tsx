import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

// Softer professional palette
const ADDRESSABLE_COLOR = '#DC2655'  // refined rose (less heavy than crimson)
const STRUCTURAL_COLOR = '#64748B'   // slate-500 — lighter steel

export interface RetentionFactor {
  reason: string
  pct: number  // 0-100, share of cancellations
  /** Optional: split a factor into addressable (the company can change) vs not (e.g. deceased) */
  addressable?: boolean
}

interface RetentionFactorsProps {
  factors: RetentionFactor[]
  title?: string
  subtitle?: string
  height?: number
}

// Horizontal bar chart of cancellation reasons — matches the PDF
// "Why Members Leave — Root-Cause Analysis" style.
// Addressable factors are colored red, non-addressable gray.
export default function RetentionFactors({
  factors,
  title = 'Why Members Leave — Root-Cause Analysis',
  subtitle = 'Share of annual cancellations by reason · red = addressable · gray = structural',
  height = 360,
}: RetentionFactorsProps) {
  const sorted = [...factors].sort((a, b) => a.pct - b.pct)
  const reasons = sorted.map((f) => f.reason)
  const values = sorted.map((f) => f.pct)
  const baseColors = sorted.map((f) =>
    f.addressable === false ? STRUCTURAL_COLOR : ADDRESSABLE_COLOR,
  )

  const totalAddressable = factors
    .filter((f) => f.addressable !== false)
    .reduce((s, f) => s + f.pct, 0)

  const option = {
    grid: { top: 70, right: 28, bottom: 20, left: 180 },
    title: {
      text: title,
      subtext: subtitle,
      left: 10,
      top: 8,
      textStyle: { fontSize: 11, fontWeight: 700, color: GROWTH_COLORS.navy, fontFamily: 'inherit' },
      subtextStyle: { fontSize: 9.5, color: GROWTH_COLORS.inkSoft, fontFamily: 'inherit' },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number; dataIndex: number }[]
        const p = arr[0]
        const f = sorted[p.dataIndex]
        const tag = f.addressable === false ? 'Structural (non-addressable)' : 'Addressable'
        return `<b>${p.name}</b><br/>${fmt.pctPlain(p.value, 1)}<br/><span style="color:${GROWTH_COLORS.inkSoft}">${tag}</span>`
      },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    yAxis: {
      type: 'category',
      data: reasons,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GROWTH_COLORS.ink, fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: metallicGradient(baseColors[i], { direction: 'horizontal', alpha: 0.95 }),
            borderRadius: [0, 4, 4, 0],
            ...metallicShadow(baseColors[i], 0.28),
          },
        })),
        barWidth: '58%',
        animationDuration: 700,
        label: {
          show: true,
          position: 'right',
          formatter: (params: { value: number }) => `${params.value.toFixed(1)}%`,
          color: GROWTH_COLORS.ink,
          fontSize: 9,
          fontWeight: 600,
        },
      },
    ],
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
      <div
        className="px-4 pb-3 -mt-1 text-[11.5px] flex flex-wrap items-center gap-4"
        style={{ color: GROWTH_COLORS.inkSoft }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{
              background: `linear-gradient(90deg, ${ADDRESSABLE_COLOR}88, ${ADDRESSABLE_COLOR})`,
            }}
          />
          Addressable {fmt.pctPlain(totalAddressable, 0)}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{
              background: `linear-gradient(90deg, ${STRUCTURAL_COLOR}88, ${STRUCTURAL_COLOR})`,
            }}
          />
          Structural (no program changes this)
        </span>
      </div>
    </div>
  )
}
