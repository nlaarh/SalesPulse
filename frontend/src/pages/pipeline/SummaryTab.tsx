import { useEffect, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchNarrative } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import RichNarrative from '@/components/RichNarrative'
import { Sparkles, GitBranch, Target, Shield, DollarSign } from 'lucide-react'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface SummaryTabProps {
  totalPipeline: number
  totalDeals: number
  slipping: any
  stages: any
  forecast: any
  line: string
  periodLabel: string
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function SummaryTab({ totalPipeline, totalDeals, slipping, stages, forecast, line, periodLabel }: SummaryTabProps) {
  const { line: ctxLine, period, startDate, endDate } = useSales()
  const [aiNarrative, setAiNarrative] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    setAiNarrative(null)
    setAiGenerated(false)
    fetchNarrative('pipeline', ctxLine, period, startDate, endDate)
      .then(r => { if (r.narrative) { setAiNarrative(r.narrative); setAiGenerated(true) } })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [ctxLine, period, startDate, endDate])

  const totalAtRisk = slipping?.deals?.reduce((s: number, d: any) => s + (d.amount || 0), 0) ?? 0
  const overdueCount = slipping?.count ?? 0
  const riskPct = totalPipeline > 0 ? (totalAtRisk / totalPipeline * 100) : 0

  // Monthly trend analysis
  const months = forecast?.months ?? []
  const recentMonths = months.slice(-3)
  const priorMonths = months.slice(-6, -3)
  const avgCloseRate = recentMonths.length > 0
    ? recentMonths.reduce((s: number, m: any) => s + (m.close_rate || 0), 0) / recentMonths.length
    : 0
  const priorCloseRate = priorMonths.length > 0
    ? priorMonths.reduce((s: number, m: any) => s + (m.close_rate || 0), 0) / priorMonths.length
    : 0
  const totalWonRecent = recentMonths.reduce((s: number, m: any) => s + (m.won_revenue || 0), 0)
  const totalWonPrior = priorMonths.reduce((s: number, m: any) => s + (m.won_revenue || 0), 0)
  const wonTrend = totalWonPrior > 0 ? ((totalWonRecent - totalWonPrior) / totalWonPrior * 100) : 0

  // Stage analysis
  const stageList = stages?.stages ?? []
  const topStage = stageList.reduce((best: any, s: any) => (!best || s.amount > best.amount) ? s : best, null)
  const earlyStages = stageList.filter((s: any) => ['Prospecting', 'Qualification', 'Needs Analysis'].includes(s.stage))
  const lateStages = stageList.filter((s: any) => ['Proposal', 'Negotiation', 'Invoice', 'Closed Won'].some((ls) => (s.stage as string).includes(ls)))
  const earlyValue = earlyStages.reduce((s: number, st: any) => s + (st.amount || 0), 0)
  const lateValue = lateStages.reduce((s: number, st: any) => s + (st.amount || 0), 0)
  const earlyPct = totalPipeline > 0 ? (earlyValue / totalPipeline * 100) : 0

  // Severely overdue (90+ days)
  const severeOverdue = slipping?.deals?.filter((d: any) => (d.days_overdue ?? 0) >= 90) ?? []
  const severeValue = severeOverdue.reduce((s: number, d: any) => s + (d.amount || 0), 0)

  // VP-level narrative
  const avgDeal = totalDeals > 0 ? totalPipeline / totalDeals : 0

  const para1 = `The ${line} Division currently holds **${formatCurrency(totalPipeline, true)}** in active pipeline across **${formatNumber(totalDeals)} deals**, with an average deal size of **${formatCurrency(avgDeal, true)}**. ${recentMonths.length > 0 ? `Over the recent period (${periodLabel.toLowerCase()}), the team converted **${formatCurrency(totalWonRecent, true)}** in won revenue at a **${avgCloseRate.toFixed(1)}% close rate**${wonTrend !== 0 ? ` — **${wonTrend > 0 ? 'up' : 'down'} ${Math.abs(wonTrend).toFixed(0)}%** compared to the prior period` : ''}.` : ''}`

  const para2 = earlyPct > 60
    ? `**Pipeline composition is a concern:** **${earlyPct.toFixed(0)}%** of value sits in early stages (Prospecting, Qualification, Needs Analysis), meaning near-term revenue depends on a small portion of closable deals. The team needs to accelerate progression of early-stage deals through better qualification and more structured follow-up cadences.`
    : lateValue > earlyValue
    ? `**Pipeline maturity looks favorable** — the majority of value is in later stages, indicating a healthy volume of near-term closable deals. ${topStage ? `The largest concentration is in **${topStage.stage}** at **${formatCurrency(topStage.amount, true)}** (${topStage.count} deals).` : ''}`
    : `**Pipeline is balanced** across early and late stages, providing both near-term closing opportunities and a developing bench for the next quarter.`

  const para3 = overdueCount > 0
    ? `The biggest risk to pipeline accuracy is **${overdueCount} deal${overdueCount > 1 ? 's' : ''}** totaling **${formatCurrency(totalAtRisk, true)}** (${riskPct.toFixed(0)}% of pipeline) that have passed their expected close date. ${severeOverdue.length > 0 ? `Of these, **${severeOverdue.length} are 90+ days overdue** (${formatCurrency(severeValue, true)}) and are likely dead — these should be scrubbed from the pipeline to maintain forecast accuracy. ` : ''}Each owner needs to provide updated close dates with justification, or the deals should be reclassified.`
    : '**Pipeline hygiene is strong** — no deals are currently past their close date. This reflects good discipline around close date management and deal updates across the team.'

  const para4 = avgCloseRate < 25 && recentMonths.length > 0
    ? `**Close rate at ${avgCloseRate.toFixed(1)}%** is well below healthy benchmarks (35-40%). This suggests either a qualification problem — unready deals entering the pipeline — or an execution issue where deals stall in later stages. A win/loss analysis of recent closed deals would clarify the root cause.`
    : avgCloseRate >= 40 && wonTrend > 0
    ? `**The team is executing well** with a strong close rate and improving quarterly trajectory. The focus now should be on pipeline replenishment — high close rates can mask declining pipeline volume if new deal creation doesn't keep pace.`
    : null

  const narrative = [para1, para2, para3, para4].filter(Boolean).join('\n\n')

  // Health indicators
  type Health = 'strong' | 'moderate' | 'weak'
  const wonTrendHealth: Health = wonTrend > 5 ? 'strong' : wonTrend > -10 ? 'moderate' : 'weak'
  const closeRateHealth: Health = avgCloseRate >= 40 ? 'strong' : avgCloseRate >= 25 ? 'moderate' : 'weak'
  const riskHealth: Health = overdueCount === 0 ? 'strong' : riskPct <= 10 ? 'moderate' : 'weak'
  const maturityHealth: Health = earlyPct <= 40 ? 'strong' : earlyPct <= 60 ? 'moderate' : 'weak'

  const healthCards = [
    { label: 'Won Revenue (QoQ)', value: `${wonTrend > 0 ? '+' : ''}${wonTrend.toFixed(0)}%`, health: wonTrendHealth, detail: `${formatCurrency(totalWonRecent, true)} last 3mo`, icon: GitBranch, tip: TIPS.activePipeline },
    { label: 'Close Rate', value: `${avgCloseRate.toFixed(1)}%`, health: closeRateHealth, detail: priorCloseRate > 0 ? `${priorCloseRate > avgCloseRate ? 'down' : 'up'} from ${priorCloseRate.toFixed(1)}%` : '3-month average', icon: Target, tip: TIPS.closeRate },
    { label: 'Pipeline Risk', value: overdueCount > 0 ? `${riskPct.toFixed(0)}%` : 'Clean', health: riskHealth, detail: overdueCount > 0 ? `${overdueCount} deals (${formatCurrency(totalAtRisk, true)})` : 'No overdue deals', icon: Shield, tip: TIPS.pastDue },
    { label: 'Pipeline Maturity', value: earlyPct <= 40 ? 'Closable' : earlyPct <= 60 ? 'Mixed' : 'Early', health: maturityHealth, detail: `${earlyPct.toFixed(0)}% in early stages`, icon: DollarSign, tip: TIPS.avgDealValue },
  ]

  // Actions
  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []
  if (severeOverdue.length > 0) actions.push({ priority: 'high', label: `${formatCurrency(severeValue, true)} Severely Overdue`, action: `${severeOverdue.length} deals are 90+ days past close date. These are likely dead — run a pipeline scrub and either reclassify or close them out. Keeping them inflates pipeline reporting.` })
  else if (overdueCount > 0) actions.push({ priority: 'high', label: `${formatCurrency(totalAtRisk, true)} Past Due`, action: `${overdueCount} deals have missed their close date (${riskPct.toFixed(0)}% of pipeline). Require each owner to provide updated close dates with justification this week.` })
  if (avgCloseRate < 25 && recentMonths.length > 0) actions.push({ priority: 'high', label: `${avgCloseRate.toFixed(1)}% Close Rate`, action: `Close rate is significantly below healthy benchmarks. Review deal qualification standards — the team may be advancing unqualified deals into the pipeline.` })
  if (wonTrend < -15 && priorMonths.length > 0) actions.push({ priority: 'high', label: 'Revenue Decline', action: `Won revenue dropped ${Math.abs(wonTrend).toFixed(0)}% quarter-over-quarter. Investigate: is this a pipeline supply issue (not enough deals) or a conversion issue (deals not closing)?` })
  if (earlyPct > 60) actions.push({ priority: 'medium', label: 'Early-Stage Heavy', action: `${earlyPct.toFixed(0)}% of pipeline is in early stages. Near-term revenue may be thin — accelerate deal progression and ensure proper qualification before advancing.` })
  if (overdueCount === 0 && avgCloseRate >= 35) actions.push({ priority: 'low', label: 'Healthy Pipeline', action: `Pipeline hygiene is strong with a ${avgCloseRate.toFixed(1)}% close rate and no overdue deals. Focus on maintaining deal velocity and filling the top of the funnel.` })
  if (wonTrend > 15) actions.push({ priority: 'low', label: 'Closing Momentum', action: `Won revenue grew ${wonTrend.toFixed(0)}% QoQ. The team is converting well — ensure pipeline replenishment keeps pace with closings.` })

  return (
    <>
      {/* Narrative */}
      <div className="animate-enter card-premium p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Executive Briefing</h3>
            <p className="text-[10px] text-muted-foreground">{line} Division · {periodLabel}</p>
          </div>
        </div>
        <RichNarrative text={aiNarrative ?? narrative} aiGenerated={aiGenerated} />
        {aiLoading && <p className="text-[10px] text-primary/50 animate-pulse mt-1">AI analyzing...</p>}
      </div>

      {/* Health Scorecard */}
      <div className="animate-enter stagger-1 grid grid-cols-4 gap-3">
        {healthCards.map((card) => {
          const Icon = card.icon
          const statusColor = card.health === 'strong' ? 'text-emerald-500' : card.health === 'moderate' ? 'text-amber-500' : 'text-rose-500'
          const statusBg = card.health === 'strong' ? 'bg-emerald-500/10' : card.health === 'moderate' ? 'bg-amber-500/10' : 'bg-rose-500/10'
          const statusLabel = card.health === 'strong' ? 'Strong' : card.health === 'moderate' ? 'Moderate' : 'Needs Work'
          return (
            <div key={card.label} className="card-premium relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', statusBg)}>
                    <Icon className={cn('h-3.5 w-3.5', statusColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
                  {card.tip && <Tip text={card.tip} />}
                </div>
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

      {/* Recommended Actions */}
      {actions.length > 0 && (
        <div className="animate-enter stagger-2 card-premium p-6">
          <h3 className="mb-4 text-[13px] font-semibold">Recommended Actions</h3>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border-l-[3px] px-4 py-3',
                  a.priority === 'high' ? 'border-l-rose-500 bg-rose-500/5' :
                  a.priority === 'medium' ? 'border-l-amber-500 bg-amber-500/5' :
                  'border-l-emerald-500 bg-emerald-500/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase',
                    a.priority === 'high' ? 'bg-rose-500/10 text-rose-500' :
                    a.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-emerald-500/10 text-emerald-500',
                  )}>
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
