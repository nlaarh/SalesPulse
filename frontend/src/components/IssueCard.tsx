import { useState, useCallback } from 'react'
import {
  Loader2, ChevronDown, ChevronUp, MessageSquare,
  CheckCircle2, Circle, ExternalLink, Bot, Send,
  X, Calendar, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchIssue, addIssueComment, updateIssue } from '@/lib/api'
import type { GithubIssue, IssueComment, IssueStatus, IssueSeverity } from '@/lib/issueConfig'
import {
  SEVERITY_OPTIONS, STATUS_OPTIONS, VERDICT_MAP,
  getSev, getStatus, timeAgo, isBotComment, extractDescription,
} from '@/lib/issueConfig'
import Markdown from '@/components/Markdown'

export default function IssueCard({ issue, onRefresh }: { issue: GithubIssue; onRefresh: () => void }) {
  const [open, setOpen]               = useState(false)
  const [detail, setDetail]           = useState<{ body: string; comments: IssueComment[] } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [comment, setComment]         = useState('')
  const [commenterName, setCommenterName] = useState(localStorage.getItem('sp_reporter_name') || '')
  const [posting, setPosting]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [localSev, setLocalSev]       = useState(getSev(issue))
  const [localStatus, setLocalStatus] = useState<IssueStatus>(getStatus(issue))
  const [editMode, setEditMode]       = useState(false)
  const [editTitle, setEditTitle]     = useState(issue.title)
  const [editBody, setEditBody]       = useState('')
  const [editSaving, setEditSaving]   = useState(false)

  const verdict = issue.triage_verdict ? VERDICT_MAP[issue.triage_verdict] : null
  const sevOpt  = SEVERITY_OPTIONS.find(s => s.value === localSev) ?? SEVERITY_OPTIONS[1]

  const loadDetail = useCallback(async (force = false) => {
    if (detail && !force) return
    setLoadingDetail(true)
    setDetailError(false)
    try {
      const d = await fetchIssue(issue.number)
      setDetail({ body: d.issue.body, comments: d.comments })
      if (!editBody) setEditBody(d.issue.body)
    } catch {
      setDetailError(true)
    } finally {
      setLoadingDetail(false)
    }
  }, [detail, issue.number, editBody])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) loadDetail()
  }

  const applyUpdate = async (opts: { status?: IssueStatus; severity?: IssueSeverity }) => {
    setSaving(true)
    try {
      await updateIssue(issue.number, '', opts)
      if (opts.severity) setLocalSev(opts.severity)
      if (opts.status)   setLocalStatus(opts.status)
      if (open) setTimeout(() => loadDetail(true), 1200)
      if (opts.status === 'released' || opts.status === 'closed') onRefresh()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editTitle.trim()) return
    setEditSaving(true)
    try {
      await updateIssue(issue.number, '', { title: editTitle, body: editBody })
      setEditMode(false)
      setTimeout(() => loadDetail(true), 800)
    } catch { /* ignore */ }
    finally { setEditSaving(false) }
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
      {/* ── Card header — entire row is clickable for expand ── */}
      <div
        onClick={toggle}
        className="flex cursor-pointer items-start gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors rounded-xl"
      >
        {/* State icon */}
        <div className="mt-0.5 shrink-0">
          {issue.state === 'closed'
            ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
            : <Circle       className="h-4.5 w-4.5 text-primary" />}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1 text-left">
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
        </div>

        {/* Severity select — stop propagation so it doesn't toggle expand */}
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <select
            value={localSev}
            onChange={e => applyUpdate({ severity: e.target.value as IssueSeverity })}
            disabled={saving}
            className={cn(
              'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors focus:outline-none',
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

        {/* Status select — stop propagation so it doesn't toggle expand */}
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <select
            value={localStatus}
            onChange={e => applyUpdate({ status: e.target.value as IssueStatus })}
            disabled={saving}
            className="cursor-pointer rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* GitHub link — stop propagation */}
        <a
          href={issue.html_url}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          title="View on GitHub"
        >
          <ExternalLink className="h-4 w-4" />
        </a>

        {/* Edit toggle — stop propagation */}
        <button
          onClick={e => { e.stopPropagation(); setEditMode(v => !v); if (!open) { setOpen(true); loadDetail() } }}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title={editMode ? 'Cancel edit' : 'Edit issue'}
        >
          {editMode ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>

        {/* Expand toggle */}
        <div className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-border px-4 pb-5 pt-4 space-y-5">
          {loadingDetail && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {detailError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-500">
              Failed to load issue details. Please try again.
            </p>
          )}

          {detail && (
            <>
              {/* Edit mode form */}
              {editMode && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Edit Issue</p>
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={5}
                    placeholder="Description…"
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={editSaving || !editTitle.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                      Save Changes
                    </button>
                    <button onClick={() => setEditMode(false)}
                      className="rounded-lg border border-border px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Description — strip GitHub metadata header, show only user text */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </p>
                <div className="rounded-lg bg-muted/30 px-4 py-3">
                  {extractDescription(detail.body)
                    ? <Markdown compact>{extractDescription(detail.body)}</Markdown>
                    : <p className="text-[13px] italic text-muted-foreground">No description</p>
                  }
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
                          <div className="mb-2 flex items-center justify-between">
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
