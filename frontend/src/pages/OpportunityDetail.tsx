/**
 * OpportunityDetail — Full deal view with visual pipeline, AI analysis, and activity timeline.
 * Navigated to from At-Risk Pipeline cards via /opportunity/:id
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { fetchOpportunityDetail, emailOpportunity } from '@/lib/api'
import EmailPopover from '@/components/EmailPopover'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Markdown from '@/components/Markdown'
import {
  ArrowLeft, User, Building2,
  AlertTriangle, CheckCircle2, Clock,
  Sparkles, GitBranch, CheckSquare, CalendarDays, Loader2,
  ChevronRight, RefreshCw, ChevronRight as Arrow, Printer,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface StageHistory {
  stage: string; amount: number; close_date: string; date: string; by: string
}
interface TaskItem {
  type: 'task'; subject: string; status: string; due: string
  description: string; priority: string; date: string; owner: string; closed: boolean
}
interface EventItem {
  type: 'event'; subject: string; start: string; end: string
  description: string; date: string; owner: string; all_day: boolean
}
interface TimelineItem {
  kind: 'stage' | 'task' | 'event'
  date: string
  data: StageHistory | TaskItem | EventItem
}
interface OppDetail {
  id: string; name: string; stage: string; amount: number
  close_date: string; probability: number; forecast_category: string
  push_count: number; description: string; created_date: string
  last_activity: string; last_stage_change: string
  owner: string; account: string; account_id: string
  account_member_status: string | null; account_member_since: string | null
  account_coverage: string | null; account_mpi: number | null
  record_type: string; type: string; lead_source: string
  commission: number | null; destination: string | null
  trip_id: string | null; num_traveling: number | null
  score: number; score_reasons: string[]
  history: StageHistory[]; tasks: TaskItem[]; events: EventItem[]
  timeline: TimelineItem[]; ai_analysis: string
}

/* ── Pipeline stage order ─────────────────────────────────────────────────── */

const LOST_STAGES = ['Closed Lost', 'Dead']

function buildStageFlow(history: StageHistory[], currentStage: string): {
  stage: string; entered: string | null; exitedTo: string | null; daysInStage: number | null
}[] {
  // Build unique visited stages in order of first visit
  const visited: { stage: string; date: string }[] = []
  const seen = new Set<string>()
  for (const h of [...history].reverse()) {
    if (!seen.has(h.stage)) {
      seen.add(h.stage)
      visited.push({ stage: h.stage, date: h.date })
    }
  }
  // Ensure current stage is in the list
  if (!seen.has(currentStage)) visited.push({ stage: currentStage, date: '' })

  return visited.map((v, i) => {
    const next = visited[i + 1]
    const enteredDate = v.date ? new Date(v.date) : null
    const exitedDate = next?.date ? new Date(next.date) : null
    const daysInStage = enteredDate && exitedDate
      ? Math.max(0, Math.floor((exitedDate.getTime() - enteredDate.getTime()) / 86400000))
      : enteredDate
        ? Math.floor((Date.now() - enteredDate.getTime()) / 86400000)
        : null
    return {
      stage: v.stage,
      entered: v.date || null,
      exitedTo: next?.stage || null,
      daysInStage,
    }
  })
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDate(iso: string | null | undefined, short = false): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString('en-US', short
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return iso.slice(0, 10) }
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  try {
    const d = new Date(iso.slice(0, 10))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.floor((today.getTime() - d.getTime()) / 86400000)
  } catch { return null }
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-500'
  if (score >= 40) return 'text-amber-500'
  return 'text-rose-500'
}

/* ── Stage Pipeline Visual ───────────────────────────────────────────────── */

function StagePipeline({ history, currentStage }: { history: StageHistory[]; currentStage: string }) {
  const flow = buildStageFlow(history, currentStage)
  const isLost = LOST_STAGES.some(s => s.toLowerCase() === currentStage.toLowerCase())

  return (
    <div className="card-premium px-5 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Deal Journey
        </h3>
        <span className="text-[13px] text-muted-foreground">{flow.length} stages · {history.length} history events</span>
      </div>

      <div className="relative flex items-start gap-0">
        {flow.map((s, i) => {
          const isCurrent = s.stage.toLowerCase() === currentStage.toLowerCase()
          const isPast = !isCurrent && i < flow.length - 1
          const isFirst = i === 0
          return (
            <div key={i} className="flex flex-1 flex-col items-start min-w-0">
              {/* Connector line + node row */}
              <div className="flex w-full items-center">
                {/* Left connector */}
                <div className={cn(
                  'h-0.5 flex-1',
                  isFirst ? 'bg-transparent' : isPast || isCurrent ? 'bg-primary/40' : 'bg-border/40'
                )} />
                {/* Node */}
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold transition-all',
                  isCurrent && !isLost ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30' :
                  isLost && isCurrent ? 'border-rose-500 bg-rose-500 text-white' :
                  isPast ? 'border-primary/40 bg-primary/10 text-primary' :
                  'border-border/40 bg-secondary/40 text-muted-foreground'
                )}>
                  {isPast ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {/* Right connector */}
                <div className={cn(
                  'h-0.5 flex-1',
                  i === flow.length - 1 ? 'bg-transparent' : isPast ? 'bg-primary/40' : 'bg-border/40'
                )} />
              </div>
              {/* Label + time */}
              <div className="mt-2 px-1 text-center w-full">
                <p className={cn(
                  'text-[12px] font-semibold truncate',
                  isCurrent ? 'text-foreground' : isPast ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {s.stage}
                </p>
                {s.daysInStage !== null && (
                  <p className={cn(
                    'text-[11px] font-medium',
                    isCurrent ? 'text-amber-500 font-semibold' : 'text-muted-foreground'
                  )}>
                    {s.daysInStage === 0 ? '<1d' : `${s.daysInStage}d`}
                    {isCurrent ? ' so far' : ''}
                  </p>
                )}
                {s.entered && (
                  <p className="text-[11px] text-muted-foreground">{fmtDate(s.entered, true)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Timeline Card ────────────────────────────────────────────────────────── */

function TimelineCard({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
  let icon = <GitBranch className="h-3.5 w-3.5 text-primary" />
  let iconBg = 'bg-primary/10'
  let headline = ''
  let sub = ''

  if (item.kind === 'stage') {
    const h = item.data as unknown as StageHistory
    headline = `Stage changed → ${h.stage}`
    sub = h.by ? `By ${h.by}` : ''
  } else if (item.kind === 'task') {
    const t = item.data as unknown as TaskItem
    icon = <CheckSquare className={cn('h-3.5 w-3.5', t.closed ? 'text-emerald-500' : 'text-amber-500')} />
    iconBg = t.closed ? 'bg-emerald-500/10' : 'bg-amber-500/10'
    headline = t.subject || 'Task'
    sub = [t.status, t.priority && t.priority !== 'Normal' ? `${t.priority} priority` : '', t.owner].filter(Boolean).join(' · ')
  } else {
    const e = item.data as unknown as EventItem
    icon = <CalendarDays className="h-3.5 w-3.5 text-cyan-500" />
    iconBg = 'bg-cyan-500/10'
    headline = e.subject || 'Event'
    sub = e.owner || ''
  }

  const desc = ((item.data as unknown as Record<string, unknown>).description as string | null) || ''

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', iconBg)}>
          {icon}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border/30 min-h-[20px]" />}
      </div>
      <div className={cn('min-w-0', !isLast && 'pb-5')}>
        <p className="text-[12px] font-medium text-muted-foreground">{fmtDate(item.date)}</p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">{headline}</p>
        {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
        {desc && <p className="mt-0.5 text-[13px] text-muted-foreground line-clamp-2">{desc}</p>}
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [detail, setDetail] = useState<OppDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const load = () => {
    if (!id) return
    setLoading(true)
    setError(false)
    fetchOpportunityDetail(id)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setRetrying(false) })
  }

  useEffect(load, [id])

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
        <p className="text-[12px] text-muted-foreground">Loading opportunity details…</p>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium">Could not load opportunity details</p>
        <p className="text-[12px] text-muted-foreground">Salesforce may be temporarily rate-limited. Wait a moment and retry.</p>
        <div className="flex gap-2">
          <button
            onClick={() => { setRetrying(true); load() }}
            disabled={retrying}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} />
            Retry
          </button>
          <button onClick={() => navigate(-1)} className="rounded-lg border border-border px-4 py-2 text-[12px] font-semibold">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const daysOverdue = detail.close_date ? daysSince(detail.close_date) : null
  const isOverdue = (daysOverdue ?? 0) > 0
  const isLost = LOST_STAGES.some(s => s.toLowerCase() === detail.stage.toLowerCase())
  const isWon = detail.stage.toLowerCase().includes('won')

  return (
    <div className="space-y-3">
      {/* ── HEADER ── */}
      <div className="animate-enter flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              'rounded-full border px-3 py-1 text-[13px] font-semibold',
              isWon ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' :
              isLost ? 'border-rose-500/20 bg-rose-500/10 text-rose-500' :
              'border-primary/20 bg-primary/10 text-primary'
            )}>
              {detail.stage}
            </span>
            {isOverdue && !isWon && !isLost && (
              <span className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[13px] font-semibold text-rose-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {daysOverdue}d overdue
              </span>
            )}
            {detail.push_count > 0 && (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[13px] font-semibold text-amber-500">
                Pushed {detail.push_count}×
              </span>
            )}
          </div>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight leading-snug">{detail.name}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            <span className="flex items-center gap-1 inline-flex">
              <User className="h-3.5 w-3.5 shrink-0" />{detail.owner}
            </span>
          </p>
          {/* Customer mini-card — clickable link to 360 profile */}
          {detail.account && detail.account_id && (
            <Link to={`/customer/${detail.account_id}`}
              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 hover:bg-muted/60 hover:border-primary/30 transition-all group">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
              <div className="text-left">
                <p className="text-[13px] font-semibold text-foreground group-hover:text-primary leading-tight">{detail.account}</p>
                <p className="text-[11px] text-muted-foreground leading-tight flex items-center gap-2 mt-0.5">
                  {detail.account_member_status === 'A'
                    ? <span className="text-emerald-500">● Active member</span>
                    : detail.account_member_status
                    ? <span className="text-muted-foreground">● {detail.account_member_status}</span>
                    : null}
                  {detail.account_coverage && <span>{detail.account_coverage}</span>}
                  {detail.account_member_since && <span>since {new Date(detail.account_member_since).getFullYear()}</span>}
                  {detail.account_mpi != null && <span>MPI {detail.account_mpi}</span>}
                </p>
              </div>
              <Arrow className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary ml-auto shrink-0" />
            </Link>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(detail.amount, true)}</p>
          <p className="text-[14px] font-medium text-muted-foreground">{detail.probability}% probability</p>
          <p className={cn('text-[14px] font-semibold', scoreColor(detail.score))}>
            Health: {detail.score}/100
          </p>
          <div className="flex items-center justify-end gap-1.5 mt-2 print:hidden">
            <button onClick={() => window.print()}
              className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
              <Printer className="h-3 w-3" /> PDF
            </button>
            <EmailPopover
              description={`Opportunity: ${detail.name}`}
              defaultEmail={user?.email ?? ''}
              onSend={async (to) => { await emailOpportunity(id!, to) }}
            />
          </div>
        </div>
      </div>

      {/* ── STAGE PIPELINE ── */}
      <StagePipeline history={detail.history} currentStage={detail.stage} />

      {/* ── 3-COL INFO GRID ── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Deal Details */}
        <div className="card-premium p-4 space-y-0">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Deal Details</h3>
          {[
            ['Close Date', <span className={cn(isOverdue && !isWon ? 'text-rose-500' : '')}>
              {fmtDate(detail.close_date)}{daysOverdue !== null && isOverdue && !isWon ? ` (${daysOverdue}d ago)` : ''}
            </span>],
            ['Owner', detail.owner],
            ['Account', detail.account_id
              ? <Link to={`/customer/${detail.account_id}`} className="text-primary hover:underline">{detail.account}</Link>
              : detail.account],
            ['Record Type', detail.record_type],
            ['Type', detail.type],
            ['Lead Source', detail.lead_source],
            ['Destination', detail.destination],
            ['Trip ID', detail.trip_id],
            ['# Travelers', detail.num_traveling],
            ['Commission', detail.commission ? formatCurrency(detail.commission, true) : null],
            ['Forecast', detail.forecast_category],
            ['Created', fmtDate(detail.created_date)],
            ['Last Activity', detail.last_activity ? `${fmtDate(detail.last_activity)} (${daysSince(detail.last_activity)}d ago)` : null],
          ].map(([label, value]) => value ? (
            <div key={label as string} className="flex items-start justify-between gap-2 border-b border-border/30 py-2 last:border-0">
              <span className="text-[13px] font-medium text-muted-foreground shrink-0">{label}</span>
              <span className="text-[13px] font-semibold text-right">{value}</span>
            </div>
          ) : null)}
        </div>

        {/* AI Analysis */}
        <div className="card-premium p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Analysis
          </h3>
          {detail.ai_analysis ? (
            <Markdown>{detail.ai_analysis}</Markdown>
          ) : (
            <p className="text-[13px] text-muted-foreground italic">Configure an AI provider in Settings to enable deal analysis.</p>
          )}
          {detail.score_reasons.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Score Factors</p>
              {detail.score_reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 py-1">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-[13px] text-muted-foreground">{r}</span>
                </div>
              ))}
            </div>
          )}
          {detail.description && (
            <div className="mt-3 rounded-lg bg-secondary/30 p-3">
              <p className="text-[12px] font-semibold uppercase text-muted-foreground mb-1.5">Notes</p>
              <p className="text-[13px] text-muted-foreground line-clamp-4">{detail.description}</p>
            </div>
          )}
        </div>

        {/* Activity Stats */}
        <div className="card-premium p-4">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Activity Summary</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              ['Tasks', detail.timeline.filter(t => t.kind === 'task').length, 'text-amber-500'],
              ['Events', detail.timeline.filter(t => t.kind === 'event').length, 'text-cyan-500'],
              ['Stage Changes', detail.timeline.filter(t => t.kind === 'stage').length, 'text-primary'],
              ['Push-backs', detail.push_count, detail.push_count > 0 ? 'text-rose-500' : ''],
            ].map(([label, val, color]) => (
              <div key={label as string} className="rounded-lg bg-secondary/40 p-3 text-center">
                <p className={cn('text-xl font-bold tabular-nums', color as string)}>{val as number}</p>
                <p className="text-[12px] font-medium text-muted-foreground">{label as string}</p>
              </div>
            ))}
          </div>
          {/* Open tasks */}
          {(() => {
            const openTasks = detail.tasks.filter(t => !t.closed)
            if (openTasks.length === 0) return null
            return (
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase text-muted-foreground">Open Tasks</p>
                {openTasks.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-1">
                    <CheckSquare className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="text-[13px]">{t.subject}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── TIMELINE ── */}
      <div className="card-premium p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Activity Timeline</h3>
          <span className="ml-auto text-[13px] font-medium text-muted-foreground">{detail.timeline.length} events</span>
        </div>
        {detail.timeline.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">No timeline events recorded.</p>
        ) : (
          <div className="columns-3 gap-6">
            {detail.timeline.map((item, i) => (
              <div key={i} className="break-inside-avoid">
                <TimelineCard item={item} isLast={i === detail.timeline.length - 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
