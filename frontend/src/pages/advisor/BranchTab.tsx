/**
 * AdvisorDashboard — Branch Tab
 * Monthly commission + gross sales by branch (Travel and Insurance, PBI source).
 * Charts powered by ECharts with gradient fills and glassmorphic tooltips.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { formatCurrency, cn } from '@/lib/utils'
import { useChartColors, getEChartTooltip, CHART_PALETTE_DARK, CHART_PALETTE_LIGHT } from '@/lib/chart-theme'
import ReactECharts from 'echarts-for-react'
import type { BranchMonthlyData } from '@/lib/api'
import { Building2 } from 'lucide-react'

function BranchShareBar({ pct, colorIdx }: { pct: number; colorIdx: number }) {
  const palette = ['#818CF8','#22D3EE','#34D399','#FCD34D','#A78BFA','#F472B6','#FB923C','#2DD4BF']
  const color = palette[colorIdx % palette.length]
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="tabular-nums text-[11px] font-semibold w-9 text-right">{pct.toFixed(1)}%</span>
      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 2.5, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

export default function BranchTab({ data }: { data: BranchMonthlyData | null }) {
  const [metric, setMetric] = useState<'commission' | 'sales'>('commission')
  const c = useChartColors()
  const palette = c.isDark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT

  if (!data || data.branches.length === 0) {
    return (
      <div className="card-premium flex h-48 items-center justify-center text-sm text-muted-foreground">
        No branch data available
      </div>
    )
  }

  const top8 = data.branches.slice(0, 8)

  // One object per month — keys are branch names, values are the chosen metric
  const months = data.period_months.map(ym => ym.slice(0, 7))
  const series = top8.map((b, i) => {
    const color = palette[i % palette.length]
    const vals  = data.period_months.map(ym => {
      const mo = b.months.find(m => m.label === ym)
      return mo ? Math.round(mo[metric]) : 0
    })
    return {
      name:    b.branch,
      type:    'bar' as const,
      stack:   'total',
      data:    vals,
      itemStyle: {
        color: {
          type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0,   color },
            { offset: 1,   color: color + 'A0' },
          ],
        },
        borderRadius: i === top8.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
      },
      emphasis: { itemStyle: { opacity: 1 } },
    }
  })

  const barOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut' as const,
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      ...getEChartTooltip(c.isDark),
      formatter: (params: { seriesName: string; value: number; color: string }[]) => {
        const lines = params
          .filter(p => p.value > 0)
          .map(p => `
            <div style="display:flex;justify-content:space-between;gap:20px;padding:2px 0">
              <span style="display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
                ${p.seriesName}
              </span>
              <b>${formatCurrency(p.value, true)}</b>
            </div>`)
          .join('')
        return `<div style="font-size:12px">${params[0]?.name ?? ''}<br/>${lines}</div>`
      },
    },
    legend: {
      data:      top8.map(b => b.branch),
      bottom:    0,
      textStyle: { color: c.tick, fontSize: 10, fontFamily: "'Inter', sans-serif" },
      icon:      'circle',
      itemWidth:  8,
      itemHeight: 8,
    },
    grid: { top: 8, right: 8, bottom: 40, left: 8, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: months,
      axisLine:  { show: false },
      axisTick:  { show: false },
      axisLabel: { color: c.tick, fontSize: 10 },
    },
    yAxis: {
      axisLine:  { show: false },
      axisTick:  { show: false },
      axisLabel: {
        color: c.tick, fontSize: 10,
        formatter: (v: number) =>
          v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000   ? `$${(v / 1_000).toFixed(0)}k`
          : `$${v}`,
      },
      splitLine: { lineStyle: { color: c.grid, type: 'dashed' } },
    },
    series,
  }

  const totalComm  = data.branches.reduce((s, b) => s + b.total_commission, 0)
  const totalSales = data.branches.reduce((s, b) => s + b.total_sales, 0)

  return (
    <>
      {/* Stacked bar chart */}
      <motion.div
        className="card-premium p-5"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Branch Performance by Month</h3>
            {data.branches.length > 8 && (
              <span className="text-[11px] text-muted-foreground">(top 8 shown)</span>
            )}
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
            {(['commission', 'sales'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                  metric === m
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'commission' ? 'Commission' : 'Gross Sales'}
              </button>
            ))}
          </div>
        </div>

        <ReactECharts option={barOption} style={{ height: 300 }} />
      </motion.div>

      {/* Summary table */}
      <motion.div
        className="card-premium overflow-hidden"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold">Branch Totals</h3>
          <span className="text-[12px] text-muted-foreground">{data.branches.length} branches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                {['Branch','Commission','Gross Sales','Comm %','Share'].map(h => (
                  <th key={h} className={cn(
                    'px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground',
                    h === 'Branch' ? 'text-left' : 'text-right',
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.branches.map((b, i) => {
                const commPct  = b.total_sales > 0 ? (b.total_commission / b.total_sales) * 100 : 0
                const sharePct = totalComm > 0 ? (b.total_commission / totalComm) * 100 : 0
                return (
                  <tr key={b.branch} className={cn('border-b border-border/20', i % 2 !== 0 && 'bg-secondary/10')}>
                    <td className="px-4 py-2.5 text-[12px] font-medium">
                      <div className="flex items-center gap-2">
                        {i < 8 && (
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: palette[i % palette.length] }}
                          />
                        )}
                        {b.branch}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] tabular-nums font-semibold">
                      {formatCurrency(b.total_commission, true)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {formatCurrency(b.total_sales, true)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {commPct > 0 ? `${commPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {sharePct > 0
                        ? <BranchShareBar pct={sharePct} colorIdx={i} />
                        : <span className="text-right block text-[12px] text-muted-foreground">—</span>}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-border bg-secondary/20 font-semibold">
                <td className="px-4 py-2.5 text-[12px]">Total</td>
                <td className="px-4 py-2.5 text-right text-[12px] tabular-nums">{formatCurrency(totalComm, true)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">{formatCurrency(totalSales, true)}</td>
                <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                  {totalSales > 0 ? `${((totalComm / totalSales) * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground font-semibold">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </>
  )
}
