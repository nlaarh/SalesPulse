import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { fmtMonth } from '@/lib/formatters'
import { ArrowUpDown, ChevronDown, ChevronUp, Download } from 'lucide-react'
import type { AgentReport, Metric, SortField } from './types'
import { fmtCell } from './types'
import { exportToExcel } from '@/lib/exportExcel'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface DetailsTabProps {
  sorted: AgentReport[]
  showAll: boolean
  setShowAll: (v: boolean) => void
  agents: AgentReport[]
  monthColumns: string[]
  monthTotals: Map<string, Record<Metric, number>>
  divTotals: Record<string, number>
  metric: Metric
  sortField: SortField
  sortAsc: boolean
  toggleSort: (f: SortField) => void
  targetMap?: Map<string, number>
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function DetailsTab({
  sorted, showAll, setShowAll, agents, monthColumns, monthTotals,
  divTotals, metric, sortField, sortAsc, toggleSort, targetMap,
}: DetailsTabProps) {
  const hasTargets = targetMap && targetMap.size > 0
  const isRevenueMetric = metric === 'commission' || metric === 'sales'
  const displayed = showAll ? sorted : sorted.slice(0, 25)

  const handleExport = () => {
    const rows = sorted.map(agent => {
      const monthMap = new Map(agent.months.map(m => [m.month, m]))
      const row: Record<string, unknown> = { Advisor: agent.name }
      monthColumns.forEach(m => {
        const cell = monthMap.get(m)
        row[fmtMonth(m)] = cell ? (cell[metric] ?? 0) : 0
      })
      row['Total'] = agent.totals?.[metric] ?? 0
      if (hasTargets) row['Target'] = targetMap!.get(agent.name) ?? 0
      return row
    })
    exportToExcel(rows, `Monthly_Report_${metric}_${new Date().toISOString().slice(0,10)}`)
  }

  return (
    <div className="card-premium animate-enter overflow-hidden">
      <div className="flex items-center justify-end px-4 py-2 border-b border-border">
        <button onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
          <Download className="h-3.5 w-3.5" />
          Export to Excel
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="sticky left-0 z-10 w-10 bg-card px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">#</th>
              <th
                onClick={() => toggleSort('name')}
                className="sticky left-10 z-10 cursor-pointer bg-card px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 hover:text-foreground"
              >
                <div className="flex items-center gap-1">Advisor<ArrowUpDown className="h-3 w-3" /></div>
              </th>
              {monthColumns.map((m) => (
                <th
                  key={m}
                  onClick={() => toggleSort(m)}
                  className={cn(
                    'cursor-pointer whitespace-nowrap px-2.5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-foreground',
                    sortField === m ? 'text-primary' : 'text-muted-foreground/60',
                  )}
                >
                  <div className="flex items-center justify-end gap-1">
                    {fmtMonth(m)}
                    {sortField === m
                      ? (sortAsc ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)
                      : <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />}
                  </div>
                </th>
              ))}
              <th
                onClick={() => toggleSort('total')}
                className="cursor-pointer whitespace-nowrap border-l border-border px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/70 hover:text-foreground"
              >
                <div className="flex items-center justify-end gap-1">Total<ArrowUpDown className="h-3 w-3" /></div>
              </th>
              {hasTargets && isRevenueMetric && (
                <>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                    Mo Target
                  </th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
                    vs Target
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayed.map((agent, idx) => {
              const monthMap = new Map(agent.months.map((m) => [m.month, m]))
              const totalVal = agent.totals[metric] || 0
              return (
                <tr
                  key={agent.name}
                  className={cn(
                    'border-b transition-colors duration-100',
                    idx % 2 === 0 ? 'border-border/20' : 'border-border/20 bg-secondary/10',
                    'hover:bg-primary/5',
                  )}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 text-center text-[11px] text-muted-foreground/50">{idx + 1}</td>
                  <td className="sticky left-10 z-10 bg-inherit px-3 py-2 text-[12px] font-medium">
                    <Link to={`/agent/${encodeURIComponent(agent.name)}`} className="text-primary transition-colors hover:text-primary/80 hover:underline">
                      {agent.name}
                    </Link>
                  </td>
                  {monthColumns.map((m) => {
                    const d = monthMap.get(m)
                    const val = d ? d[metric] : 0
                    const isActiveSortCol = sortField === m
                    return (
                      <td key={m} className={cn('whitespace-nowrap px-2.5 py-2 text-right', isActiveSortCol && 'bg-primary/4')}>
                        <span className={cn(
                          'tabular-nums text-[11px]',
                          val === 0 ? 'text-muted-foreground/30' : isActiveSortCol ? 'font-semibold text-foreground' : 'text-foreground/80',
                        )}>
                          {val === 0 ? '—' : fmtCell(val, metric)}
                        </span>
                      </td>
                    )
                  })}
                  <td className="whitespace-nowrap border-l border-border px-3 py-2 text-right">
                    <span className="tabular-nums text-[12px] font-semibold">{fmtCell(totalVal, metric)}</span>
                  </td>
                  {hasTargets && isRevenueMetric && <TargetCells name={agent.name} totalVal={totalVal} targetMap={targetMap!} metric={metric} nMonths={monthColumns.length} />}
                </tr>
              )
            })}
            {/* Division totals row */}
            <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
              <td className="sticky left-0 z-10 bg-secondary/30 px-3 py-2.5" />
              <td className="sticky left-10 z-10 bg-secondary/30 px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide text-foreground">Total</td>
              {monthColumns.map((m) => {
                const mt = monthTotals.get(m)
                const val = mt ? mt[metric] : 0
                return (
                  <td key={m} className="whitespace-nowrap px-2.5 py-2.5 text-right">
                    <span className="tabular-nums text-[11px] font-bold text-foreground">{fmtCell(val, metric)}</span>
                  </td>
                )
              })}
              <td className="whitespace-nowrap border-l border-border px-3 py-2.5 text-right">
                <span className="tabular-nums text-[12px] font-bold text-primary">{fmtCell(divTotals[metric] || 0, metric)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {agents.length > 25 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        >
          {showAll
            ? <><ChevronUp className="h-3.5 w-3.5" /> Show top 25</>
            : <><ChevronDown className="h-3.5 w-3.5" /> Show all {agents.length} advisors</>}
        </button>
      )}
    </div>
  )
}

/* ── TargetCells — renders target + vs target columns for a row ─────────── */

function TargetCells({ name, totalVal, targetMap, metric, nMonths }: {
  name: string; totalVal: number; targetMap: Map<string, number>; metric: Metric; nMonths: number
}) {
  const t = targetMap.get(name.toLowerCase())
  if (!t) return (
    <>
      <td className="px-3 py-2 text-right text-[11px] text-muted-foreground/30">—</td>
      <td className="px-3 py-2 text-right text-[11px] text-muted-foreground/30">—</td>
    </>
  )
  const periodTarget = t * nMonths
  const pct = periodTarget > 0 ? (totalVal / periodTarget) * 100 : 0
  return (
    <>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <span className="tabular-nums text-[11px] text-muted-foreground">{fmtCell(t, metric)}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <span className={cn(
          'tabular-nums text-[11px] font-semibold',
          pct >= 100 ? 'text-emerald-500' : pct >= 80 ? 'text-amber-500' : 'text-rose-500',
        )}>
          {pct.toFixed(0)}%
        </span>
      </td>
    </>
  )
}
