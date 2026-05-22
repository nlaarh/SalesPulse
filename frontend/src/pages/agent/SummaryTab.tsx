import { formatCurrency, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'
import { AlertTriangle, Clock, ExternalLink, CheckCircle2 } from 'lucide-react'
import type { AgentProfile } from '../AgentDashboard'

interface SummaryTabProps {
  profile: AgentProfile
}

function fmtCreated(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function SummaryTab({ profile }: SummaryTabProps) {
  const stats = profile.tasks.stats
  const tasks = profile.tasks.open_tasks

  return (
    <div>
      {/* Summary pills */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <span className="text-[20px] font-bold tabular-nums">{stats.total_open}</span>
          <span className="text-[11px] font-medium text-muted-foreground">Open Tasks</span>
        </div>
        {stats.overdue > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <span className="text-[20px] font-bold tabular-nums text-rose-500">{stats.overdue}</span>
            <span className="text-[11px] font-medium text-rose-400">Overdue</span>
          </div>
        )}
        {stats.total_period > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
            <CheckCircle2 className={cn('h-4 w-4', stats.completion_rate >= 80 ? 'text-emerald-500' : stats.completion_rate >= 60 ? 'text-amber-500' : 'text-rose-500')} />
            <span className={cn('text-[20px] font-bold tabular-nums', stats.completion_rate >= 80 ? 'text-emerald-500' : stats.completion_rate >= 60 ? 'text-amber-500' : 'text-rose-500')}>
              {stats.completion_rate}%
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Completion<br />
              <span className="text-muted-foreground/60">{stats.completed_period}/{stats.total_period} this period</span>
            </span>
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
          No open tasks
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="mb-1 grid grid-cols-[1.5rem_1fr_auto_auto_auto_1.5rem] items-center gap-3 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            <span />
            <span>Task / Description</span>
            <span className="text-right">Related To</span>
            <span className="text-right w-20">Created</span>
            <span className="text-right w-24">Due / Status</span>
            <span />
          </div>

          <div className="-mx-6 divide-y divide-border/20">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  'grid grid-cols-[1.5rem_1fr_auto_auto_auto_1.5rem] items-start gap-3 px-6 py-3 transition-colors',
                  task.overdue ? 'bg-rose-500/[0.03] hover:bg-rose-500/[0.05]' : 'hover:bg-secondary/20',
                )}
              >
                {/* Status icon */}
                <div className="pt-0.5">
                  {task.overdue ? (
                    <Clock className="h-3.5 w-3.5 text-rose-500" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/20" />
                  )}
                </div>

                {/* Subject + description */}
                <div className="min-w-0">
                  <span className={cn(
                    'block text-[13px] font-medium leading-snug',
                    task.overdue ? 'text-rose-500' : 'text-foreground',
                  )}>
                    {task.subject}
                  </span>
                  {task.description ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-2">
                      {task.description}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/30 italic">No description</p>
                  )}
                  {task.priority && task.priority !== 'Normal' && (
                    <span className={cn(
                      'mt-1 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                      task.priority === 'High' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500',
                    )}>
                      {task.priority}
                    </span>
                  )}
                </div>

                {/* Related opportunity */}
                <div className="max-w-[200px] text-right">
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {task.related_to || '—'}
                  </span>
                  {task.opp_amount != null && task.opp_amount > 0 && (
                    <span className="text-[11px] tabular-nums font-semibold text-foreground/70">
                      {formatCurrency(task.opp_amount, true)}
                    </span>
                  )}
                </div>

                {/* Created date */}
                <span className="w-20 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground/60">
                  {fmtCreated(task.created)}
                </span>

                {/* Due / overdue */}
                <span className={cn(
                  'w-24 pt-0.5 text-right tabular-nums text-[12px]',
                  task.overdue ? 'font-semibold text-rose-500' : 'text-muted-foreground',
                )}>
                  {task.overdue && task.days_overdue != null
                    ? `${task.days_overdue}d overdue`
                    : task.due_date
                    ? fmtDate(task.due_date)
                    : '—'}
                </span>

                {/* SF link */}
                <div className="pt-0.5">
                  {task.what_id ? (
                    <a
                      href={`https://aaawcny.my.salesforce.com/${task.what_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary/40 transition-colors hover:text-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="h-3.5 w-3.5 block" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
