import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicAreaGradient } from './tokens'
import type { TrendsResponse } from '@/lib/api_growth'

interface Props {
  data: TrendsResponse
}

export default function RetentionTrends({ data }: Props) {
  const memRows = data.membership_trend ?? []
  const insRows = data.insurance_retention ?? []

  const memYears = memRows.map((r) => r.year ?? '')
  const memAcquired = memRows.map((r) => Number(r.acquired ?? 0))
  const memCancelled = memRows.map((r) => Number(r.cancelled ?? 0))
  const memNet = memAcquired.map((a, i) => a - memCancelled[i])

  const insYears = insRows.map((r) => r.year ?? '')
  const insRenb = insRows.map((r) => Number(r.renb ?? 0))
  const insNewb = insRows.map((r) => Number(r.newb ?? 0))
  const insCanc = insRows.map((r) => Number(r.canc ?? 0))
  const insRetPct = insRows.map((r) => Number(r.retention_pct ?? 0))

  const memOption = {
    grid: { top: 36, right: 16, bottom: 52, left: 64 },
    legend: { bottom: 0, icon: 'rect', itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category', data: memYears,
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => fmt.num(v) },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF1F4' } },
    },
    series: [
      {
        name: 'Acquired', type: 'bar', data: memAcquired, barMaxWidth: 28,
        itemStyle: { color: GROWTH_COLORS.teal },
      },
      {
        name: 'Cancelled', type: 'bar', data: memCancelled, barMaxWidth: 28,
        itemStyle: { color: GROWTH_COLORS.red },
      },
      {
        name: 'Net Growth', type: 'line', data: memNet, smooth: true,
        lineStyle: { width: 2.5, color: GROWTH_COLORS.navy },
        itemStyle: { color: GROWTH_COLORS.navy },
        symbolSize: 6,
        areaStyle: { color: metallicAreaGradient(GROWTH_COLORS.navy) },
      },
    ],
    animationDuration: 700,
  }

  const insOption = {
    grid: { top: 36, right: 56, bottom: 52, left: 64 },
    legend: { bottom: 0, icon: 'rect', itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 9, color: GROWTH_COLORS.inkSoft } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category', data: insYears,
      axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9 },
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value', name: 'Policies',
        axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => fmt.num(v) },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: '#EEF1F4' } },
      },
      {
        type: 'value', name: 'Ret. %', min: 75, max: 95,
        axisLabel: { color: GROWTH_COLORS.inkSoft, fontSize: 9, formatter: (v: number) => `${v}%` },
        axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Renewals', type: 'bar', data: insRenb, barMaxWidth: 22,
        itemStyle: { color: GROWTH_COLORS.teal },
        areaStyle: { color: metallicAreaGradient(GROWTH_COLORS.teal) },
      },
      {
        name: 'New Business', type: 'bar', data: insNewb, barMaxWidth: 22,
        itemStyle: { color: GROWTH_COLORS.green },
      },
      {
        name: 'Cancellations', type: 'bar', data: insCanc, barMaxWidth: 22,
        itemStyle: { color: GROWTH_COLORS.red },
      },
      {
        name: 'Retention %', type: 'line', yAxisIndex: 1, data: insRetPct,
        smooth: true, lineStyle: { width: 2.5, color: GROWTH_COLORS.navy },
        itemStyle: { color: GROWTH_COLORS.navy }, symbolSize: 6,
      },
    ],
    animationDuration: 700,
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: GROWTH_COLORS.navy }}>
          Membership Flow — Acquired vs Cancelled
        </p>
        <ReactECharts option={memOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'svg' }} />
        <p className="text-[10px] mt-2 leading-relaxed" style={{ color: GROWTH_COLORS.inkSoft }}>
          Net growth = acquired minus cancelled each year. Negative net = the base is shrinking before renewals.
        </p>
      </div>
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: GROWTH_COLORS.rule }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: GROWTH_COLORS.navy }}>
          Insurance Policy Flow — Renewals, New Business, Cancellations
        </p>
        <ReactECharts option={insOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'svg' }} />
        <p className="text-[10px] mt-2 leading-relaxed" style={{ color: GROWTH_COLORS.inkSoft }}>
          Retention % (right axis) is the true health signal. Renewals growing faster than cancellations = compounding book.
        </p>
      </div>
    </div>
  )
}
