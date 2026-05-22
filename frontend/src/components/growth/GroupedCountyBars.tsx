import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

export interface GroupedRow {
  county: string
  values: number[]  // aligned with series
}

interface GroupedCountyBarsProps {
  rows: GroupedRow[]
  series: { name: string; color: string }[]
  title?: string
  height?: number
}

export default function GroupedCountyBars({ rows, series, title, height = 520 }: GroupedCountyBarsProps) {
  const counties = rows.map((r) => r.county)

  const option = {
    grid: { top: title ? 56 : 10, right: 100, bottom: 28, left: 100 },
    title: title
      ? {
          text: title,
          left: 'center',
          top: 6,
          textStyle: { fontSize: 11, fontWeight: 600, color: GROWTH_COLORS.navy, fontFamily: 'inherit' },
        }
      : undefined,
    legend: {
      top: 30,
      icon: 'rect',
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft },
      data: series.map((s) => s.name),
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number; seriesName: string; color: string }[]
        const head = `<b>${arr[0]?.name ?? ''}</b>`
        const body = arr.map((p) => `
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;background:${p.color}"></span>
            <span style="flex:1">${p.seriesName}</span>
            <b>${fmt.pctPlain(p.value, 1)}</b>
          </div>`).join('')
        return `${head}${body}`
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: '{value}%' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    yAxis: {
      type: 'category',
      data: counties,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: GROWTH_COLORS.ink, fontSize: 9 },
    },
    series: series.map((s, idx) => ({
      name: s.name,
      type: 'bar',
      data: rows.map((r) => r.values[idx] ?? 0),
      itemStyle: {
        color: metallicGradient(s.color, { direction: 'horizontal', alpha: 0.95 }),
        borderRadius: [0, 3, 3, 0],
        ...metallicShadow(s.color, 0.18),
      },
      barWidth: 6,
      barCategoryGap: '28%',
    })),
    animationDuration: 700,
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
    </div>
  )
}
