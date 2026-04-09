import { formatCurrency, formatPct } from '@/lib/utils'
import type { AgentProfile, FocusArea } from './types'

/* ── Focus Areas Generator (advisor-addressed) ─────────────────────────────── */

export function generateFocusAreas(p: AgentProfile): FocusArea[] {
  const pts: FocusArea[] = []
  const s = p.summary
  const yoy = p.yoy
  const team = p.team

  // 1. Bookings — how are sales compared to last year?
  const revVsTeam = team.avg_revenue > 0
    ? Math.round((s.revenue - team.avg_revenue) / team.avg_revenue * 100)
    : 0
  if (yoy.revenue_pct < -20) {
    pts.push({
      priority: 'high',
      title: `Bookings Are Down ${Math.abs(yoy.revenue_pct).toFixed(0)}% Compared to Last Year`,
      detail: `You brought in ${formatCurrency(s.revenue, true)} this period. Last year in the same timeframe it was ${formatCurrency(p.prior.revenue, true)}. `
        + (yoy.deals_pct < -10
          ? `You're also working fewer deals (down ${Math.abs(yoy.deals_pct).toFixed(0)}%), which means fewer chances to close.`
          : 'The number of deals is about the same, but each deal is bringing in less money.'),
      action: yoy.deals_pct < -10
        ? 'Let\'s look at where your leads are coming from and find ways to get more deals in the door.'
        : 'Let\'s look at why deals are coming in smaller — are clients spending less, or are we discounting more?',
    })
  } else if (yoy.revenue_pct > 15) {
    pts.push({
      priority: 'low',
      title: `Great Job — Bookings Up ${yoy.revenue_pct.toFixed(0)}% Over Last Year`,
      detail: `You brought in ${formatCurrency(s.revenue, true)} this period, up from ${formatCurrency(p.prior.revenue, true)} last year. ${revVsTeam > 0 ? `That puts you ${revVsTeam}% above the team average.` : ''}`,
      action: 'Keep doing what you\'re doing. Let\'s talk about what\'s working so we can keep it going.',
    })
  } else if (revVsTeam < -25) {
    pts.push({
      priority: 'high',
      title: `Bookings Are ${Math.abs(revVsTeam)}% Below the Team Average`,
      detail: `You've brought in ${formatCurrency(s.revenue, true)} so far. The average across the team is ${formatCurrency(team.avg_revenue, true)}.`,
      action: 'Let\'s figure out together what\'s causing the gap and how to close it.',
    })
  }

  // 2. Overdue tasks — grouped by urgency
  const overdueTasks = p.tasks.open_tasks.filter(t => t.overdue)
  if (overdueTasks.length > 0) {
    const atRisk = overdueTasks.filter(t => (t.opp_amount || 0) >= 3000)
    const stale = overdueTasks.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) >= 30)
    const recent = overdueTasks.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) < 30)

    const lines: string[] = []
    if (atRisk.length > 0) {
      const riskValue = atRisk.reduce((s, t) => s + (t.opp_amount || 0), 0)
      lines.push(`Deals at risk (${formatCurrency(riskValue, true)}): ${atRisk.length} overdue task${atRisk.length > 1 ? 's' : ''} tied to active deals. These should be top priority — a missed follow-up could mean a lost sale.`)
    }
    if (stale.length > 0) {
      lines.push(`Stale tasks (30+ days overdue): ${stale.length} task${stale.length > 1 ? 's have' : ' has'} been sitting for over a month. These probably need to be closed out or reassigned — if they haven't been done by now, the original need may have passed.`)
    }
    if (recent.length > 0) {
      lines.push(`Recently overdue: ${recent.length} task${recent.length > 1 ? 's are' : ' is'} just a few days late. Quick wins — knock these out or update the due dates.`)
    }

    pts.push({
      priority: atRisk.length > 0 ? 'high' : 'medium',
      title: `${overdueTasks.length} Task${overdueTasks.length > 1 ? 's' : ''} Past Due — Here's Where to Start`,
      detail: lines.join('\n\n'),
      action: 'Start with the deals at risk, then clean up the stale ones. See the full list below.',
    })
  }

  // 3. Top deals that need attention
  const topOpps = p.top_opportunities.filter(o => o.score >= 50).slice(0, 5)
  if (topOpps.length > 0) {
    const totalValue = topOpps.reduce((s, o) => s + o.amount, 0)
    pts.push({
      priority: 'medium',
      title: `${topOpps.length} Important Deals to Watch (${formatCurrency(totalValue, true)} total)`,
      detail: topOpps.map(o => {
        const signal = o.reasons[0] || ''
        return `${o.name}: ${formatCurrency(o.amount, true)} — ${signal}`
      }).join('\n'),
      action: 'For each one: What\'s the next step? Is anything holding it up? When do you think the client will decide?',
    })
  }

  // 4. Pipeline
  if (s.coverage < 1.5) {
    pts.push({
      priority: 'high',
      title: 'Not Enough Open Deals in the Pipeline',
      detail: `You've closed ${formatCurrency(s.revenue, true)} in sales so far. But right now you only have ${formatCurrency(s.pipeline_value, true)} worth of open deals still in progress (${s.pipeline_count} deals). `
        + `That's not enough to keep your numbers growing — ideally you'd want at least double your current sales (${formatCurrency(s.revenue * 2, true)}) in open deals at any time.`,
      action: 'Let\'s talk about how to bring in more deals. Any existing clients you could offer additional services to?',
    })
  } else if (s.coverage >= 3) {
    pts.push({
      priority: 'low',
      title: 'Pipeline Looks Great',
      detail: `You have ${formatCurrency(s.pipeline_value, true)} worth of open deals (${s.pipeline_count} deals) — well above what you've already sold. You have plenty of opportunities to keep growing.`,
      action: 'Focus on moving these deals forward and getting them closed.',
    })
  }

  // 5. Stale deals
  if (p.pushed_count >= 2 || p.stale_count >= 3) {
    const parts: string[] = []
    if (p.pushed_count >= 2)
      parts.push(`${p.pushed_count} deals have had their close date pushed back 2 or more times (${formatCurrency(p.pushed_value, true)} total)`)
    if (p.stale_count >= 3)
      parts.push(`${p.stale_count} deals haven't had any activity in over 30 days`)
    pts.push({
      priority: 'medium',
      title: 'Some Deals Need a Clean-Up',
      detail: parts.join('. ') + '.',
      action: 'Please go through these — if a deal is dead, close it out. If it\'s still alive, update the timeline and reach out to the client.',
    })
  }

  // 6. Win rate
  if (s.win_rate < team.win_rate - 10) {
    pts.push({
      priority: 'medium',
      title: `Closing Fewer Deals Than the Team Average`,
      detail: `You're winning ${formatPct(s.win_rate)} of your deals. The team average is ${formatPct(team.win_rate)} — that's a ${Math.round(team.win_rate - s.win_rate)} point gap.`,
      action: 'Let\'s look at your recent lost deals together and see if there\'s a pattern we can fix.',
    })
  }

  // 7. Task completion
  const ts = p.tasks.stats
  if (ts.completion_rate < 60 && ts.total_period >= 10) {
    pts.push({
      priority: 'medium',
      title: `Only ${ts.completion_rate}% of Tasks Completed`,
      detail: `Out of ${ts.total_period} tasks assigned this period, ${ts.completed_period} got done.`,
      action: 'Are some of these tasks not relevant? Let\'s talk about how to prioritize or clean up your task list.',
    })
  }

  // Sort by priority
  const order = { high: 0, medium: 1, low: 2 }
  pts.sort((a, b) => order[a.priority] - order[b.priority])

  return pts
}
