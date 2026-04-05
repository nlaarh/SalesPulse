/**
 * AdvisorDashboard — Tab 3: Executive Summary
 *
 * AI narrative, health scorecard, top performers, recommended actions.
 * Contains its own AI narrative fetch (the only non-pure data fetch in tabs)
 * because the narrative endpoint is specific to this tab.
 */

import { useEffect, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchNarrative } from '@/lib/api'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import RichNarrative from '@/components/RichNarrative'
import AtRiskDeals from './AtRiskDeals'
import type { Summary, Advisor, YoYData, CloseSpeed } from './types'
import type { Insight, SlippingDeal } from '@/lib/types'
import {
  Sparkles, DollarSign, GitBranch, Target,
  AlertTriangle, Trophy, ChevronRight,
  CheckCircle2, Lightbulb, Zap, Clock,
} from 'lucide-react'

/* ── Props ────────────────────────────────────────────────────────────────── */

export interface SummaryTabProps {
  summary: Summary
  insights: Insight[]
  pipelineCoverage: number
  slipping: SlippingDeal[]
  leaders: Advisor[]
  yoy?: YoYData | null
  line?: string
  periodLabel?: string
  closeSpeed?: CloseSpeed | null
  onSelectAdvisor?: (name: string) => void
}

/* ── InsightCard (SummaryTab-only) ────────────────────────────────────────── */

function InsightCard({ insight }: { insight: Insight }) {
  const ICONS: Record<Insight['type'], React.ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />,
    danger:  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />,
    info:    <Lightbulb    className="h-4 w-4 shrink-0 text-primary" />,
  }
  const COLORS: Record<Insight['type'], string> = {
    success: 'border-l-emerald-500 bg-emerald-500/5',
    warning: 'border-l-amber-500 bg-amber-500/5',
    danger:  'border-l-rose-500 bg-rose-500/5',
    info:    'border-l-primary bg-primary/5',
  }
  return (
    <div className={cn('rounded-lg border-l-[3px] px-4 py-3', COLORS[insight.type])}>
      <div className="flex items-center gap-2">
        {ICONS[insight.type]}
        <span className="text-[12px] font-semibold">{insight.title}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{insight.text}</p>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export default function SummaryTab({
  summary, insights, pipelineCoverage, slipping, leaders,
  yoy, line, periodLabel, closeSpeed, onSelectAdvisor,
}: SummaryTabProps) {
  const { line: ctxLine, period, startDate, endDate } = useSales()
  const [aiNarrative, setAiNarrative] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    setAiNarrative(null)
    setAiGenerated(false)
    fetchNarrative('advisor', ctxLine, period, startDate, endDate)
      .then(r => { if (r.narrative) { setAiNarrative(r.narrative); setAiGenerated(true) } })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [ctxLine, period, startDate, endDate])

  const billedValue = summary.bookings
  const totalAtRisk = slipping.reduce((sum, d) => sum + d.amount, 0)
  const top3 = leaders.slice(0, 3)
  const top1 = leaders[0]
  const divLine = line ?? 'Division'

  // Build VP-level executive narrative from real data
  const pct = summary.bookings_yoy_pct
  const pctText = pct > 0.5 ? `up ${pct.toFixed(1)}%`
    : pct < -0.5 ? `down ${Math.abs(pct).toFixed(1)}%`
    : 'approximately flat'
  const topShare = top1 && billedValue > 0 ? Math.round(top1.bookings / billedValue * 100) : 0

  // Paragraph 1: Where we stand
  const periodText = periodLabel ? `over ${periodLabel.toLowerCase()}` : 'this period'
  const para1 = `The ${divLine} Division billed **${formatCurrency(billedValue, true)}** ${periodText}, **${pctText}** year-over-year${summary.bookings_prev > 0 ? ` (prior year: ${formatCurrency(summary.bookings_prev, true)})` : ''}. The team closed **${formatNumber(summary.deals)} deals** at a **${formatPct(summary.win_rate)} win rate** with an average deal size of **${formatCurrency(summary.avg_deal_size, true)}**.`

  // Paragraph 2: Pipeline outlook
  const para2 = pipelineCoverage >= 2
    ? `**Pipeline health is strong.** We have **${formatCurrency(summary.pipeline_value, true)}** in open pipeline (${formatNumber(summary.pipeline_count)} deals), providing **${pipelineCoverage.toFixed(1)}x coverage** against annualized bookings. This gives the team a healthy buffer to absorb normal deal attrition and still meet targets.`
    : pipelineCoverage >= 1
    ? `**Pipeline coverage is moderate** at **${pipelineCoverage.toFixed(1)}x** (${formatCurrency(summary.pipeline_value, true)} across ${formatNumber(summary.pipeline_count)} deals). The standard benchmark is 2x \u2014 the team should increase prospecting activity to build a stronger buffer against deal slippage.`
    : `**Pipeline coverage is critically low** at **${pipelineCoverage.toFixed(1)}x** (${formatCurrency(summary.pipeline_value, true)} across ${formatNumber(summary.pipeline_count)} deals). Without immediate pipeline build, near-term revenue targets are at risk. This requires urgent attention from leadership.`

  // Paragraph 3: Biggest opportunity / risk
  const riskPara = slipping.length > 0
    ? `The biggest near-term risk is **${slipping.length} deal${slipping.length > 1 ? 's' : ''}** totaling **${formatCurrency(totalAtRisk, true)}** that have passed their expected close date. These need immediate owner follow-up with updated timelines. ${slipping.filter(d => d.days_overdue >= 90).length > 0 ? `Of these, **${slipping.filter(d => d.days_overdue >= 90).length} are 90+ days overdue** and likely need to be reclassified or closed out.` : ''}`
    : 'On the risk side, the pipeline is clean \u2014 no deals are currently past their close date, which reflects good deal hygiene across the team.'

  const oppPara = top1 && topShare > 10
    ? `On the opportunity side, our top performer **${top1.name}** contributed **${formatCurrency(top1.bookings, true)}** (${topShare}% of total). ${leaders.length > 10 ? `With ${leaders.length} active advisors, there is significant room to raise the middle of the pack \u2014 even a 10% improvement from the next 5 advisors would meaningfully impact division totals.` : `Documenting and sharing their approach with the broader team could elevate overall performance.`}`
    : leaders.length > 0 ? `Revenue is well-distributed across the team, with no single advisor dominating \u2014 a healthy sign of team depth and resilience.` : ''

  // Paragraph: Close speed
  const agents = closeSpeed?.agents ?? []
  const teamAvgDays = closeSpeed?.avg_days ?? 0
  const teamMedianDays = closeSpeed?.median_days ?? 0
  const fastest = agents.length > 0 ? agents[0] : null
  const slowest = agents.length > 1 ? agents[agents.length - 1] : null
  const speedPara = teamAvgDays > 0
    ? `Deal velocity across the team averages **${teamAvgDays} days** from opportunity creation to close (median **${teamMedianDays} days**).${fastest && slowest && fastest.name !== slowest.name ? ` The fastest closer is **${fastest.name}** at **${fastest.avg_days} days** avg, while **${slowest.name}** averages **${slowest.avg_days} days**.${slowest.avg_days > teamAvgDays * 2 ? ' This gap suggests coaching opportunities to improve deal progression for slower closers.' : ''}` : ''}`
    : ''

  const narrative = [para1, para2, riskPara, speedPara, oppPara].filter(Boolean).join('\n\n')

  // Build recommended actions from data signals
  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []
  if (slipping.length > 0) {
    actions.push({
      priority: 'high',
      label: 'At-Risk Deals',
      action: `Follow up on ${slipping.length} overdue deal${slipping.length > 1 ? 's' : ''} (${formatCurrency(totalAtRisk, true)}) \u2014 assign owners and require status update this week.`,
    })
  }
  if (pipelineCoverage < 1.5) {
    actions.push({
      priority: 'high',
      label: 'Pipeline Build',
      action: `Coverage at ${pipelineCoverage.toFixed(1)}x is below the 2x target. Schedule a prospecting push for all advisors immediately.`,
    })
  }
  if (summary.win_rate < 40) {
    actions.push({
      priority: 'medium',
      label: 'Win Rate',
      action: `Win rate at ${formatPct(summary.win_rate)} is below the 40% benchmark. Identify qualification gaps and schedule structured coaching.`,
    })
  }
  for (const ins of insights) {
    if (ins.type === 'warning' && ins.title === 'Coaching Needed') {
      actions.push({ priority: 'medium', label: 'Coaching', action: ins.text })
      break
    }
  }
  for (const ins of insights) {
    if ((ins.type === 'danger' || ins.type === 'warning') && ins.title === 'Pipeline Alert') {
      actions.push({ priority: 'high', label: 'Pipeline Alert', action: ins.text })
      break
    }
  }
  if (top1 && topShare >= 10) {
    actions.push({
      priority: 'low',
      label: 'Best Practices',
      action: `Recognize ${top1.name}'s performance. Document their sales approach and share best practices with the broader team.`,
    })
  }

  const pipelineHealth = pipelineCoverage >= 2 ? 'strong' : pipelineCoverage >= 1 ? 'moderate' : 'weak'
  const winRateHealth  = summary.win_rate >= 55 ? 'strong' : summary.win_rate >= 40 ? 'moderate' : 'weak'
  const riskHealth     = slipping.length === 0 ? 'strong' : slipping.length <= 5 ? 'moderate' : 'weak'
  const speedHealth    = teamAvgDays === 0 ? 'moderate' as const : teamAvgDays <= 30 ? 'strong' as const : teamAvgDays <= 60 ? 'moderate' as const : 'weak' as const

  return (
    <>
      {/* Executive Narrative */}
      <div className="animate-enter card-premium p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Executive Briefing</h3>
            <p className="text-[10px] text-muted-foreground">{divLine} Division &middot; {periodLabel ?? 'Performance Summary'}</p>
          </div>
          {yoy && (
            <div className="ml-auto rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-muted-foreground">
              {yoy.current_year} vs {yoy.prior_year}
            </div>
          )}
        </div>
        <RichNarrative text={aiNarrative ?? narrative} aiGenerated={aiGenerated} />
        {aiLoading && <p className="text-[10px] text-primary/50 animate-pulse mt-1">AI analyzing...</p>}
      </div>

      {/* Health Scorecard */}
      <div className="animate-enter stagger-1 grid grid-cols-5 gap-3">
        {[
          { label: 'Billed Revenue',    value: formatCurrency(billedValue, true), status: billedValue > 0 ? 'Active' : 'No Data', health: 'strong' as const, detail: `${formatNumber(summary.deals)} won deals`,                               icon: DollarSign, tip: TIPS.billedRevenue },
          { label: 'Pipeline Coverage', value: `${pipelineCoverage.toFixed(1)}x`,  status: pipelineHealth === 'strong' ? 'Strong' : pipelineHealth === 'moderate' ? 'Moderate' : 'Weak',    health: pipelineHealth,                detail: `${formatCurrency(summary.pipeline_value, true)} in pipeline`, icon: GitBranch,  tip: TIPS.pipelineCoverage },
          { label: 'Win Rate',          value: formatPct(summary.win_rate),         status: winRateHealth === 'strong' ? 'Strong' : winRateHealth === 'moderate' ? 'Moderate' : 'Needs Work', health: winRateHealth,                 detail: `${leaders.length} active advisors`,                           icon: Target,     tip: TIPS.winRate },
          { label: 'Close Speed',       value: teamAvgDays > 0 ? `${teamAvgDays}d` : '\u2014',  status: speedHealth === 'strong' ? 'Fast' : speedHealth === 'moderate' ? 'Average' : 'Slow',  health: speedHealth, detail: teamMedianDays > 0 ? `Median ${teamMedianDays}d \u00b7 ${agents.length} agents` : 'No data', icon: Clock, tip: 'Average days from opportunity creation to close. Lower is better \u2014 fast closers keep pipeline flowing.' },
          { label: 'Deal Risk',         value: slipping.length > 0 ? `${slipping.length} deals` : 'Clear', status: riskHealth === 'strong' ? 'Low Risk' : riskHealth === 'moderate' ? 'Monitor' : 'High Risk', health: riskHealth, detail: slipping.length > 0 ? `${formatCurrency(totalAtRisk, true)} at risk` : 'No slipping deals', icon: AlertTriangle, tip: TIPS.atRisk },
        ].map((card) => {
          const Icon = card.icon
          const statusColor = card.health === 'strong' ? 'text-emerald-500' : card.health === 'moderate' ? 'text-amber-500' : 'text-rose-500'
          return (
            <div key={card.label} className="card-premium relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">{card.label}<Tip text={card.tip} /></span>
                <Icon className="h-4 w-4 text-muted-foreground/30" />
              </div>
              <p className="mt-2 tabular-nums text-[24px] font-bold leading-none tracking-tight">{card.value}</p>
              <span className={cn('mt-2 block text-[11px] font-semibold', statusColor)}>{card.status}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground/50">{card.detail}</span>
            </div>
          )
        })}
      </div>

      {/* Top Performers + At-Risk */}
      <div className="animate-enter stagger-2 grid grid-cols-2 gap-3">
        {/* Top 3 Performers */}
        <div className="card-premium p-5">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Top Performers</h3>
          </div>
          {top3.length > 0 ? (
            <div className="space-y-3">
              {top3.map((a, i) => {
                const share = billedValue > 0 ? (a.bookings / billedValue * 100) : 0
                const medalColor = i === 0 ? 'text-amber-500 bg-amber-500/10' : i === 1 ? 'text-slate-400 bg-slate-400/10' : 'text-orange-500 bg-orange-500/10'
                return (
                  <div
                    key={a.name}
                    onClick={() => onSelectAdvisor?.(a.name)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors',
                      onSelectAdvisor && 'cursor-pointer hover:bg-primary/5',
                    )}
                  >
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold', medalColor)}>
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-[12px] font-semibold', onSelectAdvisor && 'text-primary')}>{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatNumber(a.deals)} deals &middot; {formatPct(a.win_rate)} win rate
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-[13px] font-bold">{formatCurrency(a.bookings, true)}</p>
                      <p className="text-[10px] text-muted-foreground">{share.toFixed(0)}% of total</p>
                    </div>
                    {onSelectAdvisor && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-[12px] text-muted-foreground">No advisor data available</p>
          )}
        </div>

        {/* At-Risk Deals */}
        <div className="card-premium p-5">
          <AtRiskDeals deals={slipping} onSelectAdvisor={onSelectAdvisor} />
        </div>
      </div>

      {/* AI Insights */}
      <div className="animate-enter stagger-3 card-premium p-5">
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Insights & Analysis</h3>
        </div>
        {insights.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
          </div>
        ) : (
          <p className="py-8 text-center text-[13px] text-muted-foreground">No insights available for this period.</p>
        )}
      </div>

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="animate-enter stagger-4 card-premium p-5">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h3 className="text-base font-semibold">Recommended Actions</h3>
          </div>
          <div className="space-y-2.5">
            {actions.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/30 bg-secondary/10 px-4 py-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                    item.priority === 'high'   ? 'bg-rose-500/10 text-rose-500'
                      : item.priority === 'medium' ? 'bg-amber-500/10 text-amber-500'
                      : 'bg-secondary text-muted-foreground',
                  )}>
                    {item.priority}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">{item.label}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-foreground/80">{item.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
