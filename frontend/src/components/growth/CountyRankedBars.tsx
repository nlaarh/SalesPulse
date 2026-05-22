import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

interface CountyRankedBarsProps {
  rows: { county: string; value: number }[]
  title?: string
  /** Average line (dashed) */
  average?: number
  color?: string
  valueKind?: 'pct' | 'count'
  height?: number
}

export default function CountyRankedBars({
  rows,
  title,
  average,
  color = GROWTH_COLORS.teal,
  valueKind = 'pct',
  height = 380,
}: CountyRankedBarsProps) {
  // Sort ascending so highest is at top (ECharts inverts y when used)
  const sorted = [...rows].sort((a, b) => a.value - b.value)
  const counties = sorted.map((r) => r.county)
  const values = sorted.map((r) => r.value)

  const option = {
    grid: { top: title ? 30 : 8, right: 30, bottom: 28, left: 90 },
    title: title
      ? {
          text: title,
          left: 'center',
          top: 4,
          textStyle: { fontSize: 11, fontWeight: 600, color: GROWTH_COLORS.navy, fontFamily: 'inherit' },
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number }[]
        const p = arr[0]
        const valStr = valueKind === 'pct' ? fmt.pctPlain(p.value, 1) : fmt.num(p.value)
        return `<b>${p.name}</b><br/>${valStr}`
      },
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
      axisLabel: {
        color: GROWTH_COLORS.inkSoft,
        fontSize: 9,
        formatter: (v: number) => (valueKind === 'pct' ? `${v.toFixed(0)}%` : fmt.num(v)),
      },
    },
    yAxis: {
      type: 'category',
      data: counties,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GROWTH_COLORS.ink, fontSize: 9 },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barWidth: '60%',
        itemStyle: {
          color: metallicGradient(color, { direction: 'horizontal', alpha: 0.95 }),
          borderRadius: [0, 4, 4, 0],
          ...metallicShadow(color, 0.22),
        },
        animationDuration: 600,
        markLine:
          average == null
            ? undefined
            : {
                symbol: 'none',
                data: [{ xAxis: average }],
                lineStyle: { color: GROWTH_COLORS.red, type: 'dashed', width: 1.5 },
                label: {
                  formatter: `Avg ${valueKind === 'pct' ? fmt.pctPlain(average, 1) : fmt.num(average)}`,
                  position: 'end',
                  color: GROWTH_COLORS.red,
                  fontSize: 9,
                },
              },
      },
    ],
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
    </div>
  )
}
