import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicAreaGradient } from './tokens'

export interface TrendSeries {
  name: string
  data: number[]
  color: string
  area?: boolean
}

interface TrendChartProps {
  xLabels: string[]
  series: TrendSeries[]
  title?: string
  valueKind?: 'currency' | 'num' | 'pct'
  height?: number
}

function formatValue(v: number, kind: 'currency' | 'num' | 'pct') {
  if (kind === 'currency') return fmt.dollars(v)
  if (kind === 'pct') return fmt.pctPlain(v, 1)
  return fmt.num(v)
}

export default function TrendChart({ xLabels, series, title, valueKind = 'num', height = 280 }: TrendChartProps) {
  const option = {
    grid: { top: title ? 40 : 14, right: 16, bottom: 28, left: 60 },
    title: title
      ? {
          text: title,
          left: 'center',
          top: 6,
          textStyle: { fontSize: 11, fontWeight: 600, color: GROWTH_COLORS.navy, fontFamily: 'inherit' },
        }
      : undefined,
    legend: {
      bottom: 0,
      icon: 'rect',
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as { name: string; value: number; seriesName: string; color: string }[]
        const head = `<b>${arr[0]?.name ?? ''}</b>`
        const body = arr.map((p) => `
          <div style="display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:8px;height:8px;background:${p.color}"></span>
            <span style="flex:1">${p.seriesName}</span>
            <b>${formatValue(p.value, valueKind)}</b>
          </div>`).join('')
        return `${head}${body}`
      },
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: GROWTH_COLORS.inkSoft,
        fontSize: 9,
        formatter: (v: number) => formatValue(v, valueKind),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      data: s.data,
      lineStyle: { width: 2.5, color: s.color },
      itemStyle: { color: s.color },
      symbol: 'circle',
      symbolSize: 6,
      areaStyle: s.area
        ? { color: metallicAreaGradient(s.color) }
        : undefined,
    })),
    animationDuration: 700,
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'svg' }} />
    </div>
  )
}
