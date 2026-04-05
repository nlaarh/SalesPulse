import { useState } from 'react'
import { formatCurrency, cn } from '@/lib/utils'
import { scoreColor, scoreBg, fmtDate } from '@/lib/formatters'
import { Tip, TIPS } from '@/components/MetricTip'
import { ExternalLink, ArrowUpDown } from 'lucide-react'
import type { AgentProfile } from '../AgentDashboard'

/* ── Props ──────────────────────────────────────────────────────────────── */

interface OpportunitiesTabProps {
  profile: AgentProfile
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function OpportunitiesTab({ profile }: OpportunitiesTabProps) {
  const [sortBy, setSortBy] = useState<'score' | 'amount'>('score')

  const sorted = [...profile.top_opportunities].sort((a, b) =>
    sortBy === 'score' ? b.score - a.score : b.amount - a.amount
  )

  const totalValue = profile.top_opportunities.reduce((sum, o) => sum + o.amount, 0)
  const avgScore = profile.top_opportunities.length > 0
    ? profile.top_opportunities.reduce((sum, o) => sum + o.score, 0) / profile.top_opportunities.length
    : 0

  return (
    <div>
      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-6 text-[12px]">
        <span className="text-muted-foreground">
          Total Pipeline: <span className="tabular-nums font-semibold text-foreground">{formatCurrency(totalValue, true)}</span>
        </span>
        <span className="text-muted-foreground">
          Avg Score: <span className={cn('tabular-nums font-semibold', scoreColor(avgScore))}>{avgScore.toFixed(0)}</span>
        </span>
        {profile.pushed_count > 0 && (
          <span className="font-semibold text-amber-500">
            {profile.pushed_count} deals pushed ({formatCurrency(profile.pushed_value, true)})
          </span>
        )}
        {profile.stale_count > 0 && (
          <span className="text-muted-foreground">
            {profile.stale_count} stale (30+ days idle)
          </span>
        )}

        {/* Sort toggle */}
        <button
          onClick={() => setSortBy(sortBy === 'score' ? 'amount' : 'score')}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowUpDown className="h-3 w-3" />
          Sort by {sortBy === 'score' ? 'Amount' : 'Score'}
        </button>
      </div>

      {/* Score legend */}
      <div className="mb-3 flex items-center gap-3 text-[10px] text-muted-foreground/60">
        <span>Priority Score<Tip text={TIPS.priorityScore} />:</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 80+ Act Now</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> 60+ Follow Up</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> &lt;60 Monitor</span>
      </div>

      {/* Opportunity list */}
      {sorted.length > 0 ? (
        <div className="-mx-6 divide-y divide-border/50">
          {sorted.map((opp) => (
            <div key={opp.id} className="group flex items-center gap-4 px-6 py-3 transition-colors hover:bg-secondary/20">
              {/* Score */}
              <div className="relative w-10 shrink-0 text-center" title={opp.reasons.join(' · ')}>
                <span className={cn('text-[14px] font-bold tabular-nums', scoreColor(opp.score))}>
                  {opp.score.toFixed(0)}
                </span>
                <div className="mt-0.5 h-1 w-full rounded-full bg-secondary">
                  <div className={cn('h-1 rounded-full', scoreBg(opp.score))}
                    style={{ width: `${opp.score}%` }} />
                </div>
              </div>

              {/* Deal info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{opp.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {opp.stage} &middot; {opp.probability}% prob
                  {opp.push_count > 0 && (
                    <span className="text-amber-500"> &middot; Pushed {opp.push_count}x</span>
                  )}
                </p>
              </div>

              {/* Amount */}
              <span className="tabular-nums text-[14px] font-semibold">
                {formatCurrency(opp.amount, true)}
              </span>

              {/* Close date */}
              <span className="w-16 text-right text-[11px] text-muted-foreground">
                {fmtDate(opp.close_date)}
              </span>

              {/* SF link */}
              <a
                href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary/60 transition-colors hover:text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
          No open opportunities
        </div>
      )}
    </div>
  )
}
