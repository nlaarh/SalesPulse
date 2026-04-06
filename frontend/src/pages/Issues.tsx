/**
 * Issues — Internal bug tracker.
 * Clean card list: title, reporter, meta inline.
 * Status + severity selectable directly on each card (no PIN, no hidden sections).
 * Expand to read description, comments, and add a comment.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bug, RefreshCw, Loader2, ChevronDown, ChevronUp, MessageSquare,
  CheckCircle2, Circle, ExternalLink, AlertTriangle, Info, Bot, Send,
  Plus, X, Calendar, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchIssues, fetchIssue, addIssueComment, updateIssue, submitIssue } from '@/lib/api'
import type { GithubIssue, IssueComment, IssueStatus, IssueSeverity } from '@/lib/api'
import Markdown from '@/components/Markdown'

/* ── Constants ──────────────────────────────────────────────────────────── */

const SEVERITY_OPTIONS = [
  { value: 'high',   label: 'High',   cls: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  { value: 'medium', label: 'Medium', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  { value: 'low',    label: 'Low',    cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
] as const

const STATUS_OPTIONS: { value: IssueStatus; label: string; dot: string }[] = [
  { value: 'backlog',       label: 'Backlog',        dot: 'bg-slate-400' },
  { value: 'acknowledged',  label: 'Acknowledged',   dot: 'bg-blue-400' },
  { value: 'investigating', label: 'Investigating',   dot: 'bg-violet-400' },
  { value: 'in-progress',   label: 'In Progress',    dot: 'bg-amber-400' },
  { value: 'released',      label: 'Fixed',          dot: 'bg-emerald-500' },
  { value: 'closed',        label: 'Closed',         dot: 'bg-slate-400' },
  { value: 'cancelled',     label: "Won't Fix",      dot: 'bg-rose-400' },
]

const VERDICT_MAP: Record<string, { label: string; icon: React.ReactElement; cls: string }> = {
  bug:     { label: 'Bug',          icon: <AlertTriangle className="h-3 w-3" />, cls: 'text-rose-500' },
  not_bug: { label: 'Not a Bug',    icon: <CheckCircle2  className="h-3 w-3" />, cls: 'text-emerald-500' },
  unclear: { label: 'Needs Review', icon: <Info          className="h-3 w-3" />, cls: 'text-amber-500' },
}

function getSev(issue: GithubIssue) {
  return issue.severity || issue.labels?.find(l => ['high','medium','low'].includes(l)) || 'medium'
}
function getStatus(issue: GithubIssue): IssueStatus {
  const s = issue.status || issue.labels?.find(l => l.startsWith('status:'))?.split(':')[1]
  return (s as IssueStatus) || 'backlog'
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60)    return 'just now'
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function isBotComment(c: IssueComment) {
  return c.user === 'github-actions[bot]'
    || c.user.toLowerCase().includes('bot')
    || c.body.startsWith('## 🤖 SalesPulse Bot')
    || c.body.includes('— **SalesPulse Bot**')
}

/* ── Issue Card ─────────────────────────────────────────────────────────── */

function IssueCard({ issue, onRefresh }: { issue: GithubIssue; onRefresh: () => void }) {
  const [open, setOpen]               = useState(false)
  const [detail, setDetail]           = useState<{ body: string; comments: IssueComment[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [comment, setComment]         = useState('')
  const [commenterName, setCommenterName] = useState(localStorage.getItem('sp_reporter_name') || '')
  const [posting, setPosting]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [localSev, setLocalSev]       = useState(getSev(issue))
  const [localStatus, setLocalStatus] = useState<IssueStatus>(getStatus(issue))

  const verdict = issue.triage_verdict ? VERDICT_MAP[issue.triage_verdict] : null
  const sevOpt  = SEVERITY_OPTIONS.find(s => s.value === localSev) ?? SEVERITY_OPTIONS[1]
  const statOpt = STATUS_OPTIONS.find(s => s.value === localStatus) ?? STATUS_OPTIONS[0]

  const loadDetail = useCallback(async (force = false) => {
    if (detail && !force) return
    setLoadingDetail(true)
    try {
      const d = await fetchIssue(issue.number)
      setDetail({ body: d.issue.body, comments: d.comments })
    } catch { /* ignore */ }
    finally { setLoadingDetail(false) }
  }, [detail, issue.number])

  const toggle = () => {
    setOpen(v => !v)
    if (!open) loadDetail()
  }

  const applyUpdate = async (opts: { status?: IssueStatus; severity?: IssueSeverity }) => {
    setSaving(true)
    try {
      await updateIssue(issue.number, '', opts)          // PIN removed — empty string accepted
      if (opts.severity) setLocalSev(opts.severity)
      if (opts.status)   setLocalStatus(opts.status)
      if (open) setTimeout(() => loadDetail(true), 1200)
      if (opts.status === 'released' || opts.status === 'closed') onRefresh()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    try {
      await addIssueComment(issue.number, comment.trim(), commenterName.trim() || 'User')
      setComment('')
      setTimeout(() => loadDetail(true), 800)
    } catch { /* ignore */ }
    finally { setPosting(false) }
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card transition-all',
      issue.state === 'closed' ? 'border-border/40 opacity-60' : 'border-border',
    )}>
      {/* ── Card header ── */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* State icon */}
        <button onClick={toggle} className="mt-0.5 shrink-0">
          {issue.state === 'closed'
            ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
            : <Circle       className="h-4.5 w-4.5 text-primary" />}
        </button>

        {/* Title + meta */}
        <button onClick={toggle} className="min-w-0 flex-1 text-left">
          <p className="text-[14px] font-semibold text-foreground leading-snug">
            {issue.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />{timeAgo(issue.created_at)}
            </span>
            {issue.reporter && <><span>·</span><span>{issue.reporter}</span></>}
            {issue.page     && <><span>·</span><span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">{issue.page}</span></>}
            <span>·</span>
            <span className="font-medium">#{issue.number}</span>
            {issue.comments > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />{issue.comments}
              </span>
            )}
            {verdict && (
              <span className={cn('flex items-center gap-1 font-semibold', verdict.cls)}>
                {verdict.icon}{verdict.label}
              </span>
            )}
          </div>
        </button>

        {/* Severity select */}
        <div className="relative shrink-0">
          <select
            value={localSev}
            onChange={e => applyUpdate({ severity: e.target.value as IssueSeverity })}
            disabled={saving}
            className={cn(
              'cursor-pointer appearance-none rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors focus:outline-none',
              sevOpt.cls,
            )}
          >
            {SEVERITY_OPTIONS.map(s => (
              <option key={s.value} value={s.value} className="text-foreground bg-background">
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status select */}
        <div className="relative shrink-0">
          <select
            value={localStatus}
            onChange={e => applyUpdate({ status: e.target.value as IssueStatus })}
            disabled={saving}
            className="cursor-pointer appearance-none rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* GitHub link */}
        <a
          href={issue.html_url || issue.url}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          title="View on GitHub"
        >
          <ExternalLink className="h-4 w-4" />
        </a>

        {/* Expand toggle */}
        <button onClick={toggle} className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-border px-4 pb-5 pt-4 space-y-5">
          {loadingDetail && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {detail && (
            <>
              {/* Description */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </p>
                <div className="rounded-lg bg-muted/30 px-4 py-3">
                  <Markdown compact>{detail.body || '_No description_'}</Markdown>
                </div>
              </div>

              {/* Comments */}
              {detail.comments.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Comments ({detail.comments.length})
                  </p>
                  <div className="space-y-2">
                    {detail.comments.map(c => {
                      const isBot = isBotComment(c)
                      return (
                        <div key={c.id} className={cn(
                          'rounded-lg border px-4 py-3',
                          isBot ? 'border-violet-500/20 bg-violet-500/5' : 'border-border bg-muted/20',
                        )}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {isBot && <Bot className="h-3.5 w-3.5 text-violet-400" />}
                              <span className={cn('text-[12px] font-semibold',
                                isBot ? 'text-violet-400' : 'text-foreground')}>
                                {isBot ? '🤖 SalesPulse Bot' : c.user}
                              </span>
                              {isBot && (
                                <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
                                  BOT
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                          </div>
                          <Markdown compact>
                            {c.body.replace(/^##\s*🤖\s*SalesPulse Bot\s*\n+/, '')}
                          </Markdown>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Add comment */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Add Comment
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={commenterName}
                    onChange={e => { setCommenterName(e.target.value); localStorage.setItem('sp_reporter_name', e.target.value) }}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Write a comment… (Cmd+Enter to send)"
                    rows={3}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment() }}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    onClick={postComment}
                    disabled={posting || !comment.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Post Comment
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── New Issue Modal ────────────────────────────────────────────────────── */

function NewIssueModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [title, setTitle]   = useState('')
  const [desc, setDesc]     = useState('')
  const [sev, setSev]       = useState<'low' | 'medium' | 'high'>('medium')
  const [page, setPage]     = useState('')
  const [name, setName]     = useState(localStorage.getItem('sp_reporter_name') || '')
  const [email, setEmail]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')

  const submit = async () => {
    if (!title.trim() || !desc.trim()) { setErr('Title and description are required'); return }
    setBusy(true); setErr('')
    try {
      if (name.trim()) localStorage.setItem('sp_reporter_name', name.trim())
      await submitIssue({ description: `${title.trim()}\n\n${desc.trim()}`, severity: sev, page, reporter: name || 'User', email })
      onSubmitted()
    } catch {
      setErr('Failed to submit. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-bold text-foreground">New Issue</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-5">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Issue title *"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            placeholder="Describe the issue in detail — what happened, what you expected… *"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Severity</label>
              <select value={sev} onChange={e => setSev(e.target.value as typeof sev)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Page / Area</label>
              <input value={page} onChange={e => setPage(e.target.value)}
                placeholder="e.g. Dashboard, Advisor page…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Your Name</label>
              <input value={name} onChange={e => { setName(e.target.value); localStorage.setItem('sp_reporter_name', e.target.value) }}
                placeholder="Name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Email (for updates)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          {err && <p className="text-[13px] text-rose-500">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !title.trim() || !desc.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Submit Issue
          </button>
        </div>
      </div>
    </div>
  )
}

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
