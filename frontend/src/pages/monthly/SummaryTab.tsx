import { useEffect, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchNarrative } from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { fmtMonth } from '@/lib/formatters'
import RichNarrative from '@/components/RichNarrative'
import { Sparkles, TrendingUp, Target, DollarSign, Users } from 'lucide-react'
import type { AgentReport, Metric } from './types'
import { METRICS } from './types'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface SummaryTabProps {
  agents: AgentReport[]
  monthColumns: string[]
  divTotals: Record<string, number>
  metric: Metric
  line: string
  periodLabel: string
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function SummaryTab({ agents, monthColumns, divTotals, metric, line, periodLabel }: SummaryTabProps) {
  const { line: ctxLine, period, startDate, endDate } = useSales()
  const [aiNarrative, setAiNarrative] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    setAiNarrative(null)
    fetchNarrative('monthly', ctxLine, period, startDate, endDate)
      .then(r => { if (r.narrative) setAiNarrative(r.narrative) })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [ctxLine, period, startDate, endDate])

  const isCurrency = metric === 'commission' || metric === 'sales'
  const totalVal = divTotals[metric] || 0
  const avgPerAgent = agents.length > 0 ? totalVal / agents.length : 0
  const topAgents = [...agents].sort((a, b) => ((b.totals[metric] || 0) as number) - ((a.totals[metric] || 0) as number))
  const metricLabel = METRICS.find(m => m.key === metric)?.label ?? metric

  // Cross-metric totals
  const totalOpps     = divTotals.opps || 0
  const totalLeads    = divTotals.leads || 0
  const totalInvoiced = divTotals.invoiced || 0
  const totalSales    = divTotals.sales || 0
  const totalComm     = divTotals.commission || 0

  // Derived cross-metric rates
  const leadToOppRate   = totalLeads > 0 ? (totalOpps / totalLeads * 100) : 0
  const oppToInvRate    = totalOpps > 0 ? (totalInvoiced / totalOpps * 100) : 0
  const avgDealSize     = totalInvoiced > 0 ? totalSales / totalInvoiced : 0
  const revenuePerOpp   = totalOpps > 0 ? totalSales / totalOpps : 0
  const revenuePerLead  = totalLeads > 0 ? totalSales / totalLeads : 0

  // Trend: compare last 3 months vs prior 3
  const recent3 = monthColumns.slice(-3)
  const prior3 = monthColumns.slice(-6, -3)
  const sumMetricPeriod = (months: string[], m: Metric) => months.reduce((s, mo) =>
    s + agents.reduce((sum, a) => {
      const md = a.months.find(mm => mm.month === mo)
      return sum + (md ? (md[m] as number) || 0 : 0)
    }, 0), 0)
  const recentSum = sumMetricPeriod(recent3, metric)
  const priorSum = sumMetricPeriod(prior3, metric)
  const trendPct = priorSum > 0 ? ((recentSum - priorSum) / priorSum * 100) : 0

  // Cross-metric trends
  const recentSales = sumMetricPeriod(recent3, 'sales')
  const priorSales = sumMetricPeriod(prior3, 'sales')
  const salesTrendPct = priorSales > 0 ? ((recentSales - priorSales) / priorSales * 100) : 0
  const recentOpps = sumMetricPeriod(recent3, 'opps')
  const priorOpps = sumMetricPeriod(prior3, 'opps')
  const oppsTrendPct = priorOpps > 0 ? ((recentOpps - priorOpps) / priorOpps * 100) : 0
  const recentInv = sumMetricPeriod(recent3, 'invoiced')
  const priorInv = sumMetricPeriod(prior3, 'invoiced')
  const invTrendPct = priorInv > 0 ? ((recentInv - priorInv) / priorInv * 100) : 0

  const fmtVal = (v: number) => isCurrency ? formatCurrency(v, true) : formatNumber(Math.round(v))

  // Concentration: top 3 share
  const top3Val = topAgents.slice(0, 3).reduce((s, a) => s + ((a.totals[metric] || 0) as number), 0)
  const top3Pct = totalVal > 0 ? (top3Val / totalVal * 100) : 0

  // Team breadth
  const aboveAvgCount = agents.filter(a => ((a.totals[metric] || 0) as number) > avgPerAgent).length
  const aboveAvgPct = agents.length > 0 ? (aboveAvgCount / agents.length * 100) : 0

  // Latest month momentum vs rolling average
  const latestMonth = monthColumns.at(-1)
  const latestVal = latestMonth ? agents.reduce((s, a) => {
    const md = a.months.find(m => m.month === latestMonth)
    return s + (md ? (md[metric] as number) || 0 : 0)
  }, 0) : 0
  const rollingAvg = monthColumns.length > 1
    ? (totalVal - latestVal) / (monthColumns.length - 1)
    : totalVal
  const latestVsAvg = rollingAvg > 0 ? ((latestVal - rollingAvg) / rollingAvg * 100) : 0

  // Median advisor production
  const allTotals = agents.map(a => (a.totals[metric] || 0) as number).sort((a, b) => a - b)
  const median = allTotals.length > 0 ? allTotals[Math.floor(allTotals.length / 2)] : 0
  const topVsMedian = median > 0 ? ((topAgents[0]?.totals[metric] || 0) as number) / median : 0

  // Name-based context
  const top1 = topAgents[0]
  const top2 = topAgents[1]
  const top1Val = top1 ? ((top1.totals[metric] || 0) as number) : 0
  const top1Name = top1?.name?.split(' ')[0] ?? ''
  const qoqWord = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat'

  // Build narrative
  const { narrative, healthCards, actions } = buildNarrative({
    metric, isCurrency, totalVal, avgPerAgent, topAgents, metricLabel,
    totalOpps, totalLeads, totalInvoiced, totalSales, totalComm,
    leadToOppRate, oppToInvRate, avgDealSize, revenuePerOpp, revenuePerLead,
    recent3, prior3, recentSum, priorSum, trendPct,
    salesTrendPct, oppsTrendPct, invTrendPct,
    fmtVal, top3Val, top3Pct, aboveAvgCount, aboveAvgPct,
    latestMonth, latestVal, latestVsAvg, topVsMedian,
    top1, top2, top1Val, top1Name, qoqWord,
    periodLabel, line, agents,
  })

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
            <p className="text-[10px] text-muted-foreground">{line} Division · {periodLabel} · {metricLabel}</p>
          </div>
        </div>
        <RichNarrative text={aiNarrative ?? narrative} />
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

/* ════════════════════════════════════════════════════════════════════════════
   Narrative + health + actions builder (pure logic, no JSX)
   ════════════════════════════════════════════════════════════════════════════ */

type Health = 'strong' | 'moderate' | 'weak'

interface NarrativeInput {
  metric: Metric; isCurrency: boolean; totalVal: number; avgPerAgent: number
  topAgents: AgentReport[]; metricLabel: string
  totalOpps: number; totalLeads: number; totalInvoiced: number; totalSales: number; totalComm: number
  leadToOppRate: number; oppToInvRate: number; avgDealSize: number; revenuePerOpp: number; revenuePerLead: number
  recent3: string[]; prior3: string[]; recentSum: number; priorSum: number; trendPct: number
  salesTrendPct: number; oppsTrendPct: number; invTrendPct: number
  fmtVal: (v: number) => string; top3Val: number; top3Pct: number
  aboveAvgCount: number; aboveAvgPct: number
  latestMonth: string | undefined; latestVal: number; latestVsAvg: number; topVsMedian: number
  top1: AgentReport | undefined; top2: AgentReport | undefined; top1Val: number; top1Name: string; qoqWord: string
  periodLabel: string; line: string; agents: AgentReport[]
}

function buildNarrative(p: NarrativeInput) {
  const {
    metric, totalVal, avgPerAgent, metricLabel,
    totalOpps, totalLeads, totalInvoiced, totalSales, totalComm,
    leadToOppRate, oppToInvRate, avgDealSize, revenuePerOpp, revenuePerLead,
    prior3, recentSum, priorSum, trendPct,
    salesTrendPct, oppsTrendPct, invTrendPct,
    fmtVal, top3Val, top3Pct, aboveAvgCount, aboveAvgPct,
    latestMonth, latestVal, latestVsAvg, topVsMedian,
    top1, top2, top1Val, top1Name, qoqWord,
    periodLabel, line, agents,
  } = p

  let para1 = '', para2 = '', para3 = ''

  if (metric === 'opps') {
    const verdict = trendPct > 5 ? '**Pipeline generation is healthy.**'
      : trendPct < -10 ? '**Pipeline generation is slowing** — this will hit revenue in 2-3 months.'
      : '**Pipeline generation is steady** but not accelerating.'
    para1 = `${verdict} The team created **${formatNumber(totalOpps)} opportunities** over ${periodLabel.toLowerCase()}${prior3.length > 0 ? ` (**${qoqWord} ${Math.abs(trendPct).toFixed(0)}%** QoQ)` : ''}.${totalInvoiced > 0 ? ` **${oppToInvRate.toFixed(0)}%** converted to invoice — ${oppToInvRate >= 30 ? 'strong' : oppToInvRate < 15 ? 'a red flag' : 'moderate'}. ` : ' '}${totalSales > 0 ? `Revenue yield: **${formatCurrency(revenuePerOpp, true)}** per opp.` : ''}`
    para2 = oppsTrendPct > 5 && salesTrendPct < -5
      ? `**Warning:** more opps (+${oppsTrendPct.toFixed(0)}%) but less revenue (${salesTrendPct.toFixed(0)}%). The team is creating lower-quality opportunities. Fix: shift focus from volume to qualification.`
      : `${top1 ? `**${top1.name}** leads with **${formatNumber(top1Val)}** opps.` : ''} ${top3Pct > 40 ? `Top 3 generate **${top3Pct.toFixed(0)}%** of all opps — concentration risk.` : `Well-distributed across ${agents.length} advisors.`}${totalInvoiced > 0 && oppToInvRate < 15 ? ` Only **${oppToInvRate.toFixed(0)}%** of opps reach invoice — deals are dying mid-pipeline. Review stage requirements.` : ''}`
    para3 = latestMonth && latestVsAvg < -15
      ? `**Urgent:** ${fmtMonth(latestMonth)} dropped **${Math.abs(latestVsAvg).toFixed(0)}%** below average. Fewer opps now = less revenue in Q2. Schedule a pipeline push this week.`
      : latestMonth && latestVsAvg > 15 ? `${fmtMonth(latestMonth)} was strong (**+${latestVsAvg.toFixed(0)}%**). Verify these are qualified opps, not volume padding.`
      : ''
  } else if (metric === 'leads') {
    const convVerdict = leadToOppRate >= 40 ? '**Quality is strong**' : leadToOppRate >= 20 ? 'Quality is acceptable' : '**Too many leads are dying** before becoming opportunities'
    para1 = `**${formatNumber(totalLeads)} leads** captured over ${periodLabel.toLowerCase()}${prior3.length > 0 ? ` (**${qoqWord} ${Math.abs(trendPct).toFixed(0)}%** QoQ)` : ''}. ${convVerdict} — **${leadToOppRate.toFixed(0)}%** convert to opportunities.${totalSales > 0 ? ` Each lead ultimately produces **${formatCurrency(revenuePerLead, true)}** in bookings.` : ''}`
    para2 = leadToOppRate < 20 && totalLeads > 50
      ? `**The funnel is leaking:** less than 1 in 5 leads converts. Either lead sources are poor or qualification is too lax. Review which channels produce leads that actually close.`
      : `${top1 ? `**${top1.name}** leads with **${formatNumber(top1Val)}**.` : ''} ${top3Pct > 40 ? `Top 3 drive **${top3Pct.toFixed(0)}%** — lead gen is concentrated in few advisors. Get the broader team prospecting.` : `Lead generation is well-distributed across the team.`}`
    para3 = latestMonth && latestVsAvg < -15
      ? `**Warning:** ${fmtMonth(latestMonth)} leads dropped **${Math.abs(latestVsAvg).toFixed(0)}%** below average. This is an early signal — less lead flow now means fewer deals 2-3 months out.`
      : ''
  } else if (metric === 'commission') {
    const commRate = totalSales > 0 ? (totalComm / totalSales * 100) : 0
    const commPerDeal = totalInvoiced > 0 ? totalComm / totalInvoiced : 0
    const verdict = trendPct > 5 ? '**Commission earnings are growing.**'
      : trendPct < -10 ? '**Commission earnings are declining** — investigate immediately.'
      : commRate < 6 ? '**Commission rate appears low** — verify for processing delays.'
      : 'Commission earnings are tracking in line with bookings.'
    para1 = `${verdict} The ${line} Division earned **${formatCurrency(totalComm, true)}** on **${formatCurrency(totalSales, true)}** in bookings (**${commRate.toFixed(1)}%** rate)${prior3.length > 0 ? `, **${qoqWord} ${Math.abs(trendPct).toFixed(0)}%** QoQ` : ''}.${commPerDeal > 0 ? ` Average commission per deal: **${formatCurrency(commPerDeal, true)}**.` : ''}`
    para2 = `${top1 ? `Top earner: **${top1.name}** at **${formatCurrency(top1Val, true)}**${top2 ? `, followed by **${top2.name}** at **${formatCurrency((top2.totals[metric] || 0) as number, true)}**` : ''}.` : ''} ${topVsMedian > 5 ? `The top earner makes **${topVsMedian.toFixed(0)}x the median** — investigate whether this reflects territory advantage or skill gap.` : ''} ${top3Pct > 40 ? `**Risk:** top 3 earn **${top3Pct.toFixed(0)}%** of all commission. Losing any one of them significantly impacts the division.` : `Earnings are well-distributed (top 3 at ${top3Pct.toFixed(0)}%) — healthy team depth.`}`
    para3 = `**Important:** commission data lags bookings by 2-3 months. Recent months (especially ${latestMonth ? fmtMonth(latestMonth) : 'the latest'}) may be incomplete — do not make staffing or comp decisions based on partial data.${latestMonth && latestVsAvg < -30 ? ` The sharp drop in ${fmtMonth(latestMonth)} (**${formatCurrency(latestVal, true)}**) is almost certainly a lag artifact, not a real decline.` : ''}`
  } else if (metric === 'sales') {
    const verdict = trendPct > 10 ? '**Revenue is accelerating** — strong quarter.'
      : trendPct > 0 ? '**Revenue is growing modestly.**'
      : trendPct > -5 ? '**Revenue is flat** — the team is maintaining but not growing.'
      : '**Revenue is declining** — this needs attention now.'
    para1 = `${verdict} The ${line} Division closed **${formatCurrency(totalSales, true)}** in bookings${prior3.length > 0 ? ` (**${qoqWord} ${Math.abs(trendPct).toFixed(0)}%** QoQ)` : ''}.${totalInvoiced > 0 ? ` **${formatNumber(totalInvoiced)} deals** at **${formatCurrency(avgDealSize, true)}** average.` : ''}${totalOpps > 0 ? ` **${oppToInvRate.toFixed(0)}%** of opportunities reached close.` : ''}`
    para2 = `${top1 ? `**${top1.name}** leads the division at **${formatCurrency(top1Val, true)}**${top2 ? `, **${top2.name}** at **${formatCurrency((top2.totals[metric] || 0) as number, true)}**` : ''}.` : ''} ${top3Pct > 40 ? `**Revenue is concentrated** — top 3 drive **${top3Pct.toFixed(0)}%** (${formatCurrency(top3Val, true)}). If ${top1Name} slows down, the division feels it. Invest in developing the middle of the pack.` : `Revenue is well-distributed across the team.`}${topVsMedian > 5 ? ` The **${topVsMedian.toFixed(0)}x gap** between top and median advisor suggests untapped potential in the mid-tier.` : ''}`
    para3 = latestMonth
      ? `**${fmtMonth(latestMonth)}:** **${formatCurrency(latestVal, true)}**${latestVsAvg < -15 ? ` — **${Math.abs(latestVsAvg).toFixed(0)}% below average**. Is pipeline drying up? Check if there are enough qualified opps to sustain next month.` : latestVsAvg > 15 ? ` — strong month (**+${latestVsAvg.toFixed(0)}%**). Was this one big deal or broad-based? The answer determines whether this is sustainable.` : `, in line with recent months. Consistent but no breakout growth.`}`
      : ''
  } else {
    const verdict = oppToInvRate >= 30 ? '**Deal progression is strong.**'
      : oppToInvRate >= 15 ? '**Deal progression is moderate** — there\'s room to improve velocity.'
      : '**Too many deals are stalling** before reaching invoice. This limits revenue.'
    para1 = `${verdict} **${formatNumber(totalInvoiced)} deals** reached invoice stage${prior3.length > 0 ? ` (**${qoqWord} ${Math.abs(trendPct).toFixed(0)}%** QoQ)` : ''}${totalOpps > 0 ? `, a **${oppToInvRate.toFixed(0)}%** conversion from ${formatNumber(totalOpps)} total opportunities` : ''}.${totalSales > 0 ? ` These deals represent **${formatCurrency(totalSales, true)}** in bookings (**${formatCurrency(avgDealSize, true)}** avg).` : ''}`
    para2 = `${top1 ? `**${top1.name}** leads with **${formatNumber(top1Val)}** invoiced deals.` : ''} ${top3Pct > 40 ? `Top 3 drive **${top3Pct.toFixed(0)}%** of invoiced volume — progression is concentrated.` : `Well-distributed across the team.`}${invTrendPct < -10 && prior3.length > 0 ? ` **Invoice volume is declining** (${Math.abs(invTrendPct).toFixed(0)}% QoQ)${salesTrendPct < -5 ? ` and bookings are following (${Math.abs(salesTrendPct).toFixed(0)}% down). **The pipeline is contracting.**` : ' but bookings haven\'t dropped yet — the buffer won\'t last.'}` : ''}`
    para3 = latestMonth && latestVsAvg < -15
      ? `**${fmtMonth(latestMonth)}** invoiced volume dropped **${Math.abs(latestVsAvg).toFixed(0)}%** below average. Fewer invoiced deals = less revenue next month. Review what's stuck in mid-stage.`
      : ''
  }

  const narrative = [para1, para2, para3].filter(Boolean).join('\n\n')

  // Health cards
  const trendHealth: Health = trendPct > 5 ? 'strong' : trendPct > -5 ? 'moderate' : 'weak'
  let healthCards: { label: string; value: string; health: Health; detail: string; icon: typeof TrendingUp }[]

  if (metric === 'opps' || metric === 'leads') {
    const convRate = metric === 'opps' ? oppToInvRate : leadToOppRate
    const convLabel = metric === 'opps' ? 'Opp → Invoice' : 'Lead → Opp'
    const convHealth: Health = convRate >= 30 ? 'strong' : convRate >= 15 ? 'moderate' : 'weak'
    const yieldHealth: Health = revenuePerOpp > 5000 ? 'strong' : revenuePerOpp > 2000 ? 'moderate' : 'weak'
    const momentumHealth: Health = latestVsAvg > 5 ? 'strong' : latestVsAvg > -10 ? 'moderate' : 'weak'
    healthCards = [
      { label: 'QoQ Trend', value: `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(0)}%`, health: trendHealth, detail: `${fmtVal(recentSum)} last 3mo`, icon: TrendingUp },
      { label: convLabel, value: `${convRate.toFixed(1)}%`, health: convHealth, detail: `${formatNumber(metric === 'opps' ? totalInvoiced : totalOpps)} converted`, icon: Target },
      { label: 'Revenue Yield', value: metric === 'opps' ? formatCurrency(revenuePerOpp, true) : formatCurrency(revenuePerLead, true), health: yieldHealth, detail: `${formatCurrency(totalSales, true)} total bookings`, icon: DollarSign },
      { label: 'Latest Month', value: latestMonth ? fmtMonth(latestMonth) : '—', health: momentumHealth, detail: `${fmtVal(latestVal)} (${latestVsAvg > 0 ? '+' : ''}${latestVsAvg.toFixed(0)}%)`, icon: Users },
    ]
  } else if (metric === 'commission') {
    const commRate = totalSales > 0 ? (totalComm / totalSales * 100) : 0
    const commRateHealth: Health = commRate > 12 ? 'strong' : commRate > 8 ? 'moderate' : 'weak'
    const breadthHealth: Health = aboveAvgPct > 40 ? 'strong' : aboveAvgPct > 25 ? 'moderate' : 'weak'
    const momentumHealth: Health = latestVsAvg > 5 ? 'strong' : latestVsAvg > -10 ? 'moderate' : 'weak'
    healthCards = [
      { label: 'QoQ Trend', value: `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(0)}%`, health: trendHealth, detail: `${formatCurrency(recentSum, true)} last 3mo`, icon: TrendingUp },
      { label: 'Comm Rate', value: `${commRate.toFixed(1)}%`, health: commRateHealth, detail: `on ${formatCurrency(totalSales, true)} bookings`, icon: Target },
      { label: 'Team Breadth', value: `${aboveAvgPct.toFixed(0)}%`, health: breadthHealth, detail: `${aboveAvgCount} of ${agents.length} above avg`, icon: Users },
      { label: 'Latest Month', value: latestMonth ? fmtMonth(latestMonth) : '—', health: momentumHealth, detail: `${formatCurrency(latestVal, true)} (${latestVsAvg > 0 ? '+' : ''}${latestVsAvg.toFixed(0)}%)`, icon: DollarSign },
    ]
  } else {
    const breadthHealth: Health = aboveAvgPct > 40 ? 'strong' : aboveAvgPct > 25 ? 'moderate' : 'weak'
    const concentrationHealth: Health = top3Pct < 30 ? 'strong' : top3Pct < 50 ? 'moderate' : 'weak'
    const momentumHealth: Health = latestVsAvg > 5 ? 'strong' : latestVsAvg > -10 ? 'moderate' : 'weak'
    healthCards = [
      { label: 'QoQ Trend', value: `${trendPct > 0 ? '+' : ''}${trendPct.toFixed(0)}%`, health: trendHealth, detail: `${fmtVal(recentSum)} last 3mo`, icon: TrendingUp },
      { label: 'Team Breadth', value: `${aboveAvgPct.toFixed(0)}%`, health: breadthHealth, detail: `${aboveAvgCount} of ${agents.length} above avg`, icon: Users },
      { label: 'Top 3 Share', value: `${top3Pct.toFixed(0)}%`, health: concentrationHealth, detail: `${fmtVal(top3Val)} of ${fmtVal(totalVal)}`, icon: Target },
      { label: 'Latest Month', value: latestMonth ? fmtMonth(latestMonth) : '—', health: momentumHealth, detail: `${fmtVal(latestVal)} (${latestVsAvg > 0 ? '+' : ''}${latestVsAvg.toFixed(0)}%)`, icon: DollarSign },
    ]
  }

  // Recommended actions
  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []

  if (trendPct < -10) actions.push({ priority: 'high', label: `${Math.abs(trendPct).toFixed(0)}% QoQ Decline`, action: `${metricLabel} dropped ${Math.abs(trendPct).toFixed(0)}% quarter-over-quarter (${fmtVal(priorSum)} → ${fmtVal(recentSum)}). ${metric === 'leads' ? 'Review lead generation campaigns and marketing spend.' : metric === 'opps' ? 'Check whether lead quality declined or conversion standards tightened.' : 'Analyze whether this is seasonal, market-driven, or an execution issue.'}` })

  if (metric === 'opps' || metric === 'leads') {
    if (metric === 'opps' && oppToInvRate < 15 && totalOpps > 50) actions.push({ priority: 'high', label: `${oppToInvRate.toFixed(0)}% Conversion Rate`, action: `Only ${oppToInvRate.toFixed(1)}% of opportunities reach invoice stage. Deals are stalling — review qualification criteria and stage progression requirements. The team may be creating low-quality opps that never advance.` })
    if (metric === 'opps' && revenuePerOpp < 2000 && totalOpps > 50) actions.push({ priority: 'medium', label: `${formatCurrency(revenuePerOpp, true)}/Opp Yield`, action: `Revenue per opportunity is low. Consider whether the team is pursuing too many small deals. Focusing on fewer, higher-value opportunities could improve overall revenue yield.` })
    if (metric === 'leads' && leadToOppRate < 20 && totalLeads > 50) actions.push({ priority: 'high', label: `${leadToOppRate.toFixed(0)}% Lead Conversion`, action: `Less than 1 in 5 leads converts to an opportunity. Review lead sources — some channels may produce volume without quality. Tighten qualification before leads enter advisor workflows.` })
    if (metric === 'opps' && oppsTrendPct > 10 && salesTrendPct < -5) actions.push({ priority: 'high', label: 'Volume-Revenue Divergence', action: `Opportunity volume is up ${oppsTrendPct.toFixed(0)}% but bookings are down ${Math.abs(salesTrendPct).toFixed(0)}%. More opps but less revenue = declining deal quality. Shift focus from opp creation to opp progression and close rates.` })
  }
  if (metric === 'commission' && totalSales > 0) {
    const commRate = totalComm / totalSales * 100
    if (commRate < 8) actions.push({ priority: 'medium', label: `${commRate.toFixed(1)}% Commission Rate`, action: `Commission rate on bookings is below typical benchmarks. Verify commission calculations are current and no payment lags are distorting the picture.` })
  }

  if (top3Pct > 45) actions.push({ priority: 'high', label: 'Concentration Risk', action: `Top 3 advisors drive ${top3Pct.toFixed(0)}% of output (${fmtVal(top3Val)}). If any top performer slows down or leaves, the division takes a major hit. Develop mid-tier talent urgently.` })
  if (aboveAvgPct < 30) actions.push({ priority: 'medium', label: 'Long Tail Problem', action: `Only ${aboveAvgPct.toFixed(0)}% of advisors exceed the average (${fmtVal(avgPerAgent)}). The bottom quartile may need training, territory adjustments, or performance reviews.` })
  if (topVsMedian > 5) actions.push({ priority: 'medium', label: `${topVsMedian.toFixed(0)}x Performance Gap`, action: `The top advisor produces ${topVsMedian.toFixed(0)}x the median. Identify what differentiates them (territory, tenure, technique) and systematize it across the team.` })
  if (latestVsAvg < -15) actions.push({ priority: 'medium', label: 'Recent Slowdown', action: `${latestMonth ? fmtMonth(latestMonth) : 'Latest month'} underperformed the rolling average by ${Math.abs(latestVsAvg).toFixed(0)}%. ${metric === 'leads' ? 'This will impact pipeline 1-2 months out.' : metric === 'opps' ? 'Fewer opps created now means less revenue 2-3 months out.' : 'Check whether pipeline can sustain recovery.'}` })

  if (trendPct > 10) actions.push({ priority: 'low', label: 'Strong Momentum', action: `${metricLabel} grew ${trendPct.toFixed(0)}% QoQ. Identify which advisors or segments drove the acceleration and replicate.` })
  if (top3Pct <= 30 && aboveAvgPct >= 40) actions.push({ priority: 'low', label: 'Healthy Distribution', action: `Production is well-distributed across the team (top 3 at ${top3Pct.toFixed(0)}%, ${aboveAvgPct.toFixed(0)}% above average). Maintain this balance.` })

  return { narrative, healthCards, actions }
}
