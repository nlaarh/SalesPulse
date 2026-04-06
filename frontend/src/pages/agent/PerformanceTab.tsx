import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import { formatCurrency, cn } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import type { AgentMonthData } from '@/lib/types'
import { BarChart3, Download } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { AgentProfile } from '../AgentDashboard'
import { exportToExcel } from '@/lib/exportExcel'

/* ── Props ──────────────────────────────────────────────────────────────── */

interface PerformanceTabProps {
  profile: AgentProfile
  c: ReturnType<typeof useChartColors>
  monthlyTarget?: number | null
  targetData?: { totalActual: number; totalTarget: number; achievementPct: number | null } | null
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function PerformanceTab({ profile, c, monthlyTarget, targetData }: PerformanceTabProps) {
  const s = profile.summary
  const currentMonth = new Date().getMonth() + 1

  // Revenue trend chart data
  const chartData = profile.months
    .filter((m) => m.month <= currentMonth || m.prior_revenue > 0)
    .map((m) => ({
      label: m.label,
      revenue: m.month <= currentMonth ? m.revenue : null,
      prior: m.prior_revenue || null,
    }))

  // Deals by month bar chart data
  const dealsBarData = profile.months
    .filter((m) => m.month <= currentMonth)
    .map((m) => ({
      label: m.label,
      deals: m.deals,
    }))

  // Pipeline by stage donut data
  const stageMap = new Map<string, { count: number; value: number }>()
  profile.top_opportunities.forEach((opp) => {
    const existing = stageMap.get(opp.stage) || { count: 0, value: 0 }
    stageMap.set(opp.stage, {
      count: existing.count + 1,
      value: existing.value + opp.amount,
    })
  })
  const pipelineByStage = Array.from(stageMap.entries()).map(([stage, data]) => ({
    name: stage,
    value: data.value,
    count: data.count,
  }))
  const stageColors = [c.primary, c.secondary, c.tertiary, c.purple, c.cyan, c.pink]

  return (
    <div className="space-y-6">
      {/* Row 1: Revenue Trend + Team Comparison */}
      <div className="grid grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="col-span-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">{profile.has_separate_bookings ? 'Bookings' : 'Revenue'} by Month<Tip text={TIPS.revenueByMonth} /></h3>
            <span className="text-[11px] text-muted-foreground">
              Solid: {profile.current_year} &middot; Dashed: {profile.prior_year}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }} width={52}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`
                }
              />
              <Tooltip
                contentStyle={tooltipStyle(c)}
                formatter={(v, name) => {
                  if (v == null) return [null, null]
                  const label = String(name).includes('prior')
                    ? `${profile.prior_year} (Prior)` : `${profile.current_year}`
                  return [formatCurrency(Number(v), true), label]
                }}
                cursor={{ stroke: c.cursor, strokeWidth: 1 }}
              />
              <Area type="monotone" dataKey="prior" name="prior"
                stroke={c.tick} strokeWidth={1.5} strokeDasharray="6 3"
                fill="none" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="revenue" name="current"
                stroke={c.primary} strokeWidth={2} fill="url(#agentGrad)"
                dot={false}
                activeDot={{ r: 4, fill: c.primary, stroke: c.activeDotStroke, strokeWidth: 2 }}
              />
              {monthlyTarget != null && (
                <ReferenceLine
                  y={monthlyTarget}
                  stroke="#D97706"
                  strokeDasharray="8 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target: ${formatCurrency(monthlyTarget, true)}`,
                    position: 'right',
                    fontSize: 10,
                    fill: c.tick,
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Team Comparison */}
        <div className="flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">vs Team Average<Tip text={TIPS.vsTeam} /></h3>
            <span className="text-[11px] text-muted-foreground">
              {profile.team.total_agents} advisors
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-5 rounded-lg border border-border/50 bg-secondary/10 px-5 py-4">
            <CompareBar
              label="Win Rate"
              agent={s.win_rate}
              team={profile.team.win_rate}
              format={(v) => `${v.toFixed(1)}%`}
              max={100}
            />
            <CompareBar
              label="Avg Deal"
              agent={s.avg_deal}
              team={profile.team.avg_deal}
              format={(v) => formatCurrency(v, true)}
              max={Math.max(s.avg_deal, profile.team.avg_deal) * 1.3}
            />
            <CompareBar
              label="Commission"
              agent={s.commission}
              team={profile.team.avg_commission}
              format={(v) => formatCurrency(v, true)}
              max={Math.max(s.commission, profile.team.avg_commission) * 1.3}
            />
            {profile.has_separate_bookings && (
              <CompareBar
                label="Bookings"
                agent={s.revenue}
                team={profile.team.avg_revenue}
                format={(v) => formatCurrency(v, true)}
                max={Math.max(s.revenue, profile.team.avg_revenue) * 1.3}
              />
            )}
            <div className="rounded-lg bg-secondary/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Pipeline Coverage<Tip text={TIPS.pipelineCoverage} /></span>
                <span className={cn(
                  'text-[13px] font-bold',
                  s.coverage >= 2 ? 'text-emerald-500' : s.coverage >= 1 ? 'text-amber-500' : 'text-rose-500',
                )}>
                  {s.coverage}x
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn('h-full rounded-full transition-all',
                    s.coverage >= 2 ? 'bg-emerald-500' : s.coverage >= 1 ? 'bg-amber-500' : 'bg-rose-500')}
                  style={{ width: `${Math.min(s.coverage / 3 * 100, 100)}%` }}
                />
              </div>
              <span className="mt-1 block text-[12px] font-medium text-muted-foreground">Target: 2.0x</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Deals by Month + Pipeline by Stage */}
      <div className="grid grid-cols-2 gap-4">
        {/* Deals by Month */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Deals by Month<Tip text={TIPS.dealsByMonth} /></h3>
            <span className="text-[11px] text-muted-foreground">Closed won deals per month</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dealsBarData}>
              <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }} allowDecimals={false} width={30}
                label={{ value: 'Deals', angle: -90, position: 'insideLeft', offset: 10, style: { fill: c.tick, fontSize: 10 } }}
              />
              <Tooltip
                contentStyle={tooltipStyle(c)}
                formatter={(v) => [v, 'Deals Won']}
                cursor={{ fill: c.cursor }}
              />
              <Bar dataKey="deals" name="Deals Won" fill={c.secondary} radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline by Stage */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold">Pipeline by Stage<Tip text={TIPS.pipelineByStage} /></h3>
            <span className="text-[11px] text-muted-foreground">
              Open deals by sales stage
            </span>
          </div>
          {pipelineByStage.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pipelineByStage}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {pipelineByStage.map((entry, i) => (
                    <Cell key={entry.name} fill={stageColors[i % stageColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle(c)}
                  formatter={(value, name) => {
                    const item = pipelineByStage.find(d => d.name === String(name))
                    return [`${formatCurrency(Number(value), true)} (${item?.count ?? 0} deals)`, String(name)]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(value: string) => {
                    const item = pipelineByStage.find(d => d.name === value)
                    return `${value} (${item?.count ?? 0})`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-muted-foreground">
              {profile.top_opportunities.length === 0
                ? 'No open pipeline deals'
                : `${profile.top_opportunities.length} deal${profile.top_opportunities.length > 1 ? 's' : ''} in ${pipelineByStage[0]?.name ?? 'pipeline'}`}
            </div>
          )}
        </div>
      </div>

      {/* Target Achievement Ring */}
      {monthlyTarget != null && targetData && (() => {
        const pct = targetData.achievementPct ?? 0
        return (
          <div className="flex items-center gap-6 rounded-xl border border-border bg-secondary/10 px-6 py-5">
            <ProgressRing pct={pct} />
            <div className="flex-1 space-y-1.5">
              <h3 className="text-[14px] font-semibold">Commission Target</h3>
              <p className="text-[12px] text-muted-foreground">
                Monthly target: <span className="font-semibold text-foreground">{formatCurrency(monthlyTarget, true)}</span>
                {' · '}Period target: <span className="font-semibold text-foreground">{formatCurrency(targetData.totalTarget, true)}</span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                Commission earned: <span className="font-semibold text-foreground">{formatCurrency(targetData.totalActual, true)}</span>
              </p>
            </div>
          </div>
        )
      })()}

      {/* Row 3: Monthly Breakdown Table */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
          <h3 className="text-sm font-semibold">Monthly Breakdown</h3>
          <button
            onClick={() => {
              const months = profile.months.filter(m => m.month <= currentMonth || m.prior_commission > 0)
              const rows = months.map((m: AgentMonthData) => ({
                Month: m.label ?? '',
                [`${profile.current_year} Commission`]: m.commission ?? 0,
                [`${profile.prior_year} Commission`]: m.prior_commission ?? 0,
                ...(profile.has_separate_bookings ? {
                  [`${profile.current_year} Bookings`]: m.revenue ?? 0,
                  [`${profile.prior_year} Bookings`]: m.prior_revenue ?? 0,
                } : {}),
                Deals: m.deals ?? 0,
              }))
              exportToExcel(rows, `Agent_Monthly_Breakdown_${new Date().toISOString().slice(0,10)}`)
            }}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
            <Download className="h-3.5 w-3.5" />Export
          </button>
        </div>
        <div className="-mx-6 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-border bg-secondary/20">
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Metric</th>
                {profile.months.filter(m => m.month <= currentMonth || m.prior_revenue > 0).map((m) => (
                  <th key={m.month} className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {m.label}
                  </th>
                ))}
                <th className="border-l border-border px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <MonthRow
                label={`${profile.current_year} Commission`}
                months={profile.months}
                getter={(m) => m.commission}
                format={(v) => v === 0 ? '\u2014' : formatCurrency(v, true)}
                total={s.commission}
                totalFmt={formatCurrency(s.commission, true)}
                bold
                currentMonth={currentMonth}
              />
              <MonthRow
                label={`${profile.prior_year} Commission`}
                months={profile.months}
                getter={(m) => m.prior_commission}
                format={(v) => v === 0 ? '\u2014' : formatCurrency(v, true)}
                total={profile.prior.commission}
                totalFmt={formatCurrency(profile.prior.commission, true)}
                muted
                currentMonth={12}
              />
              {profile.has_separate_bookings && (
                <>
                  <MonthRow
                    label={`${profile.current_year} Bookings`}
                    months={profile.months}
                    getter={(m) => m.revenue}
                    format={(v) => v === 0 ? '\u2014' : formatCurrency(v, true)}
                    total={s.revenue}
                    totalFmt={formatCurrency(s.revenue, true)}
                    bold
                    currentMonth={currentMonth}
                  />
                  <MonthRow
                    label={`${profile.prior_year} Bookings`}
                    months={profile.months}
                    getter={(m) => m.prior_revenue}
                    format={(v) => v === 0 ? '\u2014' : formatCurrency(v, true)}
                    total={profile.prior.revenue}
                    totalFmt={formatCurrency(profile.prior.revenue, true)}
                    muted
                    currentMonth={12}
                  />
                </>
              )}
              <MonthRow
                label="Deals"
                months={profile.months}
                getter={(m) => m.deals}
                format={(v) => v === 0 ? '\u2014' : String(v)}
                total={s.deals}
                totalFmt={String(s.deals)}
                currentMonth={currentMonth}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── CompareBar ─────────────────────────────────────────────────────────── */

function CompareBar({ label, agent, team, format, max }: {
  label: string; agent: number; team: number; format: (v: number) => string; max: number
}) {
  const agentPct = max > 0 ? (agent / max) * 100 : 0
  const teamPct = max > 0 ? (team / max) * 100 : 0
  const isAbove = agent >= team

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold tabular-nums">{format(agent)}</span>
          <span className={cn(
            'text-[12px] font-semibold',
            isAbove ? 'text-emerald-500' : 'text-rose-500',
          )}>
            {isAbove ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </div>
      <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
        {/* Team marker line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-muted-foreground/50"
          style={{ left: `${teamPct}%` }}
        />
        {/* Agent bar */}
        <div
          className={cn('h-full rounded-full transition-all',
            isAbove ? 'bg-primary' : 'bg-rose-400')}
          style={{ width: `${agentPct}%` }}
        />
      </div>
      <span className="mt-1 block text-[12px] font-medium text-muted-foreground">
        Team avg: {format(team)}
      </span>
    </div>
  )
}

/* ── ProgressRing ──────────────────────────────────────────────────────── */

function ProgressRing({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 200) // cap visual at 200%
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(clamped, 100) / 100) * circ
  const color = pct >= 100 ? '#16A34A' : pct >= 80 ? '#D97706' : '#EF4444'

  return (
    <div className="relative flex h-[110px] w-[110px] shrink-0 items-center justify-center">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none"
          stroke="currentColor" strokeWidth="8" className="text-secondary" />
        <circle cx="55" cy="55" r={r} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tabular-nums" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[9px] text-muted-foreground">of target</span>
      </div>
    </div>
  )
}

/* ── MonthRow ───────────────────────────────────────────────────────────── */

function MonthRow({ label, months, getter, format, totalFmt, bold, muted, currentMonth }: {
  label: string
  months: AgentMonthData[]
  getter: (m: AgentMonthData) => number
  format: (v: number) => string
  total?: number
  totalFmt: string
  bold?: boolean
  muted?: boolean
  currentMonth: number
}) {
  const visible = months.filter(m => m.month <= currentMonth || m.prior_revenue > 0)
  return (
    <tr className={cn('border-b border-border/20 transition-colors hover:bg-primary/5',
      muted && 'opacity-60')}>
      <td className={cn('px-4 py-2 text-[12px]', bold ? 'font-semibold' : 'font-medium text-muted-foreground')}>
        {label}
      </td>
      {visible.map((m) => {
        const v = getter(m)
        const isFuture = m.month > currentMonth && !muted
        return (
          <td key={m.month} className="px-2 py-2 text-right">
            <span className={cn(
              'tabular-nums text-[12px]',
              isFuture ? 'text-muted-foreground/30' : v === 0 ? 'text-muted-foreground/50' : '',
              bold && v > 0 && 'font-semibold',
            )}>
              {isFuture ? '\u2014' : format(v)}
            </span>
          </td>
        )
      })}
      <td className="border-l border-border px-3 py-2 text-right">
        <span className={cn('tabular-nums text-[12px]', bold ? 'font-bold' : 'font-semibold')}>
          {totalFmt}
        </span>
      </td>
    </tr>
  )
}
