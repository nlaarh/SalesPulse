/**
 * AdvisorDashboard — Branch Tab
 * Monthly commission + gross sales by branch (Travel / PBI source).
 */
import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'

function BranchShareBar({ pct, colorIdx }: { pct: number; colorIdx: number }) {
  const colors = ['bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-orange-500', 'bg-teal-500']
  const barColor = colors[colorIdx % colors.length]
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="tabular-nums text-[11px] font-semibold w-9 text-right">{pct.toFixed(1)}%</span>
      <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(pct * 2.5, 100)}%` }} />
      </div>
    </div>
  )
}
import { tooltipStyle } from '@/lib/chart-theme'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { BranchMonthlyData } from '@/lib/api'
import type { ChartColors } from './types'
import { Building2 } from 'lucide-react'

const BRANCH_COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#f97316', '#14b8a6',
]

export default function BranchTab({ data, c }: { data: BranchMonthlyData | null; c: ChartColors }) {
  const [metric, setMetric] = useState<'commission' | 'sales'>('commission')

  if (!data || data.branches.length === 0) {
    return (
      <div className="card-premium flex h-48 items-center justify-center text-sm text-muted-foreground">
        No branch data available
      </div>
    )
  }

  const top8 = data.branches.slice(0, 8)

  // One object per month — keys are branch names, values are the chosen metric
  const chartData = data.period_months.map((ym) => {
    const obj: Record<string, unknown> = { label: ym.slice(0, 7) }
    for (const b of top8) {
      const mo = b.months.find((m) => m.label === ym)
      obj[b.branch] = mo ? Math.round(mo[metric]) : 0
    }
    return obj
  })

  const totalComm  = data.branches.reduce((s, b) => s + b.total_commission, 0)
  const totalSales = data.branches.reduce((s, b) => s + b.total_sales, 0)

  return (
    <>
      {/* Stacked bar chart */}
      <div className="animate-enter card-premium p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Branch Performance by Month</h3>
            {data.branches.length > 8 && (
              <span className="text-[11px] text-muted-foreground">(top 8 shown)</span>
            )}
          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
            <button
              onClick={() => setMetric('commission')}
              className={cn(
                'rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                metric === 'commission'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Commission
            </button>
            <button
              onClick={() => setMetric('sales')}
              className={cn(
                'rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                metric === 'sales'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Gross Sales
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false} tickLine={false}
              tick={{ fill: c.tick, fontSize: 10 }}
            />
            <YAxis
              axisLine={false} tickLine={false}
              tick={{ fill: c.tick, fontSize: 10 }}
              tickFormatter={(v: number) =>
                v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}k`
                : `$${v}`
              }
            />
            <Tooltip
              contentStyle={tooltipStyle(c)}
              formatter={(v: unknown, name: unknown) => [formatCurrency(v as number, true), name as string]}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            {top8.map((b, i) => (
              <Bar
                key={b.branch}
                dataKey={b.branch}
                stackId="a"
                fill={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                fillOpacity={0.85}
                radius={i === top8.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="animate-enter stagger-1 card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold">Branch Totals</h3>
          <span className="text-[12px] text-muted-foreground">{data.branches.length} branches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Branch</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Commission</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Gross Sales</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Comm %</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Share</th>
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
                            style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
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
                      {sharePct > 0 ? <BranchShareBar pct={sharePct} colorIdx={i} /> : <span className="text-right block text-[12px] text-muted-foreground">—</span>}
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
      </div>
    </>
  )
}
