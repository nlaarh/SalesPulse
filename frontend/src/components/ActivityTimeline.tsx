import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Clock, ExternalLink, Megaphone, GitMerge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate, fmt$ } from '@/lib/formatters'

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface Transaction {
  id: string; name: string; stage: string; amount: number | null
  commission: number | null; close_date: string | null; created_date: string
  record_type: string; destination: string | null; trip_id: string | null; owner: string | null
  sf_url: string | null
}

export interface Lead {
  id: string; name: string; status: string; is_converted: boolean
  converted_date: string | null; created_date: string
  record_type: string; owner: string | null; lead_source: string | null
  sf_url: string | null
}

type TimelineItem =
  | { kind: 'opp';  date: string; data: Transaction }
  | { kind: 'lead'; date: string; data: Lead }

/* ── Style helpers ──────────────────────────────────────────────────────── */

const RT_COLORS: Record<string, string> = {
  'Travel':              'bg-indigo-500/10 text-indigo-500',
  'Insurance':           'bg-emerald-500/10 text-emerald-600',
  'Medicare':            'bg-rose-500/10 text-rose-500',
  'Membership Services': 'bg-violet-500/10 text-violet-500',
  'Financial Services':  'bg-amber-500/10 text-amber-600',
  'Driver Programs':     'bg-orange-500/10 text-orange-500',
}

function stageColor(stage: string) {
  const s = stage?.toLowerCase() ?? ''
  if (s === 'closed won' || s === 'invoice')  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  if (s === 'closed lost')                    return 'bg-slate-500/15 text-slate-500 border-slate-500/20'
  if (s.includes('process') || s.includes('proposal') || s.includes('pipeline'))
                                               return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
  if (s.includes('qualifying') || s.includes('qualify')) return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
  return 'bg-muted/40 text-muted-foreground border-border'
}

function stageDot(stage: string) {
  const s = stage?.toLowerCase() ?? ''
  if (s === 'closed won' || s === 'invoice') return 'bg-emerald-500'
  if (s === 'closed lost')                   return 'bg-slate-400'
  return 'bg-blue-500'
}

function leadStatusColor(status: string, converted: boolean) {
  if (converted) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  const s = status?.toLowerCase() ?? ''
  if (s.includes('closed') || s.includes('dead')) return 'bg-slate-500/15 text-slate-500 border-slate-500/20'
  if (s.includes('qualified')) return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
  return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function ActivityTimeline({ transactions, leads }: { transactions: Transaction[]; leads: Lead[] }) {
  const [filter, setFilter] = useState<'all' | 'opp' | 'lead'>('all')

  const items = useMemo<TimelineItem[]>(() => {
    const opps: TimelineItem[] = transactions.map(t => ({
      kind: 'opp',
      date: t.close_date || t.created_date,
      data: t,
    }))
    const ls: TimelineItem[] = leads.map(l => ({
      kind: 'lead',
      date: l.converted_date || l.created_date,
      data: l,
    }))
    return [...opps, ...ls]
      .filter(i => filter === 'all' || i.kind === filter)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [transactions, leads, filter])

  const oppCount  = transactions.length
  const leadCount = leads.length

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Activity Timeline</p>
          <span className="text-[10px] text-muted-foreground/40">{items.length} items</span>
        </div>
        <div className="flex gap-1">
          {(['all', 'opp', 'lead'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                filter === f
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground border border-transparent',
              )}>
              {f === 'all' ? `All (${oppCount + leadCount})` : f === 'opp' ? `Opportunities (${oppCount})` : `Leads (${leadCount})`}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground/50">No activity found</p>
      ) : (
        <div className="relative px-5 py-4">
          {/* vertical line */}
          <div className="absolute left-[28px] top-4 bottom-4 w-px bg-border/60" />

          <div className="space-y-4">
            {items.map((item, idx) => item.kind === 'opp' ? (
              <div key={item.data.id + idx} className="flex gap-3 items-start">
                {/* dot */}
                <div className={cn('mt-1 w-3 h-3 rounded-full border-2 border-background shrink-0 z-10', stageDot(item.data.stage))} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    {/* date */}
                    <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap font-mono mt-0.5">
                      {fmtDate(item.data.close_date || item.data.created_date)}
                    </span>
                    {/* type badge */}
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-500/10 text-orange-600 border border-orange-500/20 px-1.5 py-0.5 rounded">
                      Opportunity
                    </span>
                    {/* line badge */}
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium border', RT_COLORS[item.data.record_type] ?? 'bg-muted/30 text-muted-foreground border-border')}>
                      {item.data.record_type}
                    </span>
                    {/* stage */}
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', stageColor(item.data.stage))}>
                      {item.data.stage}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Link to={`/opportunity/${item.data.id}`}
                      className="text-[12px] font-medium text-foreground hover:text-primary transition-colors truncate">
                      {item.data.destination || item.data.name}
                    </Link>
                    {item.data.sf_url && (
                      <a href={item.data.sf_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 hover:text-primary" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
                    {item.data.amount != null && (
                      <span className="font-semibold text-foreground/80">{fmt$(item.data.amount)}</span>
                    )}
                    {item.data.commission != null && (
                      <span>commission {fmt$(item.data.commission)}</span>
                    )}
                    {item.data.owner && <span>· {item.data.owner}</span>}
                    {item.data.created_date && item.data.created_date !== item.date && (
                      <span>· created {fmtDate(item.data.created_date)}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div key={item.data.id + idx} className="flex gap-3 items-start">
                {/* dot */}
                <div className={cn(
                  'mt-1 w-3 h-3 rounded-full border-2 border-background shrink-0 z-10',
                  item.data.is_converted ? 'bg-emerald-500' : 'bg-amber-400',
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap font-mono mt-0.5">
                      {fmtDate(item.data.converted_date || item.data.created_date)}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-violet-500/10 text-violet-600 border border-violet-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Megaphone className="h-2.5 w-2.5" /> Lead
                    </span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium border', RT_COLORS[item.data.record_type] ?? 'bg-muted/30 text-muted-foreground border-border')}>
                      {item.data.record_type}
                    </span>
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', leadStatusColor(item.data.status, item.data.is_converted))}>
                      {item.data.is_converted ? 'Converted ✓' : item.data.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] font-medium text-foreground truncate">{item.data.name}</span>
                    {item.data.sf_url && (
                      <a href={item.data.sf_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 text-muted-foreground/30 hover:text-primary" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
                    {item.data.lead_source && <span>{item.data.lead_source}</span>}
                    {item.data.owner && <span>· {item.data.owner}</span>}
                    <span>· created {fmtDate(item.data.created_date)}</span>
                    {item.data.converted_date && (
                      <span className="flex items-center gap-0.5 text-emerald-600">
                        <GitMerge className="h-2.5 w-2.5" /> converted {fmtDate(item.data.converted_date)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
