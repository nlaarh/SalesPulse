import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, cn } from '@/lib/utils'
import { scoreColor, scoreBg, fmtDate } from '@/lib/formatters'
import { Tip, TIPS } from '@/components/MetricTip'
import { ExternalLink, ArrowUpDown, ChevronRight, Trophy } from 'lucide-react'
import type { AgentProfile } from '../AgentDashboard'

/* ── Props ──────────────────────────────────────────────────────────────── */

interface OpportunitiesTabProps {
  profile: AgentProfile
}

/* ── Stage badge color ──────────────────────────────────────────────────── */

function stageBadge(stage: string) {
  const s = stage.toLowerCase()
  if (s.includes('invoice') || s.includes('won')) return 'bg-emerald-500/10 text-emerald-600'
  if (s.includes('quote') || s.includes('proposal')) return 'bg-blue-500/10 text-blue-600'
  if (s.includes('qualify') || s.includes('research')) return 'bg-amber-500/10 text-amber-600'
  if (s.includes('new')) return 'bg-purple-500/10 text-purple-600'
  if (s.includes('booked')) return 'bg-cyan-500/10 text-cyan-600'
  return 'bg-secondary text-muted-foreground'
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function OpportunitiesTab({ profile }: OpportunitiesTabProps) {
  const [sortBy, setSortBy] = useState<'score' | 'amount'>('score')
  const [view, setView] = useState<'open' | 'won'>('open')
  const navigate = useNavigate()

  const sorted = [...profile.top_opportunities].sort((a, b) =>
    sortBy === 'score' ? b.score - a.score : b.amount - a.amount
  )

  const totalValue = profile.top_opportunities.reduce((sum, o) => sum + o.amount, 0)
  const avgScore = profile.top_opportunities.length > 0
    ? profile.top_opportunities.reduce((sum, o) => sum + o.score, 0) / profile.top_opportunities.length
    : 0

  const wonOpps = profile.won_opportunities ?? []

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
          <button
            onClick={() => setView('open')}
            className={cn(
              'rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
              view === 'open' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Open Pipeline ({profile.top_opportunities.length})
          </button>
          <button
            onClick={() => setView('won')}
            className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
              view === 'won' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Trophy className="h-3 w-3" />
            Won ({wonOpps.length})
          </button>
        </div>

        {view === 'open' && (
          <>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{formatCurrency(totalValue, true)}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              Avg Score: <span className={cn('font-semibold', scoreColor(avgScore))}>{avgScore.toFixed(0)}</span>
            </span>
            {profile.pushed_count > 0 && (
              <span className="font-semibold text-amber-500 text-[11px]">
                {profile.pushed_count} pushed
              </span>
            )}
            <button
              onClick={() => setSortBy(sortBy === 'score' ? 'amount' : 'score')}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortBy === 'score' ? 'Amount' : 'Score'}
            </button>
          </>
        )}
      </div>

      {view === 'open' ? (
        <>
          {/* Score legend */}
          <div className="mb-3 flex items-center gap-3 text-[10px] text-muted-foreground/60">
            <span>Priority Score<Tip text={TIPS.priorityScore} />:</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 80+ Act Now</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> 60+ Follow Up</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" /> &lt;60 Monitor</span>
          </div>

          {/* Open opportunity list */}
          {sorted.length > 0 ? (
            <div className="-mx-6 divide-y divide-border/50">
              {sorted.map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => navigate(`/opportunity/${opp.id}`)}
                  className="group flex cursor-pointer items-center gap-4 px-6 py-3 transition-colors hover:bg-secondary/30"
                >
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
                    <p className="truncate text-[13px] font-medium group-hover:text-primary transition-colors">{opp.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', stageBadge(opp.stage))}>
                        {opp.stage}
                      </span>
                      <span>{opp.probability}% prob</span>
                      {opp.push_count > 0 && (
                        <span className="text-amber-500">· Pushed {opp.push_count}x</span>
                      )}
                    </p>
                  </div>

                  {/* Amount */}
                  <span className="tabular-nums text-[14px] font-semibold">
                    {opp.amount > 0 ? formatCurrency(opp.amount, true) : '—'}
                  </span>

                  {/* Close date */}
                  <span className="w-16 text-right text-[11px] text-muted-foreground">
                    {fmtDate(opp.close_date)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary/60 transition-colors hover:text-primary"
                      title="Open in Salesforce"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
              No open opportunities
            </div>
          )}
        </>
      ) : (
        /* Won opportunities list */
        <>
          {wonOpps.length > 0 ? (
            <div className="-mx-6 divide-y divide-border/50">
              {wonOpps.map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => navigate(`/opportunity/${opp.id}`)}
                  className="group flex cursor-pointer items-center gap-4 px-6 py-3 transition-colors hover:bg-secondary/30"
                >
                  <Trophy className="h-4 w-4 shrink-0 text-emerald-500" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium group-hover:text-primary transition-colors">{opp.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', stageBadge(opp.stage))}>
                        {opp.stage}
                      </span>
                      <span>Closed {fmtDate(opp.close_date)}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular-nums text-[14px] font-semibold">{formatCurrency(opp.amount, true)}</p>
                    {opp.commission > 0 && (
                      <p className="text-[11px] text-emerald-600">+{formatCurrency(opp.commission, true)} comm</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary/60 transition-colors hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
              No won deals in this period
            </div>
          )}
        </>
      )}
    </div>
  )
}
