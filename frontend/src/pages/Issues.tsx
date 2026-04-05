/**
 * Issues — Admin bug tracker page.
 * Lists GitHub Issues created via the in-app Report-a-Bug modal.
 * Features: view body + comments, add comment, change status (PIN-protected), AI triage.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bug, RefreshCw, Loader2, ChevronDown, ChevronUp, MessageSquare,
  CheckCircle2, Circle, ExternalLink, Lock, AlertTriangle, Info, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchIssues, fetchIssue, addIssueComment, updateIssue,
} from '@/lib/api'
import type { GithubIssue, IssueComment } from '@/lib/api'

/* ── Helpers ────────────────────────────────────────────────────────────── */

const SEVERITY_MAP: Record<string, { label: string; cls: string }> = {
  high:   { label: 'High',   cls: 'bg-rose-500/20 text-rose-500 border-rose-500/30' },
  medium: { label: 'Medium', cls: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  low:    { label: 'Low',    cls: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' },
}

const VERDICT_MAP: Record<string, { label: string; icon: React.ReactElement; cls: string }> = {
  bug:     { label: 'Confirmed Bug', icon: <AlertTriangle className="h-3 w-3" />, cls: 'text-rose-500' },
  not_bug: { label: 'Not a Bug',     icon: <CheckCircle2 className="h-3 w-3" />,  cls: 'text-emerald-500' },
  unclear: { label: 'Needs Clarity', icon: <Info className="h-3 w-3" />,           cls: 'text-amber-500' },
}

function getSeverity(issue: GithubIssue) {
  const sev = issue.severity || issue.labels.find(l => ['high','medium','low'].includes(l))
  return sev && SEVERITY_MAP[sev] ? SEVERITY_MAP[sev] : SEVERITY_MAP['medium']
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

/* ── Issue Row (expandable) ─────────────────────────────────────────────── */

function IssueRow({ issue, onRefresh }: { issue: GithubIssue; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<{ body: string; comments: IssueComment[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [commenterName, setCommenterName] = useState(
    localStorage.getItem('sp_reporter_name') || ''
  )
  const [submitting, setSubmitting] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)

  const sev = getSeverity(issue)
  const verdict = issue.triage_verdict ? VERDICT_MAP[issue.triage_verdict] : null

  const loadDetail = useCallback(async () => {
    if (detail) return
    setLoading(true)
    try {
      const d = await fetchIssue(issue.number)
      setDetail({ body: d.issue.body, comments: d.comments })
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [detail, issue.number])

  const toggle = () => {
    setOpen(v => !v)
    if (!open) loadDetail()
  }

  const handleComment = async () => {
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      await addIssueComment(issue.number, comment.trim(), commenterName.trim() || 'Admin')
      setComment('')
      const d = await fetchIssue(issue.number)
      setDetail({ body: d.issue.body, comments: d.comments })
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatus = async (action: 'close' | 'reopen') => {
    if (!pin.trim()) { setPinError('PIN required'); return }
    setStatusLoading(true)
    setPinError('')
    try {
      await updateIssue(issue.number, action, pin.trim())
      onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error'
      setPinError(msg.includes('401') ? 'Invalid PIN' : 'Failed')
    } finally {
      setStatusLoading(false)
    }
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card transition-all',
      issue.state === 'closed' ? 'border-border/40 opacity-70' : 'border-border',
    )}>
      {/* Header row */}
      <button className="w-full px-4 py-3.5 text-left" onClick={toggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {issue.state === 'closed'
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{issue.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">
                  #{issue.number} · {timeAgo(issue.created_at)}
                </span>
                {issue.reporter && (
                  <span className="text-[10px] text-muted-foreground">· by {issue.reporter}</span>
                )}
                {issue.page && (
                  <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {issue.page}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn('rounded border px-2 py-0.5 text-[10px] font-semibold', sev.cls)}>
              {sev.label}
            </span>
            {verdict && (
              <span className={cn('flex items-center gap-1 text-[10px] font-semibold', verdict.cls)}>
                {verdict.icon}{verdict.label}
              </span>
            )}
            {issue.comments > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MessageSquare className="h-3 w-3" />{issue.comments}
              </span>
            )}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          {detail && (
            <>
              {/* Body */}
              <div className="rounded-lg bg-muted/30 px-3 py-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {detail.body}
              </div>

              {/* Comments */}
              {detail.comments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    Comments
                  </p>
                  {detail.comments.map(c => (
                    <div key={c.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-foreground">{c.user}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-foreground/80 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Add Comment
                </p>
                <input type="text" value={commenterName}
                  onChange={e => { setCommenterName(e.target.value); localStorage.setItem('sp_reporter_name', e.target.value) }}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Write a comment…" rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                <button onClick={handleComment} disabled={submitting || !comment.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Post Comment
                </button>
              </div>

              {/* Status control */}
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                  Admin Actions
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Lock className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <input type="password" value={pin} onChange={e => { setPin(e.target.value); setPinError('') }}
                      placeholder="PIN"
                      className="w-24 rounded-lg border border-border bg-background pl-7 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                  {issue.state === 'open' ? (
                    <button onClick={() => handleStatus('close')} disabled={statusLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50">
                      {statusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Close Issue
                    </button>
                  ) : (
                    <button onClick={() => handleStatus('reopen')} disabled={statusLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
                      {statusLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Circle className="h-3 w-3" />}
                      Reopen
                    </button>
                  )}
                  <a href={issue.html_url} target="_blank" rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {pinError && <p className="text-[10px] text-rose-500">{pinError}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

export default function Issues() {
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open')
  const [issues, setIssues] = useState<GithubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchIssues(state)
      setIssues(data)
    } catch {
      setError('Failed to load issues')
    } finally {
      setLoading(false)
    }
  }, [state])

  useEffect(() => { load() }, [load])

  const openCount   = issues.filter(i => i.state === 'open').length
  const closedCount = issues.filter(i => i.state === 'closed').length

  return (
    <div className="space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Bug className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Issues</h1>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {openCount} open
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* State filter */}
          <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
            {(['open','closed','all'] as const).map(s => (
              <button key={s} onClick={() => setState(s)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition-all',
                  state === s
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}>
                {s} {s === 'closed' ? `(${closedCount})` : ''}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={cn('h-3.5 w-3.5 text-muted-foreground', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* AI triage badge */}
      <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">AI Bot Active</span> — New issues are
          auto-triaged within seconds. Confirmed bugs trigger an email to <span className="font-semibold">nlaaroubi@nyaaa.com</span>.
        </p>
      </div>

      {/* Content */}
      {loading && issues.length === 0 && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      )}
      {!loading && !error && issues.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
          <p className="text-sm font-semibold text-foreground">No {state === 'all' ? '' : state} issues</p>
          <p className="mt-1 text-xs text-muted-foreground">Nothing to see here — great job!</p>
        </div>
      )}
      <div className="space-y-3">
        {issues.map(issue => (
          <IssueRow key={issue.number} issue={issue} onRefresh={load} />
        ))}
      </div>
    </div>
  )
}
