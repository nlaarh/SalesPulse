import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  fetchMembershipSnapshot,
  type MembershipSnapshot,
} from '@/lib/api'
import {
  Users, UserPlus, RefreshCw, UserMinus, TrendingUp, TrendingDown,
  Loader2, GitBranch, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useChartColors } from '@/lib/chart-theme'

/* ── Helpers ──────────────────────────────────────────────────────────── */

function pctChange(curr: number, prior: number) {
  if (!prior) return null
  return ((curr - prior) / prior) * 100
}

function YoYBadge({ curr, prior, invert = false }: { curr: number; prior: number; invert?: boolean }) {
  const p = pctChange(curr, prior)
  if (p === null) return null
  const positive = invert ? p < 0 : p > 0
  const neutral = Math.abs(p) < 0.5
  return (
    <span className={cn(
      'flex items-center gap-0.5 text-[11px] font-semibold mt-0.5',
      neutral ? 'text-muted-foreground' : positive ? 'text-emerald-500' : 'text-rose-500',
    )}>
      {neutral ? null : positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {p > 0 ? '+' : ''}{p.toFixed(1)}% vs prior year
    </span>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/* ── Main ─────────────────────────────────────────────────────────────── */

export default function MembershipDashboard() {
  const [data, setData] = useState<MembershipSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const c = useChartColors()

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetchMembershipSnapshot()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [retry])

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>

  if (error || !data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm font-semibold">Membership data unavailable</p>
        <button onClick={() => setRetry(r => r + 1)}
          className="rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90">
          Retry
        </button>
      </div>
    )
  }

  const totalAttrition = (data.ytd_lapsed ?? 0) + (data.ytd_explicit_cancel ?? 0)

  const renewalRate = data.renewal_rate
  const priorRenewalRate = data.prior_renewal_rate

  const kpis = [
    { label: 'Total Active Members',      value: fmt(data.active_members), icon: Users,     color: 'text-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  yoy: null,                                                                     sub: 'Current book' },
    { label: `${data.year} New Members`,  value: fmt(data.ytd_new),        icon: UserPlus,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', yoy: <YoYBadge curr={data.ytd_new}   prior={data.prior_ytd_new} />,    sub: 'YTD acquisitions' },
    { label: `${data.year} Renewals`,     value: fmt(data.ytd_renew),      icon: RefreshCw, color: 'text-sky-500',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     yoy: <YoYBadge curr={data.ytd_renew} prior={data.prior_ytd_renew} />, sub: 'YTD renewals' },
    { label: `${data.year} Attrition`,    value: fmt(totalAttrition),      icon: UserMinus, color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    yoy: null,                                                                     sub: 'Lapses + cancels' },
    { label: 'Renewal Rate',              value: renewalRate != null ? `${(renewalRate * 100).toFixed(1)}%` : '—', icon: RefreshCw, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20',
      yoy: renewalRate != null && priorRenewalRate != null
        ? <YoYBadge curr={renewalRate * 100} prior={priorRenewalRate * 100} />
        : null,
      sub: 'PAY ÷ (PAY+ADD+CAN)' },
  ]

  return (
    <div className="space-y-4 animate-enter">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            Membership Division &middot; {data.year} Year to Date
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Membership Performance</h1>
        </div>
        {totalAttrition > 0 && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">YTD Total Attrition</span>
            <span className="text-2xl font-bold text-rose-500">{fmt(totalAttrition)}</span>
            <span className="text-[9px] text-muted-foreground/60">lapses + explicit cancels</span>
          </div>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div key={k.label} className={cn('card-premium flex flex-col gap-3 px-5 py-4 border', k.border)}>
              <div className="flex items-center gap-2">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', k.bg)}>
                  <Icon className={cn('h-4 w-4', k.color)} />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground leading-tight">{k.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">{k.sub}</p>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{k.value}</p>
                {k.yoy}
              </div>
            </div>
          )
        })}
      </div>

      {/* Monthly bar chart */}
      {data.monthly.length > 0 && (
        <div className="card-premium px-5 py-4">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Monthly Activity — {data.year}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.monthly} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
              <Tooltip
                contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, name: any) => [val != null ? Number(val).toLocaleString() : '', String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="new" name="New" fill={c.secondary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="renew" name="Renewed" fill={c.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="cancel" name="Attrition" fill={c.pink} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdown cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card-premium px-5 py-4">
          <p className="text-[11px] font-medium text-muted-foreground">Net New YTD</p>
          <p className={cn('mt-1 text-xl font-bold', data.ytd_new - totalAttrition >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
            {data.ytd_new - totalAttrition >= 0 ? '+' : ''}{fmt(data.ytd_new - totalAttrition)}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">New minus total attrition</p>
        </div>
        <div className="card-premium px-5 py-4">
          <p className="text-[11px] font-medium text-muted-foreground">Non-Renewals (Lapsed)</p>
          <p className="mt-1 text-xl font-bold text-rose-500">
            {fmt(data.ytd_lapsed ?? 0)}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">90-day past due, didn't renew</p>
        </div>
        <div className="card-premium px-5 py-4">
          <p className="text-[11px] font-medium text-muted-foreground">Explicit Cancels</p>
          <p className="mt-1 text-xl font-bold text-rose-400">
            {fmt(data.ytd_explicit_cancel ?? 0)}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Voluntary / involuntary</p>
        </div>
        <div className="card-premium px-5 py-4">
          <p className="text-[11px] font-medium text-muted-foreground">Avg New/Month</p>
          <p className="mt-1 text-xl font-bold">
            {data.monthly.length > 0 ? fmt(Math.round(data.ytd_new / data.monthly.length)) : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Based on {data.monthly.length} months</p>
        </div>
      </div>

      {/* Navigation cards */}
      <div className="grid grid-cols-2 gap-3">
        <NavLink to="/membership/channels"
          className="card-premium flex items-center gap-4 px-5 py-4 border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all group">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10">
            <GitBranch className="h-5 w-5 text-sky-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold group-hover:text-primary transition-colors">Revenue by Channel</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Breakdowns by sales channel with revenue & net activity</p>
          </div>
        </NavLink>
        <NavLink to="/membership/advisors"
          className="card-premium flex items-center gap-4 px-5 py-4 border border-border hover:border-primary/40 hover:bg-secondary/50 transition-all group">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Trophy className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-[13px] font-semibold group-hover:text-primary transition-colors">Advisor Performance</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Agent leaderboard ranked by renewals, new sales & revenue</p>
          </div>
        </NavLink>
      </div>
    </div>
  )
}
