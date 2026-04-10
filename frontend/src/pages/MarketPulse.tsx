/**
 * MarketPulse — External intelligence feed for proactive sales.
 *
 * Shows travel advisories, Medicare enrollment windows, seasonal patterns,
 * and internal SF metrics to help advisors act proactively.
 * Drill-down shows impacted customers grouped by advisor.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchMarketPulse,
  fetchImpactedCustomers,
  type MarketPulseData,
  type MarketPulseAlert,
  type ImpactedCustomersData,
} from '@/lib/api'
import {
  Loader2, Radio, AlertTriangle, Shield, CloudLightning,
  TrendingUp, Gift, Umbrella, ArrowUpCircle, Cake,
  Plane, Users, Calendar, Globe, ChevronDown, ChevronRight,
  ArrowUpRight, Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Icon mapping ────────────────────────────────────────────────────────── */

const ALERT_ICONS: Record<string, typeof AlertTriangle> = {
  'alert-triangle': AlertTriangle,
  'shield': Shield,
  'cloud-lightning': CloudLightning,
  'trending-up': TrendingUp,
  'gift': Gift,
  'umbrella': Umbrella,
  'arrow-up-circle': ArrowUpCircle,
  'cake': Cake,
}

const SEVERITY_CONFIG: Record<string, {
  card: string; badge: string; icon: string; action: string; dot: string
}> = {
  critical: {
    card: 'border-l-4 border-l-red-500 bg-card',
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20',
    icon: 'text-red-500',
    action: 'bg-red-500/5 text-red-700 dark:text-red-300 border border-red-500/10',
    dot: 'bg-red-500',
  },
  high: {
    card: 'border-l-4 border-l-orange-500 bg-card',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500/20',
    icon: 'text-orange-500',
    action: 'bg-orange-500/5 text-orange-700 dark:text-orange-300 border border-orange-500/10',
    dot: 'bg-orange-500',
  },
  medium: {
    card: 'border-l-4 border-l-amber-500 bg-card',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20',
    icon: 'text-amber-500',
    action: 'bg-amber-500/5 text-amber-700 dark:text-amber-300 border border-amber-500/10',
    dot: 'bg-amber-500',
  },
  low: {
    card: 'border-l-4 border-l-blue-400 bg-card',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20',
    icon: 'text-blue-500',
    action: 'bg-blue-500/5 text-blue-700 dark:text-blue-300 border border-blue-500/10',
    dot: 'bg-blue-500',
  },
  info: {
    card: 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-card',
    badge: 'bg-muted text-muted-foreground ring-1 ring-border',
    icon: 'text-muted-foreground',
    action: 'bg-muted/50 text-muted-foreground border border-border',
    dot: 'bg-slate-400',
  },
}

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtNum(n: number) {
  return n.toLocaleString()
}

/* ── Impacted Customers Panel ────────────────────────────────────────────── */

function ImpactedCustomersPanel({
  destination,
  period,
  startDate,
  endDate,
}: {
  destination: string
  period: number
  startDate?: string | null
  endDate?: string | null
}) {
  const navigate = useNavigate()
  const [data, setData] = useState<ImpactedCustomersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedAdvisor, setExpandedAdvisor] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchImpactedCustomers(destination, period, startDate, endDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [destination, period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading impacted customers…
      </div>
    )
  }

  if (!data || data.advisors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3">No customer records found for this destination.</p>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {data.total} customers across {data.advisors.length} advisors
        </span>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        {data.advisors.map((adv) => (
          <div key={adv.advisor} className="border-b border-border last:border-0">
            <button
              onClick={() => setExpandedAdvisor(expandedAdvisor === adv.advisor ? null : adv.advisor)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
            >
              {expandedAdvisor === adv.advisor
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              }
              <span className="font-medium text-foreground flex-1 text-sm">{adv.advisor}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{adv.trips} trips</span>
              <span className="text-xs tabular-nums font-semibold text-foreground w-20 text-right">{fmt(adv.value)}</span>
            </button>
            {expandedAdvisor === adv.advisor && (
              <div className="px-4 pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs border-b border-border">
                      <th className="text-left px-2 py-1.5 font-medium">Customer</th>
                      <th className="text-left px-2 py-1.5 font-medium">Trip</th>
                      <th className="text-left px-2 py-1.5 font-medium">Destination</th>
                      <th className="text-right px-2 py-1.5 font-medium">Value</th>
                      <th className="text-right px-2 py-1.5 font-medium">Close Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adv.customers.map((c, i) => (
                      <tr
                        key={i}
                        className="border-t border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => c.account_id && navigate(`/customer/${c.account_id}`)}
                      >
                        <td className="px-2 py-1.5 font-medium text-foreground">{c.name || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[180px]">{c.trip}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.destination}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium text-foreground">{fmt(c.amount)}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground text-xs">
                          {c.close_date ? new Date(c.close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  onClick={() => navigate(`/agent/${encodeURIComponent(adv.advisor)}`)}
                  className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View advisor profile <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Alert Card ──────────────────────────────────────────────────────────── */

function AlertCard({ alert, period, startDate, endDate }: {
  alert: MarketPulseAlert
  period: number
  startDate?: string | null
  endDate?: string | null
}) {
  const [expanded, setExpanded] = useState(
    alert.severity === 'critical' || alert.severity === 'high'
  )
  const s = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info
  const Icon = ALERT_ICONS[alert.icon] || AlertTriangle

  return (
    <div className={cn('rounded-xl border border-border shadow-sm transition-all', s.card)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className={cn('mt-0.5 rounded-lg p-1.5', s.icon, 'bg-transparent')}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground">{alert.title}</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', s.badge)}>
              {alert.severity}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {alert.customer_trips != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> {fmtNum(alert.customer_trips)} trips affected
              </span>
            )}
            {alert.destination && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Plane className="h-3 w-3" /> {alert.destination}
              </span>
            )}
            {alert.days_remaining != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" /> {alert.days_remaining}d remaining
              </span>
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">{alert.summary}</p>
          )}
        </div>
        <div className="shrink-0 mt-1">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground ml-9">{alert.summary}</p>
          <div className={cn('rounded-lg px-3 py-2 text-xs font-medium ml-9', s.action)}>
            <Phone className="inline h-3 w-3 mr-1.5 -mt-0.5" />
            {alert.action}
          </div>
          {/* Show impacted customers for travel advisories */}
          {alert.type === 'travel_advisory' && alert.destination && (
            <div className="ml-9 mt-2">
              <ImpactedCustomersPanel
                destination={alert.destination}
                period={period}
                startDate={startDate}
                endDate={endDate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Summary Card ────────────────────────────────────────────────────────── */

function SummaryCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof Plane
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
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function MarketPulse() {
  const { viewMode, startDate, endDate } = useSales()
  const period = viewMode === 'month' ? 1 : viewMode === 'quarter' ? 3 : viewMode === '6m' ? 6 : viewMode === 'ytd' ? Math.ceil((new Date().getMonth() + 1)) : 12
  const [data, setData] = useState<MarketPulseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'travel_advisory' | 'medicare' | 'seasonal'>('all')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchMarketPulse(period, startDate, endDate)
      .then(setData)
      .catch((e) => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Market Pulse…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-32 text-destructive">
        {error || 'No data available'}
      </div>
    )
  }

  const filteredAlerts = data.alerts.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'travel_advisory') return a.type === 'travel_advisory'
    if (filter === 'medicare') return a.type === 'medicare_enrollment' || a.type === 'medicare_turning_65'
    if (filter === 'seasonal') return a.type === 'seasonal' || a.type === 'membership'
    return true
  })

  const advisoryCount = data.alerts.filter(a => a.type === 'travel_advisory').length
  const medicareCount = data.alerts.filter(a => a.type === 'medicare_enrollment' || a.type === 'medicare_turning_65').length
  const seasonalCount = data.alerts.filter(a => a.type === 'seasonal' || a.type === 'membership').length

  const tabs = [
    { key: 'all' as const, label: 'All Alerts', count: data.alerts.length },
    { key: 'travel_advisory' as const, label: 'Travel Advisories', count: advisoryCount, icon: '🌍' },
    { key: 'medicare' as const, label: 'Medicare', count: medicareCount, icon: '🏥' },
    { key: 'seasonal' as const, label: 'Seasonal', count: seasonalCount, icon: '📅' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Radio className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Market Pulse</h1>
          <p className="text-xs text-muted-foreground">
            External intelligence & proactive alerts • Updated {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Metric cards — match CrossSell SummaryCard style */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard icon={Globe} label="International Trips" value={fmtNum(data.metrics.international_trips)} sub={fmt(data.metrics.international_value) + ' total value'} accent="bg-blue-500/10 text-blue-500" />
        <SummaryCard icon={Shield} label="Medicare Enrolled" value={fmtNum(data.metrics.medicare_enrolled_period)} sub="this period" accent="bg-emerald-500/10 text-emerald-500" />
        <SummaryCard icon={Cake} label="Turning 65" value={fmtNum(data.metrics.members_turning_65)} sub="next 12 months" accent="bg-violet-500/10 text-violet-500" />
        <SummaryCard icon={Calendar} label="Memberships Expiring" value={fmtNum(data.metrics.expiring_memberships_90d)} sub="next 90 days" accent="bg-amber-500/10 text-amber-500" />
        <SummaryCard icon={Users} label="Basic Tier Members" value={fmtNum(data.metrics.basic_tier_members)} sub="upgrade candidates" accent="bg-pink-500/10 text-pink-500" />
        <SummaryCard icon={AlertTriangle} label="Active Advisories" value={String(data.advisory_count)} sub="affecting your destinations" accent="bg-red-500/10 text-red-500" />
      </div>

      {/* Top Destinations */}
      {data.metrics.top_destinations.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Plane className="h-4 w-4 text-muted-foreground" /> Top Destinations (Current Period)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {data.metrics.top_destinations.map((d) => (
              <div key={d.destination} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 border border-border/50">
                <span className="text-xs text-foreground font-medium truncate">{d.destination}</span>
                <span className="text-xs text-muted-foreground font-mono ml-2 tabular-nums">{fmtNum(d.trips)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'rounded-lg px-3 py-2 text-xs font-medium transition-all whitespace-nowrap',
              filter === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-muted-foreground border border-border hover:bg-muted/80 hover:text-foreground'
            )}
          >
            {tab.icon && <span className="mr-1">{tab.icon}</span>}
            {tab.label} <span className="ml-1 opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Alert feed */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No alerts in this category
          </div>
        ) : (
          filteredAlerts.map((alert, i) => (
            <AlertCard
              key={`${alert.type}-${alert.title}-${i}`}
              alert={alert}
              period={period}
              startDate={startDate}
              endDate={endDate}
            />
          ))
        )}
      </div>

      {/* Data sources attribution */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong>Data Sources:</strong> Travel advisories from U.S. Department of State (travel.state.gov) •
          Medicare enrollment calendar from CMS.gov • Seasonal patterns based on industry data •
          Customer metrics from Salesforce • No external customer data matching — all signals
          cross-referenced against internal records only.
        </p>
      </div>
    </div>
  )
}
