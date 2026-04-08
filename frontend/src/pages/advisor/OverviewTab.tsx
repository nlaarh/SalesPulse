/**
 * AdvisorDashboard — Tab 1: Overview
 *
 * Dense grid with KPI tiles, revenue chart, funnel, top advisors, and AI insights.
 * Pure presentation — receives all data via props.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { fmtAxis, MONTH_SHORT } from '@/lib/formatters'
import { tooltipStyle } from '@/lib/chart-theme'
import { Tip, TIPS } from '@/components/MetricTip'
import { DeltaPill } from '@/components/DeltaPill'
import FunnelChart from '@/components/FunnelChart'
import type { FunnelData } from '@/components/FunnelChart'
import AtRiskDeals from './AtRiskDeals'
import type { Summary, Advisor, YoYData, ChartColors } from './types'
import type { Insight, SlippingDeal } from '@/lib/types'
import {
  DollarSign, Trophy, GitBranch, Target, Users,
  Megaphone, ChevronRight, Sparkles,
  CheckCircle2, AlertTriangle, Lightbulb,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

/* ── Props ────────────────────────────────────────────────────────────────── */

export interface OverviewTabProps {
  summary: Summary
  isInsurance: boolean
  dealsYoyPct: number
  pipelineCoverage: number
  yoy: YoYData | null
  funnel: FunnelData | null
  c: ChartColors
  leaders: Advisor[]
  insights: Insight[]
  slipping: SlippingDeal[]
  onSelectAdvisor: (name: string) => void
  onViewSummary?: () => void
  periodLabel: string
}

/* ── Micro-components (OverviewTab-only) ─────────────────────────────────── */

function KPITile({
  icon: Icon, iconColor, iconBg, title, value, delta, deltaLabel, sub, onClick, tip,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string
  title: string; value: string
  delta?: number; deltaLabel?: string; sub?: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div onClick={onClick} className={cn('card-premium relative overflow-hidden p-5', onClick && 'cursor-pointer transition-colors hover:bg-secondary/5')}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="mb-3 flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
        {tip && <Tip text={tip} />}
      </div>
      <p className="tabular-nums text-[28px] font-bold leading-none tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <DeltaPill value={delta} />}
        {(deltaLabel || sub) && (
          <span className="text-[11px] text-muted-foreground">{deltaLabel || sub}</span>
        )}
      </div>
    </div>
  )
}

function ActivityCell({ icon: Icon, label, value, color, bg, onClick, tip }: {
  icon: React.ElementType; label: string; value: string; color: string; bg: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div
      onClick={onClick}
      className={cn('flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/10 p-3.5 transition-colors', onClick && 'cursor-pointer hover:bg-secondary/30')}
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="tabular-nums text-[20px] font-bold leading-none">{value}</p>
        <p className="mt-0.5 flex items-center text-[12px] font-medium text-muted-foreground">{label}{tip && <Tip text={tip} />}</p>
      </div>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export default function OverviewTab({
  summary, isInsurance, dealsYoyPct, pipelineCoverage,
  yoy, funnel, c, leaders, insights, slipping,
  onSelectAdvisor, onViewSummary, periodLabel,
}: OverviewTabProps) {
  const nav = useNavigate()
  const [chartMode, setChartMode] = useState<'revenue' | 'commission'>('revenue')
  const [showLost, setShowLost] = useState(false)

  // KPI values come from summary (period-filtered by the date picker)
  // yoy is used only for the monthly bar chart context
  const billedValue = summary.bookings
  const billedPct   = summary.bookings_yoy_pct
  const billedPrev  = summary.bookings_prev
  const commValue   = isInsurance ? summary.bookings : summary.commission

  // Line chart from yoy.months
  const currentMonth = new Date().getMonth() + 1
  const lineData = (yoy?.months ?? [])
    .filter(m => m.month <= currentMonth)
    .map(m => ({
      label: MONTH_SHORT[m.month - 1],
      current: chartMode === 'commission' ? m.current_commission : m.current_revenue,
      prior: chartMode === 'commission'
        ? (m.prior_commission > 0 ? m.prior_commission : null)
        : (m.prior_revenue > 0 ? m.prior_revenue : null),
      currentLost: chartMode === 'revenue' ? (m.current_lost_amount ?? 0) : (m.current_lost ?? 0),
      priorLost: chartMode === 'revenue' ? (m.prior_lost_amount ?? 0) : (m.prior_lost ?? 0),
    }))

  // Distinct colors: blue for revenue, purple current lost, amber prior lost
  const CURRENT_COLOR = '#3b82f6' // blue-500 — current year revenue
  const PRIOR_COLOR   = '#94a3b8' // slate-400 — prior year revenue
  const LOST_CUR_COLOR = '#8b5cf6' // violet-500 — current year lost
  const LOST_PRI_COLOR = '#f59e0b' // amber-500 — prior year lost

  const leadsCount = funnel?.steps?.[0]?.count ?? 0
  const oppsCount  = funnel?.steps?.find(s => s.step.toLowerCase().includes('opp'))?.count
                  ?? funnel?.steps?.[1]?.count ?? 0

  const coveragePct = Math.min(pipelineCoverage / 3 * 100, 100)

  return (
    <>
      {/* ROW 1 — 4 KPI CARDS */}
      <div className="animate-enter grid grid-cols-4 gap-3">
        <KPITile
          icon={DollarSign} iconBg="bg-primary/10" iconColor="text-primary"
          title="Billed Revenue" tip={TIPS.billedRevenue}
          value={formatCurrency(billedValue, true)}
          delta={billedPct} deltaLabel="vs last year"
          onClick={() => nav('/monthly')}
        />
        <KPITile
          icon={Trophy} iconBg="bg-amber-500/10" iconColor="text-amber-500"
          title="Won Deals" tip={TIPS.wonDeals}
          value={formatNumber(summary.deals)}
          delta={dealsYoyPct} deltaLabel="from last year"
          onClick={() => nav('/monthly')}
        />
        <KPITile
          icon={GitBranch} iconBg="bg-cyan-500/10" iconColor="text-cyan-500"
          title="Open Pipeline" tip={TIPS.pipeline}
          value={formatCurrency(summary.pipeline_value, true)}
          sub={`${pipelineCoverage.toFixed(1)}x coverage \u00b7 ${formatNumber(summary.pipeline_count)} deals`}
          onClick={() => nav('/pipeline')}
        />
        <KPITile
          icon={Target} iconBg="bg-emerald-500/10" iconColor="text-emerald-500"
          title="Win Rate" tip={TIPS.winRate}
          value={formatPct(summary.win_rate)}
          sub={`Avg ${formatCurrency(summary.avg_deal_size, true)} per deal`}
          onClick={() => nav('/monthly')}
        />
      </div>

      {/* ROW 2 — REVENUE CHART + AT-RISK DEALS */}
      <div className="animate-enter stagger-1 grid gap-3" style={{ gridTemplateColumns: '3fr 2fr' }}>
        {/* Revenue / Commission Trend */}
        <div className="card-premium p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {chartMode === 'commission' ? 'Commission' : 'Revenue'} Trend · {periodLabel}
              <Tip text={TIPS.salesOverview} />
            </h3>
            <div className="flex items-center gap-2">
              {/* Lost opps toggle */}
              <button
                onClick={() => setShowLost(!showLost)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  showLost ? 'border-violet-400/60 bg-violet-500/10 text-violet-500' : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60',
                )}
              >
                Lost Opps
              </button>
              {/* Revenue / Commission toggle */}
              {!isInsurance && (
                <div className="flex rounded-full border border-border bg-secondary/40 p-0.5">
                  <button
                    onClick={() => setChartMode('revenue')}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      chartMode === 'revenue' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >Revenue</button>
                  <button
                    onClick={() => setChartMode('commission')}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      chartMode === 'commission' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >Commission</button>
                </div>
              )}
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] text-muted-foreground">
                {yoy ? `${yoy.current_year} vs ${yoy.prior_year}` : 'Last 12 Months'}
              </span>
            </div>
          </div>

          {/* Headline metrics */}
          <div className="mb-5 flex items-start gap-10">
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">
                {chartMode === 'commission' ? 'Total Commission' : 'Total Revenue'}
              </p>
              <p className="mt-0.5 tabular-nums text-[22px] font-bold leading-none">
                {formatCurrency(chartMode === 'commission' ? commValue : billedValue, true)}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <DeltaPill value={chartMode === 'commission' ? (summary.commission_yoy_pct ?? billedPct) : billedPct} />
                <span className="text-[12px] font-medium text-muted-foreground">
                  vs prior: {formatCurrency(chartMode === 'commission' ? (summary.commission_prev ?? 0) : billedPrev, true)}
                </span>
              </div>
            </div>
            {yoy && (
              <div className="ml-auto flex flex-col items-end gap-1.5 self-end pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CURRENT_COLOR }} />
                  <span className="text-[12px] font-medium text-muted-foreground">{yoy.current_year}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ backgroundColor: PRIOR_COLOR }} />
                  <span className="text-[12px] font-medium text-muted-foreground">{yoy.prior_year}</span>
                </div>
                {showLost && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: LOST_CUR_COLOR }} />
                      <span className="text-[12px] font-medium text-muted-foreground">
                        Lost {yoy.current_year} {chartMode === 'revenue' ? '($)' : '(#)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: LOST_PRI_COLOR }} />
                      <span className="text-[12px] font-medium text-muted-foreground">
                        Lost {yoy.prior_year} {chartMode === 'revenue' ? '($)' : '(#)'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 10 }} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false}
                tick={{ fill: c.tick, fontSize: 10 }} tickFormatter={fmtAxis} width={50} />
              {showLost && (
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false}
                  tick={{ fill: LOST_CUR_COLOR, fontSize: 10 }}
                  tickFormatter={chartMode === 'revenue' ? fmtAxis : undefined}
                  width={chartMode === 'revenue' ? 50 : 35} />
              )}
              <Tooltip
                contentStyle={tooltipStyle(c)}
                formatter={(v: unknown, name: unknown) => {
                  const n = name as string
                  if (n === 'currentLost' || n === 'priorLost') {
                    const label = n === 'currentLost' ? `Lost ${yoy?.current_year ?? 'Current'}` : `Lost ${yoy?.prior_year ?? 'Prior'}`
                    return chartMode === 'revenue'
                      ? [formatCurrency(v as number, true), label]
                      : [`${v} deals`, label]
                  }
                  return [
                    formatCurrency(v as number, true),
                    n === 'current' ? (yoy ? String(yoy.current_year) : 'Current') : (yoy ? String(yoy.prior_year) : 'Prior'),
                  ]
                }}
                cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              {/* Prior year */}
              {lineData.some(d => d.prior !== null) && (
                <Line yAxisId="left" type="monotone" dataKey="prior" stroke={PRIOR_COLOR} strokeOpacity={0.85}
                  strokeWidth={2} dot={{ r: 2.5, fill: PRIOR_COLOR, strokeWidth: 0 }} />
              )}
              {/* Current year */}
              <Line yAxisId="left" type="monotone" dataKey="current" stroke={CURRENT_COLOR} strokeWidth={2.5}
                dot={{ r: 3, fill: CURRENT_COLOR }} activeDot={{ r: 5 }} />
              {/* Lost opps lines */}
              {showLost && (
                <>
                  <Line yAxisId="right" type="monotone" dataKey="currentLost" stroke={LOST_CUR_COLOR} strokeWidth={1.5}
                    dot={{ r: 2, fill: LOST_CUR_COLOR }} />
                  <Line yAxisId="right" type="monotone" dataKey="priorLost" stroke={LOST_PRI_COLOR} strokeWidth={1.5}
                    dot={{ r: 2, fill: LOST_PRI_COLOR }} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* At-Risk Deals */}
        <div className="card-premium p-4">
          <AtRiskDeals deals={slipping} onSelectAdvisor={onSelectAdvisor} />
        </div>
      </div>

      {/* ROW 3 — FUNNEL + ACTIVITY / COVERAGE */}
      <div className="animate-enter stagger-2 grid grid-cols-2 gap-3">
        <div onClick={() => nav('/pipeline')} className="card-premium cursor-pointer transition-colors hover:bg-secondary/5">
          <FunnelChart funnel={funnel} variant="compact" />
        </div>

        <div className="card-premium p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Sales Activity</h3>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActivityCell icon={Megaphone}  label="Leads"   value={formatNumber(leadsCount)} color="text-primary"     bg="bg-primary/10"    onClick={() => nav('/leads')} tip={TIPS.leads} />
            <ActivityCell icon={Target}     label="Opps"    value={formatNumber(oppsCount)}  color="text-amber-500"   bg="bg-amber-500/10"  onClick={() => nav('/pipeline')} tip={TIPS.opps} />
            <ActivityCell icon={Trophy}     label="Won"     value={formatNumber(summary.deals)} color="text-emerald-500" bg="bg-emerald-500/10" onClick={() => nav('/monthly')} tip={TIPS.wonDeals} />
            <ActivityCell icon={DollarSign} label="Avg Deal" value={formatCurrency(summary.avg_deal_size, true)} color="text-cyan-500" bg="bg-cyan-500/10" onClick={() => nav('/monthly')} tip={TIPS.avgDeal} />
          </div>
          {/* Pipeline Coverage */}
          <div onClick={() => nav('/pipeline')} className="mt-3 cursor-pointer rounded-xl border border-border/40 bg-secondary/20 p-3.5 transition-colors hover:bg-secondary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Pipeline Coverage<Tip text={TIPS.pipelineCoverage} /></span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[12px] font-semibold',
                pipelineCoverage >= 2 ? 'bg-emerald-500/10 text-emerald-500'
                  : pipelineCoverage >= 1 ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-rose-500/10 text-rose-500',
              )}>
                {pipelineCoverage >= 2 ? 'Healthy' : pipelineCoverage >= 1 ? 'Moderate' : 'Low'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="tabular-nums text-[22px] font-bold leading-none">{pipelineCoverage.toFixed(1)}x</p>
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pipelineCoverage >= 2 ? 'bg-emerald-500' : pipelineCoverage >= 1 ? 'bg-amber-500' : 'bg-rose-500',
                    )}
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                  {formatNumber(summary.pipeline_count)} open opportunities
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 4 — TOP ADVISORS + AI INSIGHTS */}
      <div className="animate-enter stagger-3 grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card-premium overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Top Advisors</h3>
            </div>
            <span className="text-[12px] font-medium text-muted-foreground">{leaders.length} advisors total</span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="w-10 px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">#</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Advisor</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Revenue</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Deals</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Win %</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Pipeline</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {leaders.slice(0, 5).map((a, idx) => (
                <tr
                  key={a.name}
                  onClick={() => onSelectAdvisor(a.name)}
                  className={cn(
                    'group cursor-pointer border-b border-border/20 transition-colors hover:bg-primary/5',
                    idx % 2 !== 0 && 'bg-secondary/10',
                  )}
                >
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold',
                      a.rank === 1 && 'bg-amber-500/15 text-amber-500',
                      a.rank === 2 && 'bg-slate-400/15 text-slate-400',
                      a.rank === 3 && 'bg-orange-600/15 text-orange-500',
                      a.rank > 3 && 'text-muted-foreground',
                    )}>
                      {a.rank}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] font-medium text-primary">{a.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[12px] font-semibold">
                    {a.commission > 0 ? formatCurrency(a.commission, true) : formatCurrency(a.bookings, true)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">
                    {formatNumber(a.deals)}
                  </td>
                  <td className={cn(
                    'px-3 py-2.5 text-right tabular-nums text-[12px] font-semibold',
                    a.win_rate >= 55 ? 'text-emerald-500' : a.win_rate < 35 ? 'text-rose-500' : 'text-muted-foreground',
                  )}>
                    {formatPct(a.win_rate)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[12px] text-muted-foreground">
                    {formatCurrency(a.pipeline_value, true)}
                  </td>
                  <td className="pr-3 py-2.5">
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                  </td>
                </tr>
              ))}
              {leaders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                    No advisor data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* AI Insights (compact) */}
        <div className="card-premium p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">AI Insights</h3>
            </div>
            {onViewSummary && (
              <button onClick={onViewSummary} className="text-[11px] font-medium text-primary/70 hover:text-primary transition-colors">
                Full briefing &rarr;
              </button>
            )}
          </div>
          <div className="space-y-2">
            {insights.slice(0, 4).map((ins, i) => {
              const ICON = {
                success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />,
                warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
                danger:  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />,
                info:    <Lightbulb    className="h-3.5 w-3.5 shrink-0 text-primary" />,
              }
              const BG = {
                success: 'bg-emerald-500/6',
                warning: 'bg-amber-500/6',
                danger:  'bg-rose-500/6',
                info:    'bg-primary/6',
              }
              return (
                <div
                  key={i}
                  onClick={() => onViewSummary?.()}
                  className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 transition-opacity hover:opacity-75', BG[ins.type])}
                >
                  <div className="mt-0.5">{ICON[ins.type]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold leading-tight">{ins.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                      {ins.text}
                    </p>
                  </div>
                </div>
              )
            })}
            {insights.length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground">
                No insights available for this period.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
