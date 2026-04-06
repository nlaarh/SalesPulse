import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, cn } from '@/lib/utils'
import { scoreColor, scoreBg, fmtDate } from '@/lib/formatters'
import { Tip, TIPS } from '@/components/MetricTip'
import { ExternalLink, ArrowUpDown, ChevronRight, Trophy, Filter } from 'lucide-react'
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
  const [sortBy, setSortBy] = useState<'score' | 'amount' | 'date' | 'stage'>('score')
  const [view, setView] = useState<'open' | 'won'>('open')
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const navigate = useNavigate()

  // Build unique stages with counts for filter chips
  const stageCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of profile.top_opportunities) {
      map.set(o.stage, (map.get(o.stage) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [profile.top_opportunities])

  const hasMultipleStages = stageCounts.length > 1

  const filtered = stageFilter
    ? profile.top_opportunities.filter(o => o.stage === stageFilter)
    : profile.top_opportunities

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'score')  return b.score - a.score
    if (sortBy === 'amount') return b.amount - a.amount
    if (sortBy === 'date')   return (a.close_date ?? '').localeCompare(b.close_date ?? '')
    if (sortBy === 'stage')  return a.stage.localeCompare(b.stage)
    return 0
  })

  const totalValue = filtered.reduce((sum, o) => sum + o.amount, 0)
  const avgScore = filtered.length > 0
    ? filtered.reduce((sum, o) => sum + o.score, 0) / filtered.length
    : 0

  const wonOpps = profile.won_opportunities ?? []

  return (
    <div>
      {/* View toggle */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
          <button
            onClick={() => setView('open')}
            className={cn(
              'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              view === 'open' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Open Pipeline ({profile.top_opportunities.length})
          </button>
          <button
            onClick={() => setView('won')}
            className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
              view === 'won' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Trophy className="h-3 w-3" />
            Won ({wonOpps.length})
          </button>
        </div>

        {view === 'open' && (
          <>
            <span className="ml-auto text-[12px] text-muted-foreground">
              {formatCurrency(totalValue, true)} · avg score <span className={cn('font-semibold', scoreColor(avgScore))}>{avgScore.toFixed(0)}</span>
            </span>
            {profile.pushed_count > 0 && (
              <span className="font-semibold text-amber-500 text-[12px]">
                {profile.pushed_count} pushed
              </span>
            )}
            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-[12px] font-medium text-muted-foreground"
            >
              <option value="score">Sort: Priority</option>
              <option value="amount">Sort: Amount</option>
              <option value="date">Sort: Close Date</option>
              <option value="stage">Sort: Stage</option>
            </select>
          </>
        )}
      </div>

      {/* Stage filter chips — only shown when multiple stages exist */}
      {view === 'open' && hasMultipleStages && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            onClick={() => setStageFilter(null)}
            className={cn(
              'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
              stageFilter === null
                ? 'bg-primary text-primary-foreground'
                : 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
            )}
          >
            All ({profile.top_opportunities.length})
          </button>
          {stageCounts.map(([stage, count]) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                stageFilter === stage
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              )}
            >
              {stage} ({count})
            </button>
          ))}
        </div>
      )}

      {view === 'open' ? (
        <>
          {/* Score legend */}
          <div className="mb-3 flex items-center gap-3 text-[12px] text-muted-foreground">
            <span>Priority<Tip text={TIPS.priorityScore} />:</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> 80+ Act Now</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> 60+ Follow Up</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" /> &lt;60 Monitor</span>
          </div>

          {/* Open opportunity list */}
          {sorted.length > 0 ? (
            <div className="-mx-6 divide-y divide-border/50">
              {sorted.map((opp) => (
                <div
                  key={opp.id}
                  onClick={() => navigate(`/opportunity/${opp.id}`)}
                  className="group flex cursor-pointer items-center gap-4 px-6 py-3.5 transition-colors hover:bg-secondary/30"
                >
                  {/* Score */}
                  <div className="relative w-10 shrink-0 text-center" title={opp.reasons.join(' · ')}>
                    <span className={cn('text-[15px] font-bold tabular-nums', scoreColor(opp.score))}>
                      {opp.score.toFixed(0)}
                    </span>
                    <div className="mt-0.5 h-1.5 w-full rounded-full bg-secondary">
                      <div className={cn('h-1.5 rounded-full', scoreBg(opp.score))}
                        style={{ width: `${opp.score}%` }} />
                    </div>
                  </div>

                  {/* Deal info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold group-hover:text-primary transition-colors">{opp.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', stageBadge(opp.stage))}>
                        {opp.stage}
                      </span>
                      <span>{opp.probability}% prob</span>
                      {opp.push_count > 0 && (
                        <span className="font-semibold text-amber-500">· Pushed {opp.push_count}×</span>
                      )}
                    </p>
                  </div>

                  {/* Amount */}
                  <span className="tabular-nums text-[15px] font-bold">
                    {opp.amount > 0 ? formatCurrency(opp.amount, true) : '—'}
                  </span>

                  {/* Close date */}
                  <span className="w-20 text-right text-[12px] font-medium text-muted-foreground">
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
            <div className="flex items-center justify-center py-12 text-[13px] text-muted-foreground">
              {stageFilter ? `No opportunities in "${stageFilter}" stage` : 'No open opportunities'}
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
                  className="group flex cursor-pointer items-center gap-4 px-6 py-3.5 transition-colors hover:bg-secondary/30"
                >
                  <Trophy className="h-5 w-5 shrink-0 text-emerald-500" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold group-hover:text-primary transition-colors">{opp.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', stageBadge(opp.stage))}>
                        {opp.stage}
                      </span>
                      <span>Closed {fmtDate(opp.close_date)}</span>
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular-nums text-[15px] font-bold">{formatCurrency(opp.amount, true)}</p>
                    {opp.commission > 0 && (
                      <p className="text-[12px] font-semibold text-emerald-600">+{formatCurrency(opp.commission, true)} comm</p>
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
