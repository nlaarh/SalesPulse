import { useEffect, useMemo, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchTopOpportunities, fetchNarrative } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { scoreColor, scoreBg, fmtDate } from '@/lib/formatters'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import KPICard from '@/components/KPICard'
import RichNarrative from '@/components/RichNarrative'
import { Tip, TIPS } from '@/components/MetricTip'
import {
  Loader2, Sparkles, ChevronRight, Info, ExternalLink,
  BarChart3, Table2, DollarSign, Target, AlertTriangle, TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'

/* ── Types ────────────────────────────────────────────────────────────────── */

interface Opportunity {
  rank: number; id: string; name: string; amount: number; stage: string
  probability: number; forecast_category: string; close_date: string
  last_activity: string; push_count: number; owner: string; score: number
  reasons: string[]; writeup: string
}

type Tab = 'charts' | 'details' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'charts', label: 'Charts', icon: BarChart3 },
  { key: 'details', label: 'Details', icon: Table2 },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function TopOpportunities() {
  const { line, startDate, endDate } = useSales()
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [aiPowered, setAiPowered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('charts')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchTopOpportunities(line, 100, false, startDate, endDate)
      .then((data) => {
        if (cancelled) return
        setOpps(data.opportunities ?? []); setAiPowered(false); setLoading(false)
        return fetchTopOpportunities(line, 100, true, startDate, endDate)
      })
      .then((data) => {
        if (cancelled || !data) return
        setOpps(data.opportunities ?? []); setAiPowered(data.ai_powered ?? false)
      })
      .catch(console.error)
    return () => { cancelled = true }
  }, [line, startDate, endDate])

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        <span className="text-[12px] text-muted-foreground">Scoring opportunities & generating AI insights...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header + Tabs */}
      <div className="animate-enter flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {line} Division &middot; {opps.length} deals ranked by conversion likelihood
            {aiPowered && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" /> AI-Powered
              </span>
            )}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Top Opportunities</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all duration-200',
                  tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'charts' && <ChartsTab opps={opps} />}
      {tab === 'details' && <DetailsTab opps={opps} aiPowered={aiPowered} expanded={expanded} setExpanded={setExpanded} />}
      {tab === 'summary' && <SummaryTab opps={opps} line={line} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   CHARTS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ChartsTab({ opps }: { opps: Opportunity[] }) {
  const c = useChartColors()

  const { totalValue, avgScore, highPriority, overdueCount } = useMemo(() => ({
    totalValue: opps.reduce((s, o) => s + o.amount, 0),
    avgScore: opps.length > 0 ? opps.reduce((s, o) => s + o.score, 0) / opps.length : 0,
    highPriority: opps.filter(o => o.score >= 80).length,
    overdueCount: opps.filter(o => { const d = daysFromNow(o.close_date); return d != null && d < 0 }).length,
  }), [opps])

  // Score distribution buckets
  const scoreBuckets = useMemo(() => [
    { range: '90-100', count: opps.filter(o => o.score >= 90).length },
    { range: '80-89', count: opps.filter(o => o.score >= 80 && o.score < 90).length },
    { range: '70-79', count: opps.filter(o => o.score >= 70 && o.score < 80).length },
    { range: '60-69', count: opps.filter(o => o.score >= 60 && o.score < 70).length },
    { range: '50-59', count: opps.filter(o => o.score >= 50 && o.score < 60).length },
    { range: '<50', count: opps.filter(o => o.score < 50).length },
  ], [opps])

  // Stage breakdown
  const stageData = useMemo(() => {
    const stageMap = new Map<string, { count: number; amount: number }>()
    opps.forEach(o => {
      const prev = stageMap.get(o.stage) || { count: 0, amount: 0 }
      prev.count++; prev.amount += o.amount
      stageMap.set(o.stage, prev)
    })
    return Array.from(stageMap.entries())
      .map(([stage, data]) => ({ stage, ...data }))
      .sort((a, b) => b.amount - a.amount)
  }, [opps])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Total Pipeline" value={formatCurrency(totalValue, true)} icon={<DollarSign className="h-4 w-4" />} className="stagger-1" />
        <KPICard title="Avg Priority Score" value={avgScore.toFixed(0)} icon={<Target className="h-4 w-4" />} className="stagger-2" />
        <KPICard title="High Priority (80+)" value={formatNumber(highPriority)} subtitle={`of ${opps.length} deals`} icon={<TrendingUp className="h-4 w-4" />} className="stagger-3" />
        <KPICard title="Overdue" value={formatNumber(overdueCount)} icon={<AlertTriangle className="h-4 w-4" />} className="stagger-4" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Distribution */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Score Distribution<Tip text={TIPS.priorityScore} /></h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={scoreBuckets}>
                <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} />
                <Bar dataKey="count" fill={c.primary} radius={[4, 4, 0, 0]} barSize={28} name="Deals" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stage Breakdown */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Pipeline by Stage</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stageData} layout="vertical">
                <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: number) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} />
                <YAxis type="category" dataKey="stage" width={110} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [formatCurrency(Number(v), true), 'Value']} />
                <Bar dataKey="amount" fill={c.secondary} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DETAILS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function DetailsTab({ opps, aiPowered, expanded, setExpanded }: {
  opps: Opportunity[]; aiPowered: boolean; expanded: string | null; setExpanded: (id: string | null) => void
}) {
  return (
    <div className="space-y-4">
      {/* Score legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="font-medium">Priority Score<Tip text={TIPS.priorityScore} /></span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> 80+ High</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> 60-79 Medium</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> &lt;60 Lower</span>
      </div>

      <div className="space-y-2">
        {opps.map((opp) => {
          const isExpanded = expanded === opp.id
          const days = daysFromNow(opp.close_date)
          return (
            <div key={opp.id} className={cn('card-premium transition-all duration-200', isExpanded && 'ring-1 ring-primary/20')}>
              <button onClick={() => setExpanded(isExpanded ? null : opp.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold', opp.rank <= 3 ? 'bg-primary/15 text-primary' : 'text-muted-foreground/50')}>{opp.rank}</span>
                <div className="w-12 shrink-0">
                  <span className={cn('tabular-nums text-[14px] font-bold', scoreColor(opp.score))}>{opp.score.toFixed(0)}</span>
                  <div className="mt-0.5 h-1 w-full rounded-full bg-secondary">
                    <div className={cn('h-1 rounded-full transition-all', scoreBg(opp.score))} style={{ width: `${opp.score}%` }} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{opp.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{opp.owner} &middot; {opp.stage} &middot; {opp.forecast_category}</p>
                </div>
                <span className="tabular-nums text-[14px] font-semibold">{formatCurrency(opp.amount, true)}</span>
                <span className={cn('w-20 text-right text-[11px]', days != null && days <= 7 ? 'font-semibold text-amber-500' : 'text-muted-foreground')}>
                  {fmtDate(opp.close_date)}
                  {days != null && days <= 14 && <span className="block text-[10px]">{days <= 0 ? 'Overdue' : `${days}d left`}</span>}
                </span>
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-200', isExpanded && 'rotate-90 text-primary')} />
              </button>

              {isExpanded && (
                <div className="animate-expand border-t border-border px-5 py-4">
                  <div className="rounded-lg bg-secondary/30 px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {aiPowered ? <><Sparkles className="h-3 w-3 text-primary" /> AI Analysis</> : <><Info className="h-3 w-3" /> Analysis</>}
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/90">{opp.writeup}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-[11px] lg:grid-cols-4">
                    <DetailItem label="Probability" value={`${opp.probability}%`} />
                    <DetailItem label="Push Count" value={String(opp.push_count)} warn={opp.push_count >= 3} />
                    <DetailItem label="Last Activity" value={fmtDate(opp.last_activity)} />
                    <DetailItem label="Amount" value={formatCurrency(opp.amount)} />
                    <DetailItem label="Stage" value={opp.stage} />
                    <DetailItem label="Forecast" value={opp.forecast_category} />
                    <DetailItem label="Close Date" value={fmtDate(opp.close_date)} />
                    <DetailItem label="Owner" value={opp.owner} />
                  </div>
                  {opp.reasons.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {opp.reasons.map((r, i) => (
                        <span key={i} className="rounded-md bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">{r}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <a href={`https://aaawcny.my.salesforce.com/${opp.id}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20">
                      <ExternalLink className="h-3 w-3" />Open in Salesforce &middot; {formatCurrency(opp.amount, true)}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   EXECUTIVE SUMMARY TAB
   ════════════════════════════════════════════════════════════════════════════ */

function SummaryTab({ opps, line }: { opps: Opportunity[]; line: string }) {
  const { line: ctxLine, period, startDate, endDate } = useSales()
  const [aiNarrative, setAiNarrative] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    setAiNarrative(null)
    fetchNarrative('top-opps', ctxLine, period, startDate, endDate)
      .then(r => { if (r.narrative) setAiNarrative(r.narrative) })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [ctxLine, period, startDate, endDate])

  const {
    totalValue, highPriority, medPriority, lowPriority,
    overdue, closingSoon, overdueValue, highPriorityValue, closingSoonValue,
    topStage, highPushDeals, highPushValue, uniqueOwners, highPctVal,
  } = useMemo(() => {
    const totalValue = opps.reduce((s, o) => s + o.amount, 0)
    const highPriority = opps.filter(o => o.score >= 80)
    const medPriority = opps.filter(o => o.score >= 60 && o.score < 80)
    const lowPriority = opps.filter(o => o.score < 60)
    const overdue = opps.filter(o => { const d = daysFromNow(o.close_date); return d != null && d < 0 })
    const closingSoon = opps.filter(o => { const d = daysFromNow(o.close_date); return d != null && d >= 0 && d <= 30 })
    const overdueValue = overdue.reduce((s, o) => s + o.amount, 0)
    const highPriorityValue = highPriority.reduce((s, o) => s + o.amount, 0)
    const closingSoonValue = closingSoon.reduce((s, o) => s + o.amount, 0)

    // Stage concentration
    const stageMap = new Map<string, number>()
    opps.forEach(o => stageMap.set(o.stage, (stageMap.get(o.stage) || 0) + o.amount))
    const topStage = Array.from(stageMap.entries()).sort((a, b) => b[1] - a[1])[0]

    // Push count risk (deals pushed 3+ times)
    const highPushDeals = opps.filter(o => o.push_count >= 3)
    const highPushValue = highPushDeals.reduce((s, o) => s + o.amount, 0)

    // Owner distribution
    const ownerMap = new Map<string, number>()
    opps.forEach(o => ownerMap.set(o.owner, (ownerMap.get(o.owner) || 0) + 1))
    const uniqueOwners = ownerMap.size

    const highPctVal = totalValue > 0 ? (highPriorityValue / totalValue * 100) : 0

    return {
      totalValue, highPriority, medPriority, lowPriority,
      overdue, closingSoon, overdueValue, highPriorityValue, closingSoonValue,
      topStage, highPushDeals, highPushValue, uniqueOwners, highPctVal,
    }
  }, [opps])

  // VP-level narrative — full paragraphs
  const para1 = `As of today, the ${line} Division has **${formatCurrency(totalValue, true)}** in active pipeline across **${formatNumber(opps.length)} deals**. **${highPriority.length} opportunities** (${highPctVal.toFixed(0)}% of total value) score 80+ on our priority model, representing **${formatCurrency(highPriorityValue, true)}** in high-confidence pipeline. ${medPriority.length} deals score in the 60-79 range, while ${lowPriority.length} sit below 60 — the quality mix ${highPctVal >= 40 ? '**is healthy**, with strong deals comprising the bulk of value' : highPctVal >= 20 ? 'is adequate but could be improved by qualifying or removing weaker deals' : '**is concerning** — most pipeline value sits in lower-confidence opportunities'}.`

  const para2 = closingSoon.length > 0
    ? `**Near-term execution:** **${closingSoon.length} deals** worth **${formatCurrency(closingSoonValue, true)}** close within 30 days across ${uniqueOwners} advisors. ${closingSoon.length >= 5 ? 'This is a healthy volume of closing-stage activity.' : 'The short pipeline is thin — fewer deals closing soon means less near-term revenue certainty.'} ${overdue.length > 0 ? `However, **${overdue.length} deals** (**${formatCurrency(overdueValue, true)}**) are already past their close date, signaling stalled momentum or unrealistic timelines that need immediate correction.` : 'No deals are currently overdue, which indicates good timeline discipline.'}`
    : overdue.length > 0
    ? `**Immediate concern:** **${overdue.length} deals** (**${formatCurrency(overdueValue, true)}**) are past their close date with no near-term deals closing soon. The pipeline lacks both urgency and execution momentum.`
    : 'The pipeline currently has no deals closing within 30 days and no overdue deals — this suggests either a gap in near-term activity or deals in earlier stages that haven\'t matured.'

  const para3 = highPushDeals.length > 3
    ? `**Pipeline integrity:** **${highPushDeals.length} deals** have been pushed 3 or more times, collectively worth **${formatCurrency(highPushValue, true)}**. Chronic pushes are the clearest indicator of dead-weight pipeline — deals that inflate the forecast but never close. A pipeline scrub on these specific deals would give leadership a more accurate picture of real coverage.`
    : topStage
    ? `Pipeline composition: the largest stage concentration is **"${topStage[0]}"** at **${formatCurrency(topStage[1], true)}**. ${highPushDeals.length > 0 ? `${highPushDeals.length} deal${highPushDeals.length > 1 ? 's have' : ' has'} been pushed 3+ times — worth monitoring but not yet at critical levels.` : 'No chronic push-backs detected, suggesting reasonable timeline accuracy across the team.'}`
    : null

  const narrative = [para1, para2, para3].filter(Boolean).join('\n\n')

  const overdueHealth: 'strong' | 'moderate' | 'weak' = overdue.length === 0 ? 'strong' : overdue.length <= 3 ? 'moderate' : 'weak'
  const closingHealth: 'strong' | 'moderate' | 'weak' = closingSoon.length > 0 ? (closingSoon.length >= 5 ? 'strong' : 'moderate') : 'weak'
  const qualityHealth: 'strong' | 'moderate' | 'weak' = highPctVal >= 40 ? 'strong' : highPctVal >= 20 ? 'moderate' : 'weak'
  const pushHealth: 'strong' | 'moderate' | 'weak' = highPushDeals.length === 0 ? 'strong' : highPushDeals.length <= 5 ? 'moderate' : 'weak'

  const healthCards = [
    { label: 'Closing in 30d', value: `${closingSoon.length} deals`, health: closingHealth, detail: formatCurrency(closingSoonValue, true), icon: Target },
    { label: 'At Risk', value: overdue.length > 0 ? `${overdue.length} overdue` : 'Clear', health: overdueHealth, detail: overdue.length > 0 ? formatCurrency(overdueValue, true) : 'No overdue deals', icon: AlertTriangle },
    { label: 'High Quality Mix', value: `${highPctVal.toFixed(0)}%`, health: qualityHealth, detail: `${highPriority.length} of ${opps.length} score 80+`, icon: TrendingUp },
    { label: 'Push Risk', value: highPushDeals.length > 0 ? `${highPushDeals.length} deals` : 'Clean', health: pushHealth, detail: highPushDeals.length > 0 ? `Pushed 3+ times` : 'No chronic pushes', icon: DollarSign },
  ]

  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []
  if (overdue.length > 0) actions.push({ priority: 'high', label: `${formatCurrency(overdueValue, true)} Past Due`, action: `${overdue.length} deals are past their close date. These need immediate owner review — either update the timeline with a credible new date or reclassify as at-risk.` })
  if (highPushDeals.length > 3) actions.push({ priority: 'high', label: 'Stalled Deals', action: `${highPushDeals.length} deals have been pushed 3+ times (${formatCurrency(highPushValue, true)}). Run a pipeline scrub to determine which are genuinely closable vs. dead weight inflating the pipeline.` })
  if (closingSoon.length > 0) actions.push({ priority: 'medium', label: `${formatCurrency(closingSoonValue, true)} Closing This Month`, action: `${closingSoon.length} deals closing in the next 30 days across ${uniqueOwners} advisors. Ensure each has a clear next step and decision-maker engagement.` })
  if (lowPriority.length > opps.length * 0.4) actions.push({ priority: 'medium', label: 'Pipeline Quality', action: `${lowPriority.length} deals (${(lowPriority.length / opps.length * 100).toFixed(0)}%) score below 60, indicating weak qualification. Review whether these should remain in the active pipeline.` })
  if (highPriority.length > 0 && overdue.length === 0) actions.push({ priority: 'low', label: 'Winnable Pipeline', action: `${highPriority.length} high-scoring deals worth ${formatCurrency(highPriorityValue, true)} with no overdue risk. Focus closing resources on this cohort for near-term wins.` })

  return (
    <>
      <div className="animate-enter card-premium p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
          <div>
            <h3 className="text-[13px] font-semibold">Executive Briefing</h3>
            <p className="text-[10px] text-muted-foreground">{line} Division · Active Pipeline (current snapshot)</p>
          </div>
        </div>
        <RichNarrative text={aiNarrative ?? narrative} />
        {aiLoading && <p className="text-[10px] text-primary/50 animate-pulse mt-1">AI analyzing...</p>}
      </div>

      <div className="animate-enter stagger-1 grid grid-cols-4 gap-3">
        {healthCards.map((card) => {
          const Icon = card.icon
          const statusColor = card.health === 'strong' ? 'text-emerald-500' : card.health === 'moderate' ? 'text-amber-500' : 'text-rose-500'
          const statusBg = card.health === 'strong' ? 'bg-emerald-500/10' : card.health === 'moderate' ? 'bg-amber-500/10' : 'bg-rose-500/10'
          const statusLabel = card.health === 'strong' ? 'Strong' : card.health === 'moderate' ? 'Moderate' : 'Needs Work'
          return (
            <div key={card.label} className="card-premium relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="mb-2 flex items-center gap-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', statusBg)}><Icon className={cn('h-3.5 w-3.5', statusColor)} /></div>
                <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
              </div>
              <p className="tabular-nums text-[22px] font-bold leading-none tracking-tight">{card.value}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBg, statusColor)}>{statusLabel}</span>
                <span className="text-[10px] text-muted-foreground">{card.detail}</span>
              </div>
            </div>
          )
        })}
      </div>

      {actions.length > 0 && (
        <div className="animate-enter stagger-2 card-premium p-6">
          <h3 className="mb-4 text-[13px] font-semibold">Recommended Actions</h3>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className={cn('rounded-lg border-l-[3px] px-4 py-3', a.priority === 'high' ? 'border-l-rose-500 bg-rose-500/5' : a.priority === 'medium' ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-emerald-500 bg-emerald-500/5')}>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase', a.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : a.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500')}>
                    {a.priority === 'high' ? 'Action Needed' : a.priority === 'medium' ? 'Review' : 'Positive'}
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">{a.label}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">{a.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function DetailItem({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground/60">{label}</span>
      <span className={cn('ml-1.5 font-medium', warn ? 'text-rose-500' : 'text-foreground')}>{value}</span>
    </div>
  )
}
