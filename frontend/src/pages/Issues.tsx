/**
 * Issues — Internal bug tracker.
 * Clean card list: title, reporter, meta inline.
 * Status + severity selectable directly on each card (no PIN, no hidden sections).
 * Expand to read description, comments, and add a comment.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Bug, RefreshCw, Loader2, CheckCircle2, Plus, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchIssues } from '@/lib/api'
import type { GithubIssue } from '@/lib/issueConfig'
import IssueCard from '@/components/IssueCard'
import NewIssueModal from '@/components/NewIssueModal'

/* ── Main Page ──────────────────────────────────────────────────────────── */

export default function Issues() {
  const [filter, setFilter]   = useState<'open' | 'closed' | 'all'>('open')
  const [issues, setIssues]   = useState<GithubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setIssues(await fetchIssues(filter))
    } catch {
      setError('Failed to load issues')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const openCount   = issues.filter(i => i.state === 'open').length
  const closedCount = issues.filter(i => i.state === 'closed').length

  return (
    <div className="space-y-5 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Bug className="h-5 w-5 text-primary" />
          <h1 className="text-[18px] font-bold text-foreground">Issues</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] font-semibold text-primary">
            {openCount} open
          </span>
          {closedCount > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
              {closedCount} closed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {(['open', 'closed', 'all'] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[12px] font-semibold capitalize transition-all',
                  filter === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}>
                {s}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button onClick={load} disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
          </button>

          {/* New Issue */}
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" />
            New Issue
          </button>
        </div>
      </div>

      {/* AI badge */}
      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Zap className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">AI Bot Active</span> — New issues are
          auto-triaged within seconds. Confirmed bugs trigger an email to{' '}
          <span className="font-semibold text-foreground">nlaaroubi@nyaaa.com</span>.
        </p>
      </div>

      {/* Content */}
      {loading && issues.length === 0 && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-500">
          {error}
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
          <p className="text-[14px] font-semibold text-foreground">No {filter === 'all' ? '' : filter} issues</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Nothing to see here — great job!</p>
        </div>
      )}

      <div className="space-y-2.5">
        {issues.map(issue => (
          <IssueCard key={issue.number} issue={issue} onRefresh={load} />
        ))}
      </div>

      {/* New Issue Modal */}
      {showNew && (
        <NewIssueModal
          onClose={() => setShowNew(false)}
          onSubmitted={() => { setShowNew(false); setTimeout(load, 1000) }}
        />
      )}
    </div>
  )
}
