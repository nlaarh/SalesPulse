import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Target, TrendingUp } from 'lucide-react'
import { fetchGoalFocusOpportunities, type GoalFocusResponse } from '@/lib/api_goal_focus'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'

export default function GoalGapFocus({
  line,
  metric,
}: {
  line: string
  metric: 'commission' | 'bookings'
}) {
  const [data, setData] = useState<GoalFocusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchGoalFocusOpportunities(line, metric)
      .then((result) => { if (!cancelled) setData(result) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [line, metric])

  if (loading) {
    return (
      <div className="animate-enter card-premium flex items-center gap-3 px-5 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
        <span className="text-[12px] text-muted-foreground">Finding deals that can close this month...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="animate-enter card-premium flex items-center gap-3 px-5 py-4">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-[12px] text-muted-foreground">Goal-focus opportunities are unavailable right now.</span>
      </div>
    )
  }

  const complete = data.gap <= 0
  const coverageTone = data.coverage_pct >= 100 ? 'text-emerald-500' : data.coverage_pct >= 60 ? 'text-amber-500' : 'text-rose-500'

  return (
    <div className="animate-enter card-premium overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">Monthly Goal Gap Focus</h3>
              <p className="text-[10px] text-muted-foreground">
                {line} · {metric} · through {fmtDate(data.month_end)}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <Stat label="Gap" value={formatCurrency(data.gap, true)} tone={complete ? 'text-emerald-500' : 'text-foreground'} />
          <Stat label="Focus Coverage" value={`${formatNumber(Math.round(data.coverage_pct))}%`} tone={coverageTone} />
          <Stat label="Weighted Value" value={formatCurrency(data.expected_value, true)} tone="text-primary" />
        </div>
      </div>

      {complete ? (
        <div className="flex items-center gap-3 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-[12px] text-muted-foreground">{data.message ?? 'Monthly target is already met.'}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {data.opportunities.map((opp) => (
            <div key={opp.id} className="grid gap-3 px-5 py-3.5 lg:grid-cols-[32px_1fr_auto] lg:items-center">
              <span className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold',
                opp.rank <= 3 ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
              )}>
                {opp.rank}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-semibold">{opp.name}</p>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{opp.stage}</span>
                  {opp.push_count >= 3 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">Pushed {opp.push_count}x</span>}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{opp.next_action}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span>{opp.owner || 'Unassigned'}</span>
                  <span>{opp.probability}% probability</span>
                  <span>Close {fmtDate(opp.close_date)}</span>
                  <span>Priority {opp.priority_score.toFixed(0)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <div className="text-right">
                  <p className="tabular-nums text-[15px] font-bold">{formatCurrency(opp.goal_value, true)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(opp.expected_value, true)} weighted</p>
                </div>
                <a
                  href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  aria-label={`Open ${opp.name} in Salesforce`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
          {data.opportunities.length === 0 && (
            <div className="flex items-center gap-3 px-5 py-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground">No active month-end opportunities found for this goal gap.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-[88px] rounded-xl bg-secondary/30 px-3 py-2">
      <p className={cn('tabular-nums text-[16px] font-bold leading-none', tone)}>{value}</p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
