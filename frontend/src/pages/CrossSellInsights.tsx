/**
 * CrossSellInsights — "Who to Call Today"
 *
 * Shows travel customers who booked trips but have no insurance purchase
 * within ±30 days. Surfaces cross-sell opportunities for advisors.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchCrossSellInsights,
  type CrossSellInsights as CrossSellData,
  type CrossSellOpportunity,
} from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import {
  Loader2, Lightbulb, ShieldAlert, TrendingUp,
  DollarSign, Users, ChevronDown, ChevronRight,
  Phone, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

function priorityColor(p: string) {
  if (p === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (p === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
}

function daysAgoLabel(d: number) {
  if (d <= 0) return 'Today'
  if (d === 1) return '1 day ago'
  if (d <= 7) return `${d} days ago`
  if (d <= 30) return `${Math.ceil(d / 7)} weeks ago`
  return `${Math.ceil(d / 30)} months ago`
}

/* ── Summary Card ────────────────────────────────────────────────────────── */

function SummaryCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof ShieldAlert
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-5 flex items-start gap-4">
      <div className={cn('rounded-lg p-2.5', accent || 'bg-primary/10 text-primary')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Advisor Row (collapsible) ───────────────────────────────────────────── */

function AdvisorRow({ advisor, opportunities, navigate }: {
  advisor: { advisor: string; uninsured_count: number; total_value: number; top_amount: number; top_trip: string }
  opportunities: CrossSellOpportunity[]
  navigate: ReturnType<typeof useNavigate>
}) {
  const [expanded, setExpanded] = useState(false)
  const advisorOpps = useMemo(
    () => opportunities.filter(o => o.advisor === advisor.advisor).slice(0, 10),
    [opportunities, advisor.advisor],
  )

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-medium text-foreground flex-1">{advisor.advisor}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{advisor.uninsured_count} trips</span>
        <span className="text-sm tabular-nums font-medium text-foreground w-24 text-right">{fmt(advisor.total_value)}</span>
      </button>
      {expanded && advisorOpps.length > 0 && (
        <div className="px-4 pb-3">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-left px-3 py-2 font-medium">Customer</th>
                  <th className="text-left px-3 py-2 font-medium">Trip</th>
                  <th className="text-right px-3 py-2 font-medium">Value</th>
                  <th className="text-center px-3 py-2 font-medium">Priority</th>
                  <th className="text-right px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {advisorOpps.map((o, i) => (
                  <tr
                    key={o.opportunity_id || i}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => o.account_id && navigate(`/customer/${o.account_id}`)}
                  >
                    <td className="px-3 py-2 font-medium text-foreground">{o.account_name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{o.trip_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(o.amount)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', priorityColor(o.priority))}>
                        {o.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-xs">{daysAgoLabel(o.days_ago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => navigate(`/agent/${encodeURIComponent(advisor.advisor)}`)}
            className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
          >
            View full advisor profile <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function CrossSellInsights() {
  const { period, startDate, endDate } = useSales()
  const navigate = useNavigate()
  const colors = useChartColors()

  const [data, setData] = useState<CrossSellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchCrossSellInsights(period, startDate, endDate)
      .then(setData)
      .catch(e => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [period, startDate, endDate])

  // Trend chart data with month labels
  const trendData = useMemo(() => {
    if (!data?.trend) return []
    return data.trend.map(t => ({
      ...t,
      label: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    }))
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Analyzing cross-sell opportunities…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        {error || 'No data available'}
      </div>
    )
  }

  const { summary } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
          <Lightbulb className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cross-Sell Insights</h1>
          <p className="text-sm text-muted-foreground">
            Travel customers without insurance — who to call and why
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={ShieldAlert}
          label="Uninsured Trips"
          value={summary.total_uninsured.toLocaleString()}
          sub={`of ${summary.total_travel_trips.toLocaleString()} total trips`}
          accent="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <SummaryCard
          icon={DollarSign}
          label="Value at Risk"
          value={fmt(summary.value_at_risk)}
          sub="Trip revenue without insurance"
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Coverage Rate"
          value={fmtPct(summary.coverage_rate)}
          sub={`${summary.total_insured.toLocaleString()} trips insured`}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <SummaryCard
          icon={Users}
          label="Avg Trip Value"
          value={fmt(summary.avg_trip_value)}
          sub={`${data.by_advisor.length} advisors with gaps`}
        />
      </div>

      {/* Coverage Trend Chart */}
      {trendData.length > 1 && (
        <div className="rounded-xl bg-card border border-border p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Insurance Coverage Trend</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="label" tick={{ fill: colors.tick, fontSize: 12 }} />
              <YAxis tick={{ fill: colors.tick, fontSize: 12 }} />
              <Tooltip
                contentStyle={tooltipStyle(colors)}
                formatter={(value, name) => {
                  if (name === 'insured') return [String(value), 'Insured']
                  return [String(value), 'Uninsured']
                }}
              />
              <Area
                type="monotone"
                dataKey="insured"
                stackId="1"
                stroke={colors.secondary}
                fill={colors.secondary}
                fillOpacity={0.6}
                name="insured"
              />
              <Area
                type="monotone"
                dataKey="uninsured"
                stackId="1"
                stroke={colors.pink}
                fill={colors.pink}
                fillOpacity={0.3}
                name="uninsured"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Opportunities Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Top Opportunities</h2>
          <span className="ml-auto text-sm text-muted-foreground">
            Sorted by score (value × recency)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Trip</th>
                <th className="text-left px-4 py-3 font-medium">Advisor</th>
                <th className="text-right px-4 py-3 font-medium">Value</th>
                <th className="text-center px-4 py-3 font-medium">Priority</th>
                <th className="text-right px-4 py-3 font-medium">Booked</th>
              </tr>
            </thead>
            <tbody>
              {data.top_opportunities.map((o, i) => (
                <tr
                  key={o.opportunity_id || i}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => o.account_id && navigate(`/customer/${o.account_id}`)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{o.account_name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[240px]">{o.trip_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.advisor}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtFull(o.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', priorityColor(o.priority))}>
                      {o.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">{daysAgoLabel(o.days_ago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Advisor Breakdown */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">By Advisor</h2>
          <span className="ml-auto text-sm text-muted-foreground">
            Click to expand call list
          </span>
        </div>
        <div>
          {data.by_advisor.map(a => (
            <AdvisorRow
              key={a.advisor}
              advisor={a}
              opportunities={data.top_opportunities}
              navigate={navigate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
