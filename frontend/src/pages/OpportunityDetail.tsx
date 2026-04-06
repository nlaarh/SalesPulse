/**
 * OpportunityDetail — Full deal view with AI analysis + activity timeline.
 *
 * Navigated to from At-Risk Pipeline cards via /opportunity/:id
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchOpportunityDetail } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, DollarSign, Calendar, User, Building2,
  AlertTriangle, CheckCircle2, Clock, ChevronRight,
  Sparkles, GitBranch, CheckSquare, CalendarDays, Loader2,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface TimelineItem {
  kind: 'stage' | 'task' | 'event'
  date: string
  data: Record<string, unknown>
}

interface OppDetail {
  id: string
  name: string
  stage: string
  amount: number
  close_date: string
  probability: number
  forecast_category: string
  push_count: number
  description: string
  created_date: string
  last_activity: string
  owner: string
  account: string
  record_type: string
  type: string
  lead_source: string
  score: number
  score_reasons: string[]
  timeline: TimelineItem[]
  ai_analysis: string
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatDate(iso: string | null | undefined, short = false): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  try {
    const d = new Date(iso.slice(0, 10))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.floor((today.getTime() - d.getTime()) / 86400000)
  } catch {
    return null
  }
}

function stageColor(stage: string) {
  const s = stage.toLowerCase()
  if (s.includes('won') || s.includes('closed won')) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
  if (s.includes('lost') || s.includes('closed lost')) return 'text-rose-500 bg-rose-500/10 border-rose-500/20'
  if (s.includes('proposal') || s.includes('present')) return 'text-primary bg-primary/10 border-primary/20'
  if (s.includes('qualify') || s.includes('discovery')) return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
  return 'text-muted-foreground bg-secondary/40 border-border'
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-500'
  if (score >= 40) return 'text-amber-500'
  return 'text-rose-500'
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[12px] font-medium text-right">{value || '—'}</span>
    </div>
  )
}

function TimelineCard({ item }: { item: TimelineItem }) {
  const d = item.data
  if (item.kind === 'stage') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="mt-1 w-px flex-1 bg-border/40" />
        </div>
        <div className="pb-4 min-w-0">
          <p className="text-[11px] text-muted-foreground">{formatDate(d.date as string)}</p>
          <p className="mt-0.5 text-[12px] font-semibold">Stage → <span className="text-primary">{d.stage as string}</span></p>
          {(d.amount as number) > 0 && (
            <p className="text-[11px] text-muted-foreground">Amount: {formatCurrency(d.amount as number, true)}</p>
          )}
          {d.by && <p className="text-[11px] text-muted-foreground">By {d.by as string}</p>}
        </div>
      </div>
    )
  }

  if (item.kind === 'task') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            d.closed ? 'bg-emerald-500/10' : 'bg-amber-500/10')}>
            <CheckSquare className={cn('h-3.5 w-3.5', d.closed ? 'text-emerald-500' : 'text-amber-500')} />
          </div>
          <div className="mt-1 w-px flex-1 bg-border/40" />
        </div>
        <div className="pb-4 min-w-0">
          <p className="text-[11px] text-muted-foreground">{formatDate(d.date as string)}</p>
          <p className="mt-0.5 text-[12px] font-semibold truncate">{d.subject as string || 'Task'}</p>
          <p className="text-[11px] text-muted-foreground">
            {d.status as string} {d.priority && d.priority !== 'Normal' ? `· ${d.priority as string} priority` : ''}
            {d.owner ? ` · ${d.owner as string}` : ''}
          </p>
          {d.description && (
            <p className="mt-1 text-[11px] text-muted-foreground/70 line-clamp-2">{d.description as string}</p>
          )}
        </div>
      </div>
    )
  }

  // event
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/10">
          <CalendarDays className="h-3.5 w-3.5 text-cyan-500" />
        </div>
        <div className="mt-1 w-px flex-1 bg-border/40" />
      </div>
      <div className="pb-4 min-w-0">
        <p className="text-[11px] text-muted-foreground">{formatDate(d.date as string)}</p>
        <p className="mt-0.5 text-[12px] font-semibold truncate">{d.subject as string || 'Event'}</p>
        {d.owner && <p className="text-[11px] text-muted-foreground">{d.owner as string}</p>}
        {d.description && (
          <p className="mt-1 text-[11px] text-muted-foreground/70 line-clamp-2">{d.description as string}</p>
        )}
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<OppDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    fetchOpportunityDetail(id)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">Could not load opportunity details.</p>
        <button onClick={() => navigate(-1)} className="text-xs text-primary underline">Go back</button>
      </div>
    )
  }

  const daysOverdue = detail.close_date ? daysSince(detail.close_date) : null
  const isOverdue = (daysOverdue ?? 0) > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="animate-enter flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', stageColor(detail.stage))}>
              {detail.stage}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-rose-500">
                <AlertTriangle className="h-3 w-3" />
                {daysOverdue}d overdue
              </span>
            )}
            {detail.push_count > 0 && (
              <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-500">
                Pushed {detail.push_count}×
              </span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight leading-snug">{detail.name}</h1>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {detail.owner}{detail.account ? ` · ${detail.account}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(detail.amount, true)}</p>
          <p className="text-[11px] text-muted-foreground">{detail.probability}% probability</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Left: Deal Info */}
        <div className="card-premium p-4 space-y-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">Deal Details</h3>
          <KVRow label="Close Date" value={
            <span className={cn(isOverdue ? 'text-rose-500' : '')}>
              {formatDate(detail.close_date)}
              {daysOverdue !== null && isOverdue && ` (${daysOverdue}d ago)`}
            </span>
          } />
          <KVRow label="Owner" value={<span className="flex items-center gap-1"><User className="h-3 w-3" />{detail.owner}</span>} />
          <KVRow label="Account" value={<span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{detail.account}</span>} />
          <KVRow label="Record Type" value={detail.record_type} />
          <KVRow label="Type" value={detail.type} />
          <KVRow label="Lead Source" value={detail.lead_source} />
          <KVRow label="Forecast" value={detail.forecast_category} />
          <KVRow label="Created" value={formatDate(detail.created_date)} />
          <KVRow label="Last Activity" value={
            detail.last_activity
              ? `${formatDate(detail.last_activity)} (${daysSince(detail.last_activity)}d ago)`
              : '—'
          } />
          <KVRow label="Health Score" value={
            <span className={cn('font-bold', scoreColor(detail.score))}>
              {detail.score}/100
            </span>
          } />
        </div>

        {/* Middle: AI Analysis */}
        <div className="card-premium p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Analysis
          </h3>
          {detail.ai_analysis ? (
            <p className="text-[13px] leading-relaxed text-foreground/80">{detail.ai_analysis}</p>
          ) : (
            <p className="text-[12px] text-muted-foreground italic">AI analysis not available. Configure an AI provider in Settings.</p>
          )}

          {detail.score_reasons.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground/60">Score Factors</p>
              <div className="space-y-1">
                {detail.score_reasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-primary/50" />
                    <span className="text-[11px] text-muted-foreground">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.description && (
            <div className="mt-4">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground/60">Description</p>
              <p className="text-[11px] text-muted-foreground line-clamp-4">{detail.description}</p>
            </div>
          )}
        </div>

        {/* Right: Stats */}
        <div className="card-premium p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">Activity Summary</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{detail.timeline.filter(t => t.kind === 'task').length}</p>
              <p className="text-[10px] text-muted-foreground">Tasks</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{detail.timeline.filter(t => t.kind === 'event').length}</p>
              <p className="text-[10px] text-muted-foreground">Events</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{detail.timeline.filter(t => t.kind === 'stage').length}</p>
              <p className="text-[10px] text-muted-foreground">Stage Changes</p>
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className={cn('text-xl font-bold tabular-nums', detail.push_count > 0 ? 'text-amber-500' : '')}>
                {detail.push_count}
              </p>
              <p className="text-[10px] text-muted-foreground">Push-backs</p>
            </div>
          </div>

          {/* Open tasks */}
          {detail.timeline.filter(t => t.kind === 'task' && !(t.data as Record<string, unknown>).closed).length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground/60">Open Tasks</p>
              <div className="space-y-1">
                {detail.timeline
                  .filter(t => t.kind === 'task' && !(t.data as Record<string, unknown>).closed)
                  .slice(0, 5)
                  .map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-amber-500/70" />
                      <span className="text-[11px] truncate">{t.data.subject as string}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Timeline */}
      <div className="card-premium p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Activity Timeline
          <span className="ml-auto text-[11px] text-muted-foreground font-normal">{detail.timeline.length} events</span>
        </h3>
        {detail.timeline.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">No timeline events recorded.</p>
        ) : (
          <div className="columns-3 gap-4">
            {detail.timeline.map((item, i) => (
              <div key={i} className="break-inside-avoid">
                <TimelineCard item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
