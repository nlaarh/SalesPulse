import { useMemo } from 'react'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { fmtMonth } from '@/lib/formatters'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import { useTheme } from '@/contexts/ThemeContext'
import KPICard from '@/components/KPICard'
import { Users, DollarSign, TrendingUp, Target } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area,
  PieChart, Pie, Cell,
} from 'recharts'
import type { AgentReport, Metric } from './types'
import { getMetrics } from './types'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface ChartsTabProps {
  agents: AgentReport[]
  monthColumns: string[]
  monthTotals: Map<string, Record<Metric, number>>
  divTotals: Record<string, number>
  metric: Metric
  viewType: 'advisor' | 'branch'
  targetMap?: Map<string, number>
  line: string
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function ChartsTab({
  agents, monthColumns, monthTotals, divTotals, metric, viewType, targetMap, line,
}: ChartsTabProps) {
  const { isDark } = useTheme()
  const c = useChartColors()
  const isInsurance = line.toLowerCase() === 'insurance'
  const displayMetrics = getMetrics(isInsurance)
  const isCurrency = metric === 'commission' || metric === 'sales'
  const hasTargets = targetMap && targetMap.size > 0
  const isRevenueMetric = metric === 'commission' || metric === 'sales'

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

  // Actual vs Target data computation
  const actualVsTargetData = useMemo(() => {
    if (!hasTargets) return []
    const commRate = line === 'Insurance' ? 1.0 : 0.187

    const mapped = agents.map(agent => {
      const actual = (agent.totals[metric] || 0) as number
      const baseTarget = targetMap!.get(agent.name.toLowerCase()) || 0
      let target = baseTarget * monthColumns.length
      if (metric === 'sales') {
        target = target / commRate
      }
      return {
        name: agent.name,
        shortName: agent.name.split(' ').slice(0, 2).join(' '),
        actual,
        target,
        achievement: target > 0 ? (actual / target) * 100 : 0
      }
    })

    // Sort by actual descending
    const sortedMapped = mapped.sort((a, b) => b.actual - a.actual)

    // Limit advisors to top 12 for chart clarity, show all branches
    return viewType === 'advisor' ? sortedMapped.slice(0, 12) : sortedMapped
  }, [agents, targetMap, metric, line, monthColumns.length, viewType, hasTargets])

  // Contribution Share data computation
  const contributionData = useMemo(() => {
    const total = agents.reduce((sum, a) => sum + ((a.totals[metric] || 0) as number), 0)
    if (total === 0) return []

    const sorted = [...agents]
      .map(a => ({
        name: a.name,
        shortName: a.name.split(' ').slice(0, 2).join(' '),
        value: (a.totals[metric] || 0) as number
      }))
      .sort((a, b) => b.value - a.value)

    const topCount = 8
    const topN = sorted.slice(0, topCount)
    const remainder = sorted.slice(topCount)

    const data = topN.map(item => ({
      name: item.name,
      shortName: item.shortName,
      value: item.value,
      percentage: (item.value / total) * 100
    }))

    if (remainder.length > 0) {
      const remainderSum = remainder.reduce((sum, item) => sum + item.value, 0)
      data.push({
        name: 'Others',
        shortName: 'Others',
        value: remainderSum,
        percentage: (remainderSum / total) * 100
      })
    }

    return data
  }, [agents, metric])

  const COLORS = [
    c.primary,
    c.secondary,
    c.tertiary,
    c.purple,
    c.cyan,
    c.pink,
    isDark ? '#3B82F6' : '#2563EB',
    isDark ? '#10B981' : '#059669',
    isDark ? '#64748B' : '#94A3B8',
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title={`Total ${displayMetrics.find(m => m.key === metric)?.label ?? ''}`}
          value={isCurrency ? formatCurrency(totalVal, true) : formatNumber(totalVal)}
          icon={<DollarSign className="h-4 w-4" />} className="stagger-1"
        />
        <KPICard
          title={viewType === 'advisor' ? "Active Advisors" : "Active Branches"}
          value={formatNumber(agents.length)}
          icon={<Users className="h-4 w-4" />} className="stagger-2"
        />
        <KPICard
          title={viewType === 'advisor' ? "Avg per Advisor" : "Avg per Branch"}
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
            <h2 className="text-sm font-semibold tracking-tight">Monthly Trend — {displayMetrics.find(m => m.key === metric)?.label}</h2>
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
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [isCurrency ? formatCurrency(Number(v), true) : formatNumber(Number(v)), displayMetrics.find(m => m.key === metric)?.label ?? '']} />
                <Area type="monotone" dataKey="value" stroke={c.primary} strokeWidth={2} fill="url(#mrTrend)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 10 Agents */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Top 10 {viewType === 'advisor' ? 'Advisors' : 'Branches'} — {displayMetrics.find(m => m.key === metric)?.label}</h2>
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

      {/* New Row: Actual vs Target & Contribution Share */}
      <div className={cn("grid gap-6", isRevenueMetric && hasTargets ? "lg:grid-cols-2" : "grid-cols-1")}>
        {/* Actual vs Target Grouped Bar Chart */}
        {isRevenueMetric && hasTargets && (
          <div className="card-premium animate-enter">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-sm font-semibold tracking-tight">Actual vs Target — {displayMetrics.find(m => m.key === metric)?.label}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Comparing period actuals against targets ({viewType === 'advisor' ? 'top 12 advisors' : 'all branches'}).
              </p>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={actualVsTargetData}>
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} width={55}
                    tickFormatter={(v: number) => isCurrency ? (v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`) : formatNumber(v)} />
                  <Tooltip
                    contentStyle={tooltipStyle(c)}
                    formatter={(value, name, props) => {
                      const formattedVal = isCurrency ? formatCurrency(Number(value), true) : formatNumber(Number(value))
                      if (name === 'Actual' && props.payload?.achievement !== undefined) {
                        return [formattedVal, `${name} (${props.payload.achievement.toFixed(0)}% of Target)`]
                      }
                      return [formattedVal, name]
                    }}
                  />
                  <Bar dataKey="actual" name="Actual" fill={c.primary} radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="target" name="Target" fill={c.purple} radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Contribution Share Donut Chart */}
        <div className={cn("card-premium animate-enter", (!isRevenueMetric || !hasTargets) && "lg:col-span-2")}>
          <div className="border-b border-border px-6 py-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Contribution Share — {displayMetrics.find(m => m.key === metric)?.label}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Distribution of total {displayMetrics.find(m => m.key === metric)?.label.toLowerCase()} by {viewType === 'advisor' ? 'advisor' : 'branch'}.
              </p>
            </div>
            {(!isRevenueMetric || !hasTargets) && (
              <span className="rounded bg-secondary/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Targets only for revenue metrics
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center p-5">
            {/* Donut Chart */}
            <div className="relative md:col-span-3 flex justify-center items-center h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={contributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {contributionData.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle(c)}
                    formatter={(value, name, props) => [
                      isCurrency ? formatCurrency(Number(value), true) : formatNumber(Number(value)),
                      `${name} (${props.payload?.percentage?.toFixed(1)}%)`
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
                <span className="text-base font-bold text-foreground mt-0.5">
                  {isCurrency ? formatCurrency(totalVal, true) : formatNumber(totalVal)}
                </span>
              </div>
            </div>

            {/* Custom Legend Table */}
            <div className="md:col-span-2 overflow-y-auto max-h-[280px] pr-2 space-y-1.5 scrollbar-thin">
              {contributionData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-[11px] py-1 border-b border-border/20 last:border-0">
                  <div className="flex items-center gap-2 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="font-medium text-foreground truncate" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="tabular-nums font-semibold text-foreground">
                      {isCurrency ? formatCurrency(item.value, true) : formatNumber(item.value)}
                    </span>
                    <span className="text-muted-foreground ml-1.5">
                      ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
