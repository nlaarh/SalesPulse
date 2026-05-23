/**
 * AdvisorDashboard — Tab 1: Overview (CEO edition)
 *
 * Answers 3 questions at a glance:
 *   1. Will we hit the goal?  → Annual gauge + monthly progress
 *   2. Who is driving it?     → Branch contribution + top advisors
 *   3. Where are we losing?   → Laggards + at-risk pipeline + AI insights
 */

import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { motion } from 'framer-motion'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import { DeltaPill } from '@/components/DeltaPill'
import FunnelChart from '@/components/FunnelChart'
import type { FunnelData } from '@/components/FunnelChart'
import AtRiskDeals from './AtRiskDeals'
import type { Summary, Advisor, ChartColors } from './types'
import type { Insight, SlippingDeal } from '@/lib/types'
import type { AchievementResponse, BranchMonthlyData, MonthlyTargetsResponse } from '@/lib/api'
import {
  buildGaugeOption, buildMonthlyBulletOption,
  buildBranchBarOption, buildAdvisorBarOption,
} from './overviewCharts'
import {
  DollarSign, Trophy, GitBranch, Target, Users,
  Megaphone, TrendingDown, Sparkles, MapPin,
  CheckCircle2, AlertTriangle, Lightbulb,
} from 'lucide-react'

/* ── Props ── */

export interface OverviewTabProps {
  summary: Summary
  isInsurance: boolean
  dealsYoyPct: number
  pipelineCoverage: number
  funnel: FunnelData | null
  c: ChartColors
  leaders: Advisor[]
  insights: Insight[]
  slipping: SlippingDeal[]
  onSelectAdvisor: (name: string) => void
  onViewSummary?: () => void
  periodLabel: string
  viewMode: string
  // goal / progress data
  achievement?: AchievementResponse | null
  achBase?: 'commission' | 'bookings'
  monthlyTargets?: MonthlyTargetsResponse | null
  branchData?: BranchMonthlyData | null
}

/* ── Sub-components ── */

function KPITile({ icon: Icon, iconColor, iconBg, title, value, delta, deltaLabel, sub, onClick, tip }: {
  icon: React.ElementType; iconColor: string; iconBg: string
  title: string; value: string
  delta?: number; deltaLabel?: string; sub?: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div onClick={onClick} className={cn('card-premium relative overflow-hidden p-5', onClick && 'cursor-pointer hover:bg-secondary/5')}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="mb-3 flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
        {tip && <Tip text={tip} />}
      </div>
      <p className="tabular-nums text-[26px] font-bold leading-none tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <DeltaPill value={delta} />}
        {(deltaLabel || sub) && <span className="text-[11px] text-muted-foreground">{deltaLabel || sub}</span>}
      </div>
    </div>
  )
}

function ActivityCell({ icon: Icon, label, value, color, bg, onClick, tip }: {
  icon: React.ElementType; label: string; value: string; color: string; bg: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div onClick={onClick} className={cn('flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/10 p-3.5', onClick && 'cursor-pointer hover:bg-secondary/30')}>
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

const INSIGHT_ICON = {
  success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
  danger:  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />,
  info:    <Lightbulb     className="h-3.5 w-3.5 shrink-0 text-primary" />,
}
const INSIGHT_BG = {
  success: 'bg-emerald-500/6', warning: 'bg-amber-500/6',
  danger:  'bg-rose-500/6',    info:    'bg-primary/6',
}

/* ── Main ── */

export default function OverviewTab({
  summary, isInsurance, dealsYoyPct, pipelineCoverage,
  funnel, c, leaders, insights, slipping,
  onSelectAdvisor, onViewSummary, periodLabel,
  achievement, achBase = 'commission', monthlyTargets, branchData,
}: OverviewTabProps) {
  const nav = useNavigate()

  const billedValue = summary.bookings
  const billedPct   = summary.bookings_yoy_pct
  const commValue   = isInsurance ? summary.bookings : summary.commission

  const currentMonthIdx  = new Date().getMonth() // 0-indexed
  const annualPct        = achievement?.yearly?.company?.achievement_pct ?? null
  const pacePct          = achievement?.yearly?.pace_pct ?? 0
  const monthPct         = achievement?.current_month?.company?.achievement_pct ?? null
  const monthActual      = achBase === 'bookings'
    ? (achievement?.current_month?.company?.bookings_actual ?? achievement?.current_month?.company?.actual ?? 0)
    : (achievement?.current_month?.company?.commission_actual ?? achievement?.current_month?.company?.actual ?? 0)
  const monthTarget      = achBase === 'bookings'
    ? (achievement?.current_month?.company?.bookings_target ?? achievement?.current_month?.company?.target ?? 0)
    : (achievement?.current_month?.company?.target ?? 0)
  const companyMonths    = monthlyTargets?.company?.months ?? []
  const hasGoalData      = annualPct !== null && achievement?.yearly

  const top8     = leaders.slice(0, 8)
  const reversed8 = [...top8].reverse()
  const laggards = leaders.length >= 6 ? leaders.slice(-5) : []
  const topVal   = leaders[0]
    ? Math.max(leaders[0].commission > 0 ? leaders[0].commission : leaders[0].bookings, 1)
    : 1

  const showBranch   = !!(branchData?.branches?.length)
  const leadsCount   = funnel?.steps?.[0]?.count ?? 0
  const oppsCount    = funnel?.steps?.find(s => s.step.toLowerCase().includes('opp'))?.count
                    ?? funnel?.steps?.[1]?.count ?? 0
  const coveragePct  = Math.min(pipelineCoverage / 3 * 100, 100)

  const yearlyActual = achBase === 'bookings'
    ? (achievement?.yearly?.company?.bookings_actual ?? achievement?.yearly?.company?.actual ?? 0)
    : (achievement?.yearly?.company?.commission_actual ?? achievement?.yearly?.company?.actual ?? 0)
  const yearlyTarget = achBase === 'bookings'
    ? (achievement?.yearly?.company?.bookings_target ?? achievement?.yearly?.company?.target ?? 0)
    : (achievement?.yearly?.company?.target ?? 0)

  /* KPI tiles data */
  const kpis = [
    { icon: DollarSign, iconBg: 'bg-primary/10',     iconColor: 'text-primary',
      title: 'Billed Bookings', tip: TIPS.billedRevenue,
      value: formatCurrency(billedValue, true),
      delta: billedPct, deltaLabel: 'vs last year', onClick: () => nav('/monthly') },
    { icon: Trophy,    iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-500',
      title: 'Won Deals', tip: TIPS.wonDeals,
      value: formatNumber(summary.deals),
      delta: dealsYoyPct, deltaLabel: 'from last year', onClick: () => nav('/monthly') },
    { icon: GitBranch, iconBg: 'bg-cyan-500/10',    iconColor: 'text-cyan-500',
      title: 'Open Pipeline', tip: TIPS.pipeline,
      value: formatCurrency(summary.pipeline_value, true),
      sub: `${pipelineCoverage.toFixed(1)}x coverage · ${formatNumber(summary.pipeline_count)} deals`,
      onClick: () => nav('/pipeline') },
    { icon: Target,    iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500',
      title: 'Win Rate', tip: TIPS.winRate,
      value: formatPct(summary.win_rate),
      sub: `Avg ${formatCurrency(summary.avg_deal_size, true)} per deal`,
      onClick: () => nav('/monthly') },
  ] as const

  return (
    <>
      {/* ── HERO: Gauge (if goal data) + 4 KPI tiles ───────────────────────── */}
      {hasGoalData ? (
        <div className="animate-enter grid gap-3" style={{ gridTemplateColumns: '260px 1fr' }}>
          {/* Annual Gauge card */}
          <div className="card-premium flex flex-col overflow-hidden">
            <div className="border-b border-border/50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {achievement!.yearly!.year} Annual Goal
              </p>
            </div>
            <div className="flex-1 px-2 pt-1">
              <ReactECharts
                option={buildGaugeOption(annualPct!, pacePct, c)}
                style={{ height: '155px' }}
              />
            </div>
            {/* Actual / Target strip */}
            <div className="grid grid-cols-2 divide-x divide-border/50 border-t border-border/50 text-center">
              <div className="px-3 py-2.5">
                <p className="tabular-nums text-[15px] font-bold leading-none">{formatCurrency(yearlyActual, true)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Actual</p>
              </div>
              <div className="px-3 py-2.5">
                <p className="tabular-nums text-[15px] font-bold leading-none text-muted-foreground">{formatCurrency(yearlyTarget, true)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Target</p>
              </div>
            </div>
            {/* Current month footer */}
            {achievement?.current_month && (
              <div className={cn(
                'border-t border-border/50 px-4 py-2 text-center text-[11px]',
                (monthPct ?? 0) >= 100 ? 'bg-emerald-500/5' :
                (monthPct ?? 0) >= 80  ? 'bg-amber-500/5'   : 'bg-rose-500/5',
              )}>
                <span className="font-semibold">
                  {formatCurrency(monthActual, true)} /&nbsp;
                  {formatCurrency(monthTarget, true)}
                </span>
                <span className={cn(
                  'ml-1.5 font-bold',
                  (monthPct ?? 0) >= 100 ? 'text-emerald-500' :
                  (monthPct ?? 0) >= 80  ? 'text-amber-500'   : 'text-rose-500',
                )}>
                  {monthPct !== null ? `${monthPct.toFixed(0)}%` : '—'}
                </span>
                <span className="ml-1 text-muted-foreground">
                  · Day {achievement.current_month.day_of_month}/{achievement.current_month.days_in_month}
                </span>
              </div>
            )}
          </div>

          {/* 2×2 KPI grid */}
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((tile, i) => (
              <motion.div key={tile.title}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 + 0.1, duration: 0.3, ease: 'easeOut' }}>
                <KPITile {...tile} />
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        /* Fallback: 4-column KPI tiles when no goal data */
        <div className="animate-enter grid grid-cols-4 gap-3">
          {kpis.map((tile, i) => (
            <motion.div key={tile.title}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.3, ease: 'easeOut' }}>
              <KPITile {...tile} />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── MONTHLY PROGRESS: Jan-Dec bullet chart ──────────────────────────── */}
      {companyMonths.length > 0 && (
        <div className="animate-enter stagger-1 card-premium p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Monthly Performance vs Target · {periodLabel}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Green = met target &nbsp;·&nbsp; Amber = within 20% &nbsp;·&nbsp; Red = missed &nbsp;·&nbsp; Blue = current month
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#94a3b8] opacity-30" /> Target bar</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-amber-400" /> Target level</span>
            </div>
          </div>
          <ReactECharts
            option={buildMonthlyBulletOption(companyMonths, currentMonthIdx, c)}
            style={{ height: '220px' }}
          />
        </div>
      )}

      {/* ── CONTRIBUTORS: Branch + Advisors ─────────────────────────────────── */}
      <div
        className="animate-enter stagger-2 grid gap-3"
        style={{ gridTemplateColumns: showBranch ? '2fr 3fr' : '1fr' }}
      >
        {showBranch && (
          <div className="card-premium overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Branch Contribution</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                commissions
              </span>
            </div>
            <div className="px-4 pb-4 pt-3">
              <ReactECharts
                option={buildBranchBarOption(branchData!.branches, c)}
                style={{ height: `${Math.max(branchData!.branches.length * 36, 140)}px` }}
              />
            </div>
          </div>
        )}

        <div className="card-premium overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Top Advisors</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                click to drill in
              </span>
            </div>
            <span className="text-[12px] font-medium text-muted-foreground">
              {leaders.length} total · top {top8.length} shown
            </span>
          </div>
          <div className="px-4 pb-4 pt-3">
            {top8.length > 0 ? (
              <ReactECharts
                option={buildAdvisorBarOption(reversed8, isInsurance, c)}
                style={{ height: `${Math.max(top8.length * 40, 200)}px` }}
                onEvents={{
                  click: (params: { dataIndex: number }) => {
                    const a = reversed8[params.dataIndex]
                    if (a) onSelectAdvisor(a.name)
                  },
                }}
              />
            ) : (
              <p className="py-10 text-center text-[12px] text-muted-foreground">No advisor data</p>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: Laggards + At-Risk + AI Insights ────────────────────── */}
      <div className="animate-enter stagger-3 grid grid-cols-3 gap-3">
        {/* Laggards */}
        <div className="card-premium p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            <h3 className="text-sm font-semibold">Lowest Performers</h3>
          </div>
          {laggards.length > 0 ? (
            <div className="space-y-2">
              {laggards.map(a => {
                const val = isInsurance ? a.bookings : (a.commission > 0 ? a.commission : a.bookings)
                const pct = Math.round(val / topVal * 100)
                return (
                  <div key={a.name} onClick={() => onSelectAdvisor(a.name)}
                    className="group cursor-pointer rounded-lg border border-border/30 bg-secondary/10 p-3 transition-colors hover:bg-rose-500/5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-primary group-hover:underline">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">#{a.rank}{a.branch ? ` · ${a.branch}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/40">
                        <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 tabular-nums text-[11px] text-rose-400">{formatCurrency(val, true)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-[11px] text-muted-foreground">Not enough advisors to compare.</p>
          )}
        </div>

        {/* At-Risk Pipeline */}
        <div className="card-premium p-4">
          <AtRiskDeals deals={slipping} onSelectAdvisor={onSelectAdvisor} />
        </div>

        {/* AI Insights */}
        <div className="card-premium p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">AI Insights</h3>
            </div>
            {onViewSummary && (
              <button onClick={onViewSummary} className="text-[11px] font-medium text-primary/70 hover:text-primary">
                Full briefing →
              </button>
            )}
          </div>
          <div className="space-y-2">
            {insights.slice(0, 4).map((ins, i) => (
              <div key={i} onClick={() => onViewSummary?.()}
                className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 hover:opacity-75', INSIGHT_BG[ins.type])}>
                <div className="mt-0.5">{INSIGHT_ICON[ins.type]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-tight">{ins.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{ins.text}</p>
                </div>
              </div>
            ))}
            {insights.length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground">No insights for this period.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── FUNNEL + ACTIVITY ────────────────────────────────────────────────── */}
      <div className="animate-enter stagger-4 grid grid-cols-2 gap-3">
        <div onClick={() => nav('/pipeline')} className="card-premium cursor-pointer hover:bg-secondary/5">
          <FunnelChart funnel={funnel} variant="compact" />
        </div>

        <div className="card-premium p-5">
          <h3 className="mb-4 text-sm font-semibold">Sales Activity · {periodLabel}</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <ActivityCell icon={Megaphone}  label="Leads"    value={formatNumber(leadsCount)}                     color="text-primary"     bg="bg-primary/10"     onClick={() => nav('/leads')}    tip={TIPS.leads} />
            <ActivityCell icon={Target}     label="Opps"     value={formatNumber(oppsCount)}                     color="text-amber-500"   bg="bg-amber-500/10"   onClick={() => nav('/pipeline')} tip={TIPS.opps} />
            <ActivityCell icon={Trophy}     label="Won"      value={formatNumber(summary.deals)}                 color="text-emerald-500" bg="bg-emerald-500/10" onClick={() => nav('/monthly')}  tip={TIPS.wonDeals} />
            <ActivityCell icon={DollarSign} label="Avg Deal" value={formatCurrency(summary.avg_deal_size, true)}  color="text-cyan-500"    bg="bg-cyan-500/10"    onClick={() => nav('/monthly')}  tip={TIPS.avgDeal} />
          </div>
          <div onClick={() => nav('/pipeline')} className="mt-3 cursor-pointer rounded-xl border border-border/40 bg-secondary/20 p-3.5 hover:bg-secondary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Pipeline Coverage<Tip text={TIPS.pipelineCoverage} /></span>
              <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold',
                pipelineCoverage >= 2 ? 'bg-emerald-500/10 text-emerald-500' : pipelineCoverage >= 1 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500')}>
                {pipelineCoverage >= 2 ? 'Healthy' : pipelineCoverage >= 1 ? 'Moderate' : 'Low'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="tabular-nums text-[22px] font-bold leading-none">{pipelineCoverage.toFixed(1)}x</p>
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                  <div className={cn('h-full rounded-full', pipelineCoverage >= 2 ? 'bg-emerald-500' : pipelineCoverage >= 1 ? 'bg-amber-500' : 'bg-rose-500')}
                    style={{ width: `${coveragePct}%` }} />
                </div>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground">{formatNumber(summary.pipeline_count)} open opportunities</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
