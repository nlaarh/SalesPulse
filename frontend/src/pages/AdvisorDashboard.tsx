/**
 * AdvisorDashboard — Main container.
 *
 * Owns all state + data fetching. Routes to tab components via props.
 * Tab content lives in ./advisor/OverviewTab, RankingsTab, SummaryTab.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchAdvisorSummary, fetchAdvisorLeaderboard,
  fetchPerformanceInsights, fetchAdvisorYoY,
  fetchPerformanceFunnel,
  fetchPipelineSlipping, fetchLeadsVolume,
  fetchAgentCloseSpeed,
  fetchTargets, fetchTargetAchievement,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useChartColors } from '@/lib/chart-theme'
import type { Insight, SlippingDeal } from '@/lib/types'
import type { Summary, Advisor, YoYData, CloseSpeed } from './advisor/types'
import type { FunnelData } from '@/components/FunnelChart'
import OverviewTab from './advisor/OverviewTab'
import RankingsTab from './advisor/RankingsTab'
import SummaryTab from './advisor/SummaryTab'
import { Loader2, BarChart3, Trophy, Sparkles, Printer, BookOpen, DollarSign } from 'lucide-react'
import type { AchievementResponse } from '@/lib/api'
import EmailPopover from '@/components/EmailPopover'
import { emailAdvisorDashboard } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { printFromDom } from '@/lib/printWindow'
import TargetProgressBar from '@/components/TargetProgressBar'

/* ── Types ────────────────────────────────────────────────────────────────── */

type Tab = 'overview' | 'rankings' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'rankings', label: 'Rankings & Data', icon: Trophy },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function AdvisorDashboard() {
  const { line, period, startDate, endDate, viewMode } = useSales()
  const navigate = useNavigate()
  const { user } = useAuth()
  const c = useChartColors()

  const [summary, setSummary] = useState<Summary | null>(null)
  const [leaders, setLeaders] = useState<Advisor[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [yoy, setYoY] = useState<YoYData | null>(null)
  const [funnel, setFunnel] = useState<FunnelData | null>(null)
  const [slipping, setSlipping] = useState<SlippingDeal[]>([])
  const [leadSources, setLeadSources] = useState<{ source: string; count: number }[]>([])
  const [closeSpeed, setCloseSpeed] = useState<CloseSpeed | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [tab, setTab] = useState<Tab>('overview')
  const [targetMap, setTargetMap] = useState<Map<string, number>>(new Map())
  const [achievement, setAchievement] = useState<AchievementResponse | null>(null)
  const [achBase, setAchBase] = useState<'commission' | 'bookings'>('commission')

  // Refetch achievement if bookings_actual is missing (stale pre-deploy state)
  function switchAchBase(base: 'commission' | 'bookings') {
    setAchBase(base)
    if (base === 'bookings' && achievement?.current_month?.company?.bookings_actual === undefined) {
      fetchTargetAchievement(line).then(setAchievement).catch(() => {})
    }
  }

  const isInsurance = line.toLowerCase() === 'insurance'

  const periodLabel = viewMode === 'custom' && startDate && endDate
    ? `${startDate} \u2192 ${endDate}`
    : viewMode === 'month' ? 'Last month'
    : viewMode === 'quarter' ? 'Last 3 months'
    : viewMode === '6m' ? 'Last 6 months'
    : viewMode === 'ytd' ? `${new Date().getFullYear()} Year to Date`
    : viewMode === 'last-year' ? `${new Date().getFullYear() - 1}`
    : 'Last 12 months'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    // Use allSettled so a single slow/rate-limited query doesn't kill the whole dashboard.
    // summary is the only critical one — if it fails, show error.
    Promise.allSettled([
      fetchAdvisorSummary(line, period, startDate, endDate),
      fetchAdvisorLeaderboard(line, period, startDate, endDate),
      fetchPerformanceInsights(line, period, startDate, endDate),
      fetchAdvisorYoY(line),
      fetchPerformanceFunnel(line, period, startDate, endDate),
      fetchPipelineSlipping(line),
      fetchLeadsVolume(line, period, startDate, endDate),
      fetchAgentCloseSpeed(line, period, startDate, endDate),
    ]).then((results) => {
      if (cancelled) return
      const [s, l, i, y, fn, sl, lv, cs] = results
      // summary is required — if it fails, show error screen
      if (s.status === 'rejected') {
        setLoadError(true)
        return
      }
      setSummary(s.value)
      if (l.status === 'fulfilled') setLeaders(l.value.advisors ?? [])
      if (i.status === 'fulfilled') setInsights(i.value.insights ?? [])
      if (y.status === 'fulfilled') setYoY(y.value)
      if (fn.status === 'fulfilled') setFunnel(fn.value)
      if (sl.status === 'fulfilled') setSlipping(sl.value.deals ?? [])
      if (lv.status === 'fulfilled') setLeadSources(lv.value.by_source ?? [])
      if (cs.status === 'fulfilled') setCloseSpeed(cs.value)
    }).catch((err) => {
      console.error(err)
      if (!cancelled) setLoadError(true)
    }).finally(() => { if (!cancelled) setLoading(false) })
    // Load targets in parallel (non-blocking)
    fetchTargets()
      .then((td) => {
        if (cancelled) return
        const map = new Map<string, number>()
        for (const t of td.targets) {
          if (t.monthly_target != null) map.set(t.sf_name.toLowerCase(), t.monthly_target)
        }
        setTargetMap(map)
      })
      .catch(() => {})
    // Load achievement data for progress bars
    fetchTargetAchievement(line)
      .then((data) => {
        if (cancelled) return
        setAchievement(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [line, period, startDate, endDate, retryCount])

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
  }

  if (loadError) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <Loader2 className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm font-semibold text-foreground">Salesforce data unavailable</p>
        <p className="text-[12px] text-muted-foreground">This may be a temporary issue. Please try again.</p>
        <button
          onClick={() => setRetryCount(c => c + 1)}
          className="mt-1 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90">
          Retry
        </button>
      </div>
    )
  }

  // Use period-matched YoY from summary (apple-to-apple), not calendar YTD
  const dealsYoyPct = (summary as any)?.deals_yoy_pct ?? 0

  const annualizedBookings = summary && summary.bookings > 0 ? summary.bookings * (12 / period) : 0
  const pipelineCoverage = annualizedBookings > 0
    ? Math.round(summary!.pipeline_value / annualizedBookings * 10) / 10
    : 0

  return (
    <div id="advisor-print-root" className="space-y-3">
      <div className="animate-enter flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {line} Division &middot; {periodLabel}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Sales Performance</h1>
        </div>

        {/* Tab bar + actions */}
        <div data-no-print className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all duration-200',
                    tab === t.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              )
            })}
          </div>
          <button onClick={() => printFromDom('advisor-print-root', `${line} Sales Dashboard — ${periodLabel}`)}
            className="print:hidden flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
            <Printer className="h-3 w-3" /> PDF
          </button>
          <EmailPopover
            description={`${line} Sales Report — ${periodLabel}`}
            defaultEmail={user?.email ?? ''}
            onSend={async (to) => {
              await emailAdvisorDashboard(to, line, period, startDate ?? undefined, endDate ?? undefined)
            }}
          />
        </div>
      </div>

      {/* ── Target Achievement ────────────────────────────────────────── */}
      {achievement?.current_month && achievement?.yearly && (
        <div className="animate-enter card-premium px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Target Achievement
            </span>
            {/* Bookings / Commission toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              <button
                onClick={() => switchAchBase('commission')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                  achBase === 'commission' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <DollarSign className="h-3 w-3" /> Commission
              </button>
              <button
                onClick={() => switchAchBase('bookings')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                  achBase === 'bookings' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <BookOpen className="h-3 w-3" /> Bookings
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <TargetProgressBar
              label={`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][achievement.current_month.month - 1]} Target (${achBase})`}
              actual={achBase === 'bookings'
                ? (achievement.current_month.company.bookings_actual ?? achievement.current_month.company.actual)
                : (achievement.current_month.company.commission_actual ?? achievement.current_month.company.actual)}
              target={achievement.current_month.company.target}
              pacePct={achievement.current_month.pace_pct}
              paceLabel={`Day ${achievement.current_month.day_of_month}/${achievement.current_month.days_in_month}`}
              color="indigo"
            />
            <TargetProgressBar
              label={`${achievement.yearly.year} Yearly Target (${achBase})`}
              actual={achBase === 'bookings'
                ? (achievement.yearly.company.bookings_actual ?? achievement.yearly.company.actual)
                : (achievement.yearly.company.commission_actual ?? achievement.yearly.company.actual)}
              target={achievement.yearly.company.target}
              pacePct={achievement.yearly.pace_pct}
              paceLabel={`Month ${achievement.yearly.month_of_year}/12`}
              color="green"
            />
          </div>
        </div>
      )}

      {/* TAB CONTENT */}
      {tab === 'overview' && summary && (
        <OverviewTab
          summary={summary} isInsurance={isInsurance}
          dealsYoyPct={dealsYoyPct} pipelineCoverage={pipelineCoverage}
          yoy={yoy}
          funnel={funnel} c={c}
          leaders={leaders} insights={insights}
          slipping={slipping}
          onSelectAdvisor={(name) => navigate(`/agent/${encodeURIComponent(name)}`)}
          onViewSummary={() => setTab('summary')}
        />
      )}

      {tab === 'rankings' && (
        <RankingsTab
          leaders={leaders} slipping={slipping}
          leadSources={leadSources} c={c}
          targetMap={targetMap}
          onSelectAdvisor={(name) => navigate(`/agent/${encodeURIComponent(name)}`)}
        />
      )}

      {tab === 'summary' && summary && (
        <SummaryTab
          summary={summary} insights={insights}
          pipelineCoverage={pipelineCoverage}
          slipping={slipping} leaders={leaders}
          yoy={yoy} line={line} periodLabel={periodLabel}
          closeSpeed={closeSpeed}
          onSelectAdvisor={(name) => navigate(`/agent/${encodeURIComponent(name)}`)}
        />
      )}
    </div>
  )
}
