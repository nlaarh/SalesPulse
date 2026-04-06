import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchAgentProfile, fetchTargetsWithActuals, fetchTargetAchievement } from '@/lib/api'
import { useChartColors } from '@/lib/chart-theme'
import { formatCurrency, formatPct, cn } from '@/lib/utils'
import { DeltaPill } from '@/components/DeltaPill'
import type { AgentMonthData, Opp } from '@/lib/types'
import {
  Loader2, ArrowLeft, Sparkles,
  Target, BarChart3, ListTodo, FileText,
} from 'lucide-react'
import ManagerBriefing from '@/components/ManagerBriefing'
import TargetProgressBar from '@/components/TargetProgressBar'
import { Tip, TIPS } from '@/components/MetricTip'
import AgentReportActions from '@/components/AgentReportActions'
import PerformanceTab from './agent/PerformanceTab'
import OpportunitiesTab from './agent/OpportunitiesTab'
import SummaryTab from './agent/SummaryTab'

/* ── Types ────────────────────────────────────────────────────────────────── */

interface TaskItem {
  id: string; subject: string; status: string; priority: string
  due_date: string | null; related_to: string; what_id: string
  opp_amount: number | null; overdue: boolean
  days_overdue: number | null; created: string
}

interface TaskStats {
  total_open: number; overdue: number; completed_period: number
  total_period: number; completion_rate: number
}

export interface AgentProfile {
  name: string; line: string; email?: string
  current_year: number; prior_year: number
  has_separate_bookings: boolean
  summary: {
    revenue: number; commission: number; deals: number; win_rate: number; avg_deal: number
    pipeline_value: number; pipeline_count: number
    leads: number; opps_created: number; coverage: number
  }
  prior: { revenue: number; commission: number; deals: number; win_rate: number; avg_deal: number }
  yoy: { revenue_pct: number; commission_pct: number; deals_pct: number; win_rate_delta: number; avg_deal_delta: number }
  months: AgentMonthData[]
  top_opportunities: Opp[]
  won_opportunities: Array<{
    id: string; name: string; amount: number; stage: string
    probability: number; close_date: string; commission: number
  }>
  team: { avg_revenue: number; avg_commission: number; win_rate: number; avg_deal: number; total_agents: number }
  strengths: string[]; improvements: string[]
  pushed_count: number; pushed_value: number; stale_count: number
  writeup: string; ai_powered: boolean
  tasks: { open_tasks: TaskItem[]; stats: TaskStats }
}

type AgentTab = 'charts' | 'opportunities' | 'tasks'

/* ── Tab Button ───────────────────────────────────────────────────────────── */

function TabButton({ icon, label, active, onClick, count, overdueCount }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void
  count?: number; overdueCount?: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-3 text-[12px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      {count != null && (
        <span className={cn(
          'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
          active ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
        )}>
          {count}
        </span>
      )}
      {overdueCount != null && overdueCount > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500/15 px-1 text-[10px] font-bold text-rose-500">
          {overdueCount}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
      )}
    </button>
  )
}

/* ── KPI Card ─────────────────────────────────────────────────────────────── */

function KPICard({ label, value, delta, sub, tip }: {
  label: string; value: string; delta: React.ReactNode; sub: string; tip?: string
}) {
  return (
    <div className="card-premium px-4 py-3.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}{tip && <Tip text={tip} />}
      </span>
      <p className="mt-1 text-[22px] font-bold tabular-nums tracking-tight">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta}
      </div>
      <span className="mt-0.5 block text-[12px] font-medium text-muted-foreground">{sub}</span>
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function AgentDashboard() {
  const { name } = useParams<{ name: string }>()
  const { line, period, startDate, endDate } = useSales()
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBriefing, setShowBriefing] = useState(false)
  const [activeTab, setActiveTab] = useState<AgentTab>('charts')
  const [targetData, setTargetData] = useState<{
    monthlyTarget: number | null
    totalActual: number
    totalTarget: number
    achievementPct: number | null
  } | null>(null)
  const [achievement, setAchievement] = useState<{
    monthly: { target: number; actual: number; achievement_pct: number | null }
    yearly: { target: number; actual: number; achievement_pct: number | null; pace_pct: number }
    monthlyPacePct: number
    monthLabel: string
    yearLabel: string
    dayLabel: string
    monthOfYear: number
  } | null>(null)
  const monthlyTarget = targetData?.monthlyTarget ?? null
  const c = useChartColors()

  useEffect(() => {
    if (!name) return
    const decoded = decodeURIComponent(name)
    let cancelled = false
    setLoading(true)
    // Phase 1: Load profile without AI (fast)
    fetchAgentProfile(decoded, line, period, startDate, endDate, false)
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setLoading(false)
        // Phase 2: Background-fetch AI brief
        return fetchAgentProfile(decoded, line, period, startDate, endDate, true)
      })
      .then((data) => {
        if (cancelled || !data) return
        setProfile(data)
      })
      .catch(console.error)
    // Load target with actuals in parallel (Invoice-only data)
    fetchTargetsWithActuals(line, startDate, endDate)
      .then((td) => {
        if (cancelled) return
        const match = td.advisors.find(
          (a) => a.name.toLowerCase() === decoded.toLowerCase(),
        )
        if (match) {
          setTargetData({
            monthlyTarget: match.monthly_target,
            totalActual: match.total_actual,
            totalTarget: match.total_target,
            achievementPct: match.achievement_pct,
          })
        }
      })
      .catch(() => {})
    // Load achievement for progress bars
    fetchTargetAchievement(line, decoded)
      .then((data) => {
        if (cancelled || !data.current_month || !data.yearly) return
        const adv = data.advisors[0]
        if (!adv) return
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        setAchievement({
          monthly: adv.monthly,
          yearly: adv.yearly,
          monthlyPacePct: data.current_month.pace_pct,
          monthLabel: `${monthNames[data.current_month.month - 1]} Target`,
          yearLabel: `${data.yearly.year} Yearly Target`,
          dayLabel: `Day ${data.current_month.day_of_month}/${data.current_month.days_in_month}`,
          monthOfYear: data.yearly.month_of_year,
        })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [name, line, period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        <span className="text-[12px] text-muted-foreground">Loading agent profile...</span>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Agent not found
      </div>
    )
  }

  const s = profile.summary
  const yoy = profile.yoy

  return (
    <div className="space-y-5">
      {/* ── Back nav + Header ─────────────────────────────────────────── */}
      <div className="animate-enter">
        <Link
          to="/monthly"
          className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Monthly Report
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {profile.line} Division &middot; {profile.current_year} Performance
              &middot; {profile.team.total_agents} advisors in division
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AgentReportActions
              profile={profile}
              startDate={startDate ?? undefined}
              endDate={endDate ?? undefined}
              line={line}
              period={period}
            />
            <button
              onClick={() => setShowBriefing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" /> 1:1 Prep Sheet
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards Row ─────────────────────────────────────────────── */}
      <div className={cn('animate-enter stagger-1 grid gap-3', monthlyTarget != null ? 'grid-cols-6' : 'grid-cols-5')}>
        <KPICard
          label="Commission"
          value={formatCurrency(s.commission, true)}
          delta={<DeltaPill value={yoy.commission_pct} suffix="% YoY" />}
          sub={`PY: ${formatCurrency(profile.prior.commission, true)}`}
          tip={TIPS.commission}
        />
        {profile.has_separate_bookings ? (
          <KPICard
            label="Bookings"
            value={formatCurrency(s.revenue, true)}
            delta={<DeltaPill value={yoy.revenue_pct} suffix="% YoY" />}
            sub={`PY: ${formatCurrency(profile.prior.revenue, true)}`}
            tip={TIPS.bookings}
          />
        ) : (
          <KPICard
            label="Avg Deal"
            value={formatCurrency(s.avg_deal, true)}
            delta={<DeltaPill value={yoy.avg_deal_delta} suffix="" />}
            sub={`PY: ${formatCurrency(profile.prior.avg_deal, true)}`}
            tip={TIPS.avgDeal}
          />
        )}
        <KPICard
          label="Deals Won"
          value={String(s.deals)}
          delta={<DeltaPill value={yoy.deals_pct} suffix="% YoY" />}
          sub={`PY: ${profile.prior.deals}`}
          tip={TIPS.wonDeals}
        />
        <KPICard
          label="Win Rate"
          value={formatPct(s.win_rate)}
          delta={<DeltaPill value={yoy.win_rate_delta} suffix="pts" />}
          sub={`PY: ${formatPct(profile.prior.win_rate)}`}
          tip={TIPS.winRate}
        />
        <KPICard
          label="Pipeline"
          value={formatCurrency(s.pipeline_value, true)}
          delta={
            <span className={cn(
              'text-[12px] font-semibold',
              s.coverage >= 2 ? 'text-emerald-500' : s.coverage >= 1 ? 'text-amber-500' : 'text-rose-500',
            )}>
              {s.coverage}x coverage
            </span>
          }
          sub={`${s.pipeline_count} deals`}
          tip={TIPS.activePipeline}
        />
        {targetData && monthlyTarget != null && (() => {
          const avgMonthlyComm = period > 0 ? targetData.totalActual / period : 0
          const pct = monthlyTarget > 0 ? (avgMonthlyComm / monthlyTarget) * 100 : 0
          return (
            <KPICard
              label="vs Target"
              value={`${pct.toFixed(0)}%`}
              delta={
                <span className={cn(
                  'text-[12px] font-semibold',
                  pct >= 100 ? 'text-emerald-500' : pct >= 80 ? 'text-amber-500' : 'text-rose-500',
                )}>
                  {pct >= 100 ? 'On track' : pct >= 80 ? 'Close' : 'Below target'}
                </span>
              }
              sub={`Comm ${formatCurrency(avgMonthlyComm, true)}/mo vs ${formatCurrency(monthlyTarget, true)} target`}
              tip="Average monthly commission vs monthly performance threshold"
            />
          )
        })()}
      </div>

      {/* ── Target Achievement ────────────────────────────────────────────── */}
      {achievement && achievement.monthly.target > 0 && (
        <div className="animate-enter stagger-2 card-premium px-5 py-4">
          <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Target Achievement — {profile.name}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <TargetProgressBar
              label={achievement.monthLabel}
              actual={achievement.monthly.actual}
              target={achievement.monthly.target}
              pacePct={achievement.monthlyPacePct}
              paceLabel={achievement.dayLabel}
              color="indigo"
            />
            <TargetProgressBar
              label={achievement.yearLabel}
              actual={achievement.yearly.actual}
              target={achievement.yearly.target}
              pacePct={achievement.yearly.pace_pct}
              paceLabel={`Month ${achievement.monthOfYear}/12`}
              color="green"
            />
          </div>
        </div>
      )}

      {/* ── AI Manager's Brief ────────────────────────────────────────── */}
      <div className="animate-enter stagger-2 card-premium">
        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">Manager's Brief<Tip text={TIPS.managerBrief} /></h2>
            {profile.ai_powered && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                AI-Powered
              </span>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-[13px] leading-relaxed text-foreground/90">{profile.writeup}</p>
        </div>
      </div>

      {/* ── Tabbed Section ────────────────────────────────────────────── */}
      <div className="animate-enter stagger-3 card-premium overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border px-4">
          <TabButton
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            label="Charts"
            active={activeTab === 'charts'}
            onClick={() => setActiveTab('charts')}
          />
          <TabButton
            icon={<Target className="h-3.5 w-3.5" />}
            label="Opportunities"
            active={activeTab === 'opportunities'}
            onClick={() => setActiveTab('opportunities')}
            count={profile.top_opportunities.length}
          />
          <TabButton
            icon={<ListTodo className="h-3.5 w-3.5" />}
            label="Tasks"
            active={activeTab === 'tasks'}
            onClick={() => setActiveTab('tasks')}
            count={profile.tasks.stats.total_open}
            overdueCount={profile.tasks.stats.overdue}
          />
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'charts' && (
            <PerformanceTab profile={profile} c={c} monthlyTarget={monthlyTarget} targetData={targetData} />
          )}
          {activeTab === 'opportunities' && (
            <OpportunitiesTab profile={profile} />
          )}
          {activeTab === 'tasks' && (
            <SummaryTab profile={profile} />
          )}
        </div>
      </div>

      {/* ── Manager Briefing Overlay ─────────────────────────────────── */}
      {showBriefing && (
        <ManagerBriefing profile={profile} achievement={achievement} onClose={() => setShowBriefing(false)} />
      )}
    </div>
  )
}
