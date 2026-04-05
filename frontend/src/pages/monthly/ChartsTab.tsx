import { formatCurrency, formatNumber } from '@/lib/utils'
import { fmtMonth } from '@/lib/formatters'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import KPICard from '@/components/KPICard'
import { Users, DollarSign, TrendingUp, Target } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area,
} from 'recharts'
import type { AgentReport, Metric } from './types'
import { METRICS } from './types'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface ChartsTabProps {
  agents: AgentReport[]
  monthColumns: string[]
  monthTotals: Map<string, Record<Metric, number>>
  divTotals: Record<string, number>
  metric: Metric
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function ChartsTab({ agents, monthColumns, monthTotals, divTotals, metric }: ChartsTabProps) {
  const c = useChartColors()
  const isCurrency = metric === 'commission' || metric === 'sales'

  // KPI computations
  const totalVal = divTotals[metric] || 0
  const avgPerAgent = agents.length > 0 ? totalVal / agents.length : 0
  const bestMonth = monthColumns.reduce((best, m) => {
    const val = monthTotals.get(m)?.[metric] ?? 0
    return val > (best.val ?? 0) ? { month: m, val } : best
  }, { month: '', val: 0 })

  // Monthly trend data
  const trendData = monthColumns.map(m => ({
    label: m,
    value: monthTotals.get(m)?.[metric] ?? 0,
  }))

  // Top 10 agents bar data
  const top10 = [...agents]
    .sort((a, b) => ((b.totals[metric] || 0) as number) - ((a.totals[metric] || 0) as number))
    .slice(0, 10)
    .map(a => ({ name: a.name.split(' ').slice(0, 2).join(' '), value: (a.totals[metric] || 0) as number }))

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title={`Total ${METRICS.find(m => m.key === metric)?.label ?? ''}`}
          value={isCurrency ? formatCurrency(totalVal, true) : formatNumber(totalVal)}
          icon={<DollarSign className="h-4 w-4" />} className="stagger-1"
        />
        <KPICard
          title="Active Advisors"
          value={formatNumber(agents.length)}
          icon={<Users className="h-4 w-4" />} className="stagger-2"
        />
        <KPICard
          title="Avg per Advisor"
          value={isCurrency ? formatCurrency(avgPerAgent, true) : formatNumber(Math.round(avgPerAgent))}
          icon={<Target className="h-4 w-4" />} className="stagger-3"
        />
        <KPICard
          title="Best Month"
          value={bestMonth.month ? fmtMonth(bestMonth.month) : '—'}
          subtitle={isCurrency ? formatCurrency(bestMonth.val, true) : formatNumber(bestMonth.val)}
          icon={<TrendingUp className="h-4 w-4" />} className="stagger-4"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Monthly Trend — {METRICS.find(m => m.key === metric)?.label}</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="mrTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.primary} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: string) => { const p = v.split('-'); return `${p[1]}/${p[0]?.slice(2)}` }}
                  interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} width={55}
                  tickFormatter={(v: number) => isCurrency ? (v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`) : formatNumber(v)} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [isCurrency ? formatCurrency(Number(v), true) : formatNumber(Number(v)), METRICS.find(m => m.key === metric)?.label ?? '']} />
                <Area type="monotone" dataKey="value" stroke={c.primary} strokeWidth={2} fill="url(#mrTrend)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 10 Agents */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Top 10 Advisors — {METRICS.find(m => m.key === metric)?.label}</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10} layout="vertical">
                <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: number) => isCurrency ? (v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`) : formatNumber(v)} />
                <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [isCurrency ? formatCurrency(Number(v), true) : formatNumber(Number(v))]} />
                <Bar dataKey="value" fill={c.primary} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
