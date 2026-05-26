import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowUpDown, CheckCircle2, ExternalLink, Loader2, Target, TrendingUp } from 'lucide-react'
import { fetchGoalFocusOpportunities, type GoalFocusResponse } from '@/lib/api_goal_focus'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'

type SortKey = 'priority_score' | 'probability' | 'goal_value' | 'amount' | 'expected_value' | 'close_date'

export default function GoalGapFocus({ line, metric }: { line: string; metric: 'commission' | 'bookings' }) {
  const [data, setData] = useState<GoalFocusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('priority_score')
  const [sortAsc, setSortAsc] = useState(false)

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
  const isCommission = data.metric === 'commission'
  const today = new Date().toISOString().slice(0, 10)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const sorted = [...(data.opportunities ?? [])].sort((a, b) => {
    if (sortKey === 'close_date') {
      const aD = a.close_date ? new Date(a.close_date).getTime() : 0
      const bD = b.close_date ? new Date(b.close_date).getTime() : 0
      return sortAsc ? aD - bD : bD - aD
    }
    const aV = (a[sortKey] as number) ?? 0
    const bV = (b[sortKey] as number) ?? 0
    return sortAsc ? aV - bV : bV - aV
  })

  return (
    <div className="animate-enter card-premium overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Monthly Goal Gap Focus</h3>
            <p className="text-[10px] text-muted-foreground">
              {line} · {metric} · through {fmtDate(data.month_end)}
              {data.available_count > sorted.length && (
                <span className="ml-1">· top {sorted.length} of {data.available_count} deals</span>
              )}
            </p>
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
      ) : data.opportunities.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-4">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">No active opportunities found within the next 3 months.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="w-8 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">#</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Opportunity</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Agent</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Stage</th>
                <SortTh label="Prob" sortKey="probability" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                {isCommission && <SortTh label="Booking $" sortKey="amount" current={sortKey} asc={sortAsc} onToggle={toggleSort} />}
                <SortTh label={isCommission ? 'Comm $' : 'Booking $'} sortKey="goal_value" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                <SortTh label="Weighted" sortKey="expected_value" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                <SortTh label="Close Date" sortKey="close_date" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                <SortTh label="Priority" sortKey="priority_score" current={sortKey} asc={sortAsc} onToggle={toggleSort} />
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Next Action</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((opp, idx) => {
                const isOverdue = !!opp.close_date && opp.close_date < today
                return (
                  <tr
                    key={opp.id}
                    className={cn(
                      'group border-b border-border/20 transition-colors duration-100 hover:bg-primary/5',
                      idx % 2 !== 0 && 'bg-secondary/10',
                    )}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold',
                        opp.rank <= 3 ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                      )}>
                        {opp.rank}
                      </span>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <a
                        href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[12px] font-medium text-primary hover:underline hover:text-primary-foreground"
                        title={opp.name}
                      >
                        <p className="truncate">{opp.name}</p>
                      </a>
                      {opp.push_count >= 3 && (
                        <span className="mt-0.5 inline-block rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
                          Pushed {opp.push_count}×
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-muted-foreground">{opp.owner || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{opp.stage}</span>
                    </td>
                    <td className="tabular-nums px-3 py-2.5 text-right text-[12px]">
                      <span className={cn(
                        opp.probability >= 60 ? 'text-emerald-500' : opp.probability < 30 ? 'text-rose-500' : 'text-muted-foreground',
                      )}>
                        {opp.probability}%
                      </span>
                    </td>
                    {isCommission && (
                      <td className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                        {formatCurrency(opp.amount, true)}
                      </td>
                    )}
                    <td className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold">
                      {formatCurrency(opp.goal_value, true)}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                      {formatCurrency(opp.expected_value, true)}
                    </td>
                    <td className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-right text-[12px]',
                      isOverdue ? 'font-semibold text-rose-500' : 'text-muted-foreground',
                    )}>
                      {fmtDate(opp.close_date)}
                      {isOverdue && <span className="ml-1 text-[10px] opacity-70">(overdue)</span>}
                    </td>
                    <td className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-muted-foreground">
                      {opp.priority_score.toFixed(0)}
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      <p className="line-clamp-2">{opp.next_action}</p>
                    </td>
                    <td className="pr-3 py-2.5">
                      <a
                        href={`https://aaawcny.my.salesforce.com/${opp.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                        aria-label="Open in Salesforce"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortTh({ label, sortKey, current, asc: _asc, onToggle }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onToggle: (k: SortKey) => void
}) {
  return (
    <th
      onClick={() => onToggle(sortKey)}
      className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
    >
      <div className="flex items-center justify-end gap-1">
        {label}
        <ArrowUpDown className={cn('h-2.5 w-2.5', current === sortKey && 'text-primary')} />
      </div>
    </th>
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
