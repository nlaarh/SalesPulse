import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, Clock, ExternalLink } from 'lucide-react'
import type { AgentProfile } from '../AgentDashboard'

/* ── Props ──────────────────────────────────────────────────────────────── */

interface SummaryTabProps {
  profile: AgentProfile
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function SummaryTab({ profile }: SummaryTabProps) {
  const stats = profile.tasks.stats
  const tasks = profile.tasks.open_tasks

  return (
    <div>
      {/* Summary strip */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px]">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{stats.total_open}</span> open tasks
        </span>
        {stats.overdue > 0 && (
          <span className="flex items-center gap-1 font-semibold text-rose-500">
            <AlertTriangle className="h-3 w-3" />
            {stats.overdue} overdue
          </span>
        )}
        {stats.total_period > 0 && (
          <span className={cn(
            'font-medium',
            stats.completion_rate >= 80 ? 'text-emerald-500' : stats.completion_rate >= 60 ? 'text-amber-500' : 'text-rose-500',
          )}>
            {stats.completion_rate}% completion rate
          </span>
        )}
        {stats.total_period > 0 && (
          <span className="text-muted-foreground">
            {stats.completed_period} completed / {stats.total_period} total this period
          </span>
        )}
      </div>

      {/* Task list */}
      {tasks.length > 0 ? (
        <div className="-mx-6 divide-y divide-border/30">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-4 px-6 py-2.5 transition-colors',
                task.overdue ? 'bg-rose-500/[0.03]' : 'hover:bg-secondary/20',
              )}
            >
              {/* Status indicator */}
              {task.overdue ? (
                <Clock className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/20" />
              )}

              {/* Subject */}
              <span className={cn(
                'min-w-0 flex-1 truncate text-[13px]',
                task.overdue ? 'font-medium text-rose-500' : 'text-foreground',
              )}>
                {task.subject}
              </span>

              {/* Related Opportunity — name + value */}
              <span className="max-w-[280px] truncate text-[12px] text-muted-foreground">
                {task.related_to || '\u2014'}
                {task.opp_amount != null && task.opp_amount > 0 && (
                  <span className="ml-1.5 tabular-nums font-medium text-foreground/70">
                    ({formatCurrency(task.opp_amount, true)})
                  </span>
                )}
              </span>

              {/* Due date / Overdue badge */}
              <span className={cn(
                'w-28 shrink-0 text-right tabular-nums text-[12px]',
                task.overdue ? 'font-semibold text-rose-500' : 'text-muted-foreground',
              )}>
                {task.overdue && task.days_overdue != null
                  ? `${task.days_overdue}d overdue`
                  : task.due_date
                  ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
                  : '\u2014'}
              </span>

              {/* SF link */}
              {task.what_id && (
                <a
                  href={`https://aaawcny.my.salesforce.com/${task.what_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary/60 transition-colors hover:text-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
          No open tasks
        </div>
      )}
    </div>
  )
}
