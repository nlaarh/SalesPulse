/**
 * AdvisorDashboard — Tab 2: Rankings & Data
 *
 * Full leaderboard table with sortable columns, at-risk deals, and lead sources.
 * Pure presentation — receives all data via props.
 */

import { useState } from 'react'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { tooltipStyle } from '@/lib/chart-theme'
import { Tip, TIPS } from '@/components/MetricTip'
import AtRiskDeals from './AtRiskDeals'
import type { Advisor, ChartColors } from './types'
import type { SlippingDeal } from '@/lib/types'
import { Users, ArrowUpDown, ChevronRight } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

/* ── Props ────────────────────────────────────────────────────────────────── */

export interface RankingsTabProps {
  leaders: Advisor[]
  slipping: SlippingDeal[]
  leadSources: { source: string; count: number }[]
  c: ChartColors
  targetMap?: Map<string, number>
  onSelectAdvisor: (name: string) => void
}

/* ── Main ──────────────────────────────────────────────────────────────────── */

export default function RankingsTab({ leaders, slipping, leadSources, c, targetMap, onSelectAdvisor }: RankingsTabProps) {
  return (
    <>
      {/* Full Leaderboard */}
      <div className="animate-enter card-premium overflow-hidden">
        <LeaderboardFull leaders={leaders} onSelect={onSelectAdvisor} targetMap={targetMap} />
      </div>

      {/* At-Risk + Lead Sources */}
      <div className="animate-enter stagger-1 grid grid-cols-2 gap-3">
        <div className="card-premium p-4">
          <AtRiskDeals deals={slipping} onSelectAdvisor={onSelectAdvisor} />
        </div>
        <div className="card-premium p-4">
          <LeadSourcesChart sources={leadSources} c={c} />
        </div>
      </div>
    </>
  )
}

/* ── LeaderboardFull ──────────────────────────────────────────────────────── */

type SortKey = 'commission' | 'bookings' | 'deals' | 'win_rate' | 'avg_deal_size' | 'pipeline_value'

function LeaderboardFull({ leaders, onSelect, targetMap }: {
  leaders: Advisor[]; onSelect: (name: string) => void; targetMap?: Map<string, number>
}) {
  const hasTargets = targetMap && targetMap.size > 0
  const [sortKey, setSortKey] = useState<SortKey>('commission')
  const [sortAsc, setSortAsc] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(false) }
  }

  const sorted = [...leaders].sort((a, b) => {
    const aVal = a[sortKey] || 0
    const bVal = b[sortKey] || 0
    return sortAsc ? aVal - bVal : bVal - aVal
  })

  const displayed = showAll ? sorted : sorted.slice(0, 15)

  const COLS: { key: SortKey; label: string; fmt: (a: Advisor) => string }[] = [
    { key: 'commission',    label: 'Commission', fmt: (a) => a.commission > 0 ? formatCurrency(a.commission, true) : formatCurrency(a.bookings, true) },
    { key: 'bookings',      label: 'Bookings',   fmt: (a) => formatCurrency(a.bookings, true) },
    { key: 'deals',         label: 'Deals',      fmt: (a) => formatNumber(a.deals) },
    { key: 'win_rate',      label: 'Win %',      fmt: (a) => formatPct(a.win_rate) },
    { key: 'avg_deal_size', label: 'Avg Deal',   fmt: (a) => formatCurrency(a.avg_deal_size, true) },
    { key: 'pipeline_value',label: 'Pipeline',   fmt: (a) => formatCurrency(a.pipeline_value, true) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Advisor Leaderboard</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">{leaders.length} advisors</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="w-10 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">#</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Advisor</th>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 hover:text-foreground"
                >
                  <div className="flex items-center justify-end gap-1">
                    {col.label}
                    <ArrowUpDown className={cn('h-2.5 w-2.5', sortKey === col.key && 'text-primary')} />
                  </div>
                </th>
              ))}
              {hasTargets && (
                <th className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                  vs Target
                </th>
              )}
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {displayed.map((a, idx) => (
              <tr
                key={a.name}
                onClick={() => onSelect(a.name)}
                className={cn(
                  'group cursor-pointer border-b transition-colors duration-100',
                  idx % 2 === 0 ? 'border-border/20' : 'border-border/20 bg-secondary/10',
                  'hover:bg-primary/5',
                )}
              >
                <td className="px-3 py-2.5 text-center">
                  <span className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                    a.rank === 1 && 'bg-amber-500/15 text-amber-500',
                    a.rank === 2 && 'bg-slate-400/15 text-slate-400',
                    a.rank === 3 && 'bg-orange-600/15 text-orange-500',
                    a.rank > 3 && 'text-muted-foreground/50',
                  )}>
                    {a.rank}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[12px] font-medium text-primary">{a.name}</td>
                {COLS.map((col) => (
                  <td key={col.key} className={cn(
                    'tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-[12px]',
                    col.key === 'commission' ? 'font-semibold' : 'text-muted-foreground',
                    col.key === 'win_rate' && a.win_rate >= 55 && 'text-emerald-500',
                    col.key === 'win_rate' && a.win_rate < 35 && 'text-rose-500',
                  )}>
                    {col.fmt(a)}
                  </td>
                ))}
                {hasTargets && <TargetCell name={a.name} bookings={a.bookings} targetMap={targetMap!} />}
                <td className="pr-3 py-2.5">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                </td>
              </tr>
            ))}
            {leaders.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 3} className="px-5 py-8 text-center text-[12px] text-muted-foreground">
                  No advisor data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {leaders.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          {showAll ? `Show top 15` : `Show all ${leaders.length} advisors`}
        </button>
      )}
    </div>
  )
}

/* ── LeadSourcesChart ─────────────────────────────────────────────────────── */

function LeadSourcesChart({ sources, c }: {
  sources: { source: string; count: number }[]
  c: ChartColors
}) {
  const top8 = sources.slice(0, 8).map(s => ({
    name: s.source.length > 22 ? s.source.slice(0, 21) + '\u2026' : s.source,
    fullName: s.source,
    count: s.count,
  })).reverse()

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold">Lead Sources<Tip text={TIPS.leadSources} /></h3>
        <span className="text-[11px] text-muted-foreground">Volume by source</span>
      </div>
      {top8.length > 0 ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={top8} layout="vertical" margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 9 }} />
            <Tooltip
              contentStyle={tooltipStyle(c)}
              formatter={(v: unknown) => [formatNumber(v as number), 'Leads']}
              labelFormatter={(name: unknown) => {
                const item = top8.find(d => d.name === (name as string))
                return item ? item.fullName : (name as string)
              }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="count" fill={c.cyan} radius={[0, 4, 4, 0]} barSize={14} fillOpacity={0.75} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[100px] items-center justify-center text-[11px] text-muted-foreground">
          No lead source data
        </div>
      )}
    </div>
  )
}

/* ── TargetCell — renders vs target % for a leaderboard row ────────────── */

function TargetCell({ name, bookings, targetMap }: {
  name: string; bookings: number; targetMap: Map<string, number>
}) {
  const t = targetMap.get(name.toLowerCase())
  if (!t) return <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground/30">—</td>
  const pct = t > 0 ? (bookings / t) * 100 : 0
  return (
    <td className="px-3 py-2.5 text-right">
      <span className={cn(
        'tabular-nums text-[11px] font-semibold',
        pct >= 100 ? 'text-emerald-500' : pct >= 80 ? 'text-amber-500' : 'text-rose-500',
      )}>
        {formatPct(pct)}
      </span>
    </td>
  )
}
