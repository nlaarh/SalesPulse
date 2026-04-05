import { useEffect, useMemo, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchPerformanceMonthly, fetchTargets } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/MetricTip'
import { Loader2, BarChart3, Table2, Sparkles } from 'lucide-react'
import type { AgentReport, Metric, SortField, MonthData } from './monthly/types'
import { METRICS } from './monthly/types'
import ChartsTab from './monthly/ChartsTab'
import DetailsTab from './monthly/DetailsTab'
import SummaryTab from './monthly/SummaryTab'

/* ── Types ────────────────────────────────────────────────────────────────── */

type Tab = 'charts' | 'details' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'charts', label: 'Charts', icon: BarChart3 },
  { key: 'details', label: 'Details', icon: Table2 },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MonthlyReport() {
  const { line, period, startDate, endDate, viewMode } = useSales()

  const periodLabel = viewMode === 'custom' && startDate && endDate
    ? `${startDate} → ${endDate}`
    : viewMode === 'month' ? 'Last month'
    : viewMode === 'quarter' ? 'Last 3 months'
    : viewMode === '6m' ? 'Last 6 months'
    : viewMode === 'ytd' ? `${new Date().getFullYear()} Year to Date`
    : viewMode === 'last-year' ? `${new Date().getFullYear() - 1}`
    : 'Last 12 months'

  const [agents, setAgents] = useState<AgentReport[]>([])
  const [divTotals, setDivTotals] = useState<Record<string, number>>({})
  const [monthColumns, setMonthColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<Metric>('commission')
  const [sortField, setSortField] = useState<SortField>('total')
  const [sortAsc, setSortAsc] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [tab, setTab] = useState<Tab>('details')
  const [targetMap, setTargetMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPerformanceMonthly(line, period, startDate, endDate)
      .then((data) => {
        if (cancelled) return
        const rawAgents: AgentReport[] = data.agents ?? []
        const monthSet = new Set<string>()
        rawAgents.forEach((a) => a.months.forEach((m) => monthSet.add(m.month)))
        const months = Array.from(monthSet).sort()
        setMonthColumns(months)
        setAgents(rawAgents)
        setDivTotals(data.division_totals ?? {})
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    fetchTargets()
      .then((td) => {
        if (cancelled) return
        const map = new Map<string, number>()
        for (const t of td.targets) {
          if (t.monthly_target != null) map.set(t.sf_name.toLowerCase(), t.monthly_target)
        }
        setTargetMap(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [line, period, startDate, endDate])

  // Sorting logic (shared across tabs)
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(field === 'name') }
  }

  const sorted = useMemo(() => [...agents].sort((a, b) => {
    if (sortField === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    let aVal = 0, bVal = 0
    if (sortField === 'total') {
      aVal = a.totals[metric as keyof typeof a.totals] as number || 0
      bVal = b.totals[metric as keyof typeof b.totals] as number || 0
    } else {
      const aMonth = a.months.find(m => m.month === sortField)
      const bMonth = b.months.find(m => m.month === sortField)
      aVal = aMonth ? (aMonth[metric as keyof MonthData] as number) || 0 : 0
      bVal = bMonth ? (bMonth[metric as keyof MonthData] as number) || 0 : 0
    }
    return sortAsc ? aVal - bVal : bVal - aVal
  }), [agents, sortField, sortAsc, metric])

  const monthTotals = useMemo(() => {
    const totals = new Map<string, Record<Metric, number>>()
    agents.forEach((a) => {
      a.months.forEach((m) => {
        const prev = totals.get(m.month) || { commission: 0, sales: 0, leads: 0, opps: 0, invoiced: 0 }
        prev.commission += m.commission; prev.sales += m.sales
        prev.leads += m.leads; prev.opps += m.opps; prev.invoiced += m.invoiced
        totals.set(m.month, prev)
      })
    })
    return totals
  }, [agents])

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
  }

  return (
    <div className="space-y-3">
      {/* Header + Metric selector + Tabs */}
      <div className="animate-enter flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {line} Division &middot; {agents.length} advisors &middot; {monthColumns.length} months
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
            Advisor Monthly Report
            <span className="ml-2 text-lg font-semibold text-primary/60">— {METRICS.find(m => m.key === metric)?.label ?? metric}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Metric selector */}
          <Tip text={METRICS.find(m => m.key === metric)?.tip ?? ''} />
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200',
                  metric === m.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.short}
              </button>
            ))}
          </div>
          {/* Tab selector */}
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all duration-200',
                    tab === t.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'charts' && (
        <ChartsTab agents={agents} monthColumns={monthColumns} monthTotals={monthTotals} divTotals={divTotals} metric={metric} />
      )}
      {tab === 'details' && (
        <DetailsTab
          sorted={sorted} showAll={showAll} setShowAll={setShowAll} agents={agents}
          monthColumns={monthColumns} monthTotals={monthTotals} divTotals={divTotals}
          metric={metric} sortField={sortField} sortAsc={sortAsc} toggleSort={toggleSort}
          targetMap={targetMap}
        />
      )}
      {tab === 'summary' && (
        <SummaryTab agents={agents} monthColumns={monthColumns} divTotals={divTotals} metric={metric} line={line} periodLabel={periodLabel} />
      )}
    </div>
  )
}
