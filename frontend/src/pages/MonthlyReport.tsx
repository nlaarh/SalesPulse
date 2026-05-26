import { useEffect, useMemo, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchPerformanceMonthly, fetchTargetsWithActuals } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/MetricTip'
import { Loader2, BarChart3, Table2, Sparkles, RefreshCw } from 'lucide-react'
import type { AgentReport, Metric, SortField, MonthData } from './monthly/types'
import { getMetrics } from './monthly/types'
import ChartsTab from './monthly/ChartsTab'
import DetailsTab from './monthly/DetailsTab'
import SummaryTab from './monthly/SummaryTab'

import DateSelector from '@/components/DateSelector'
import AgentSearch from '@/components/AgentSearch'

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
  const [advisorBranchMap, setAdvisorBranchMap] = useState<Map<string, string>>(new Map())
  const [viewType, setViewType] = useState<'advisor' | 'branch'>('advisor')
  const [retryCount, setRetryCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const forceRefresh = () => { setRetryCount(c => c + 1); setRefreshing(true) }

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
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false) } })
    fetchTargetsWithActuals(line, startDate, endDate)
      .then((td) => {
        if (cancelled) return
        const map = new Map<string, number>()
        const branchMap = new Map<string, string>()
        for (const a of td.advisors) {
          const key = a.name.toLowerCase()
          // Use monthly_target from with-actuals (already accounts for MonthlyAdvisorTarget per-month values)
          if (a.monthly_target != null) map.set(key, a.monthly_target)
          if (a.branch) branchMap.set(key, a.branch)
        }
        setTargetMap(map)
        setAdvisorBranchMap(branchMap)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [line, period, startDate, endDate, retryCount])

  // Aggregate data by branch
  const aggregatedBranches = useMemo(() => {
    const branchMap = new Map<string, AgentReport>()

    agents.forEach((agent) => {
      const branchName = advisorBranchMap.get(agent.name.toLowerCase()) || 'Unassigned'
      if (!branchMap.has(branchName)) {
        branchMap.set(branchName, {
          name: branchName,
          months: monthColumns.map((m) => ({
            month: m,
            leads: 0,
            opps: 0,
            invoiced: 0,
            inv_opp_pct: 0,
            sales: 0,
            commission: 0,
          })),
          totals: {
            leads: 0,
            opps: 0,
            invoiced: 0,
            inv_opp_pct: 0,
            sales: 0,
            commission: 0,
          },
        })
      }

      const br = branchMap.get(branchName)!
      
      // Sum months
      agent.months.forEach((m) => {
        const bm = br.months.find((x) => x.month === m.month)
        if (bm) {
          bm.leads += m.leads
          bm.opps += m.opps
          bm.invoiced += m.invoiced
          bm.sales += m.sales
          bm.commission += m.commission
        }
      })

      // Sum totals
      br.totals.leads += agent.totals.leads
      br.totals.opps += agent.totals.opps
      br.totals.invoiced += agent.totals.invoiced
      br.totals.sales += agent.totals.sales
      br.totals.commission += agent.totals.commission
    })

    // Recompute inv_opp_pct for branch months and totals
    branchMap.forEach((br) => {
      br.months.forEach((bm) => {
        bm.inv_opp_pct = bm.opps > 0 ? Math.round(bm.invoiced / bm.opps * 100 * 10) / 10 : 0
      })
      br.totals.inv_opp_pct = br.totals.opps > 0 ? Math.round(br.totals.invoiced / br.totals.opps * 100 * 10) / 10 : 0
    })

    return Array.from(branchMap.values())
  }, [agents, advisorBranchMap, monthColumns])

  const branchTargetMap = useMemo(() => {
    const map = new Map<string, number>()
    agents.forEach((agent) => {
      const branchName = advisorBranchMap.get(agent.name.toLowerCase()) || 'Unassigned'
      const target = targetMap.get(agent.name.toLowerCase()) || 0
      map.set(branchName.toLowerCase(), (map.get(branchName.toLowerCase()) || 0) + target)
    })
    return map
  }, [agents, advisorBranchMap, targetMap])

  const activeItems = viewType === 'advisor' ? agents : aggregatedBranches
  const activeTargetMap = viewType === 'advisor' ? targetMap : branchTargetMap
  const isInsurance = line.toLowerCase() === 'insurance'
  const displayMetrics = getMetrics(isInsurance)

  // Sorting logic (shared across tabs)
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(field === 'name') }
  }

  const sorted = useMemo(() => [...activeItems].sort((a, b) => {
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
  }), [activeItems, sortField, sortAsc, metric])

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
    <div className="space-y-4">
      {/* Row 1: Title, DateSelector, Search & Refresh */}
      <div className="animate-enter flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[12px] font-medium text-muted-foreground">
              {line} Division &middot; {viewType === 'advisor' ? `${agents.length} advisors` : `${aggregatedBranches.length} branches`} &middot; {monthColumns.length} months
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
              Monthly Report
              <span className="ml-2 text-lg font-semibold text-primary/60">— {displayMetrics.find(m => m.key === metric)?.label ?? metric}</span>
            </h1>
          </div>
          <DateSelector />

          {/* View Type Toggle */}
          <div className="flex rounded-lg border border-border p-0.5 bg-secondary/50">
            <button
              onClick={() => setViewType('advisor')}
              className={cn(
                'px-3 py-1 text-[11px] font-semibold rounded-md transition-all',
                viewType === 'advisor' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Advisors
            </button>
            <button
              onClick={() => setViewType('branch')}
              className={cn(
                'px-3 py-1 text-[11px] font-semibold rounded-md transition-all',
                viewType === 'branch' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Branches
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AgentSearch />
          <button
            onClick={forceRefresh}
            disabled={refreshing}
            title="Force refresh from source"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Row 2: Metric & Tab Selectors (Combined/Horizontal on one line) */}
      <div className="animate-enter flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-2.5">
          <Tip text={displayMetrics.find(m => m.key === metric)?.tip ?? ''} />
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
            {displayMetrics.map((m) => (
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
        </div>

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

      {/* Tab Content */}
      {tab === 'charts' && (
        <ChartsTab
          agents={activeItems}
          monthColumns={monthColumns}
          monthTotals={monthTotals}
          divTotals={divTotals}
          metric={metric}
          viewType={viewType}
          targetMap={activeTargetMap}
          line={line}
        />
      )}
      {tab === 'details' && (
        <DetailsTab
          sorted={sorted} showAll={showAll} setShowAll={setShowAll}
          monthColumns={monthColumns} monthTotals={monthTotals} divTotals={divTotals}
          metric={metric} sortField={sortField} sortAsc={sortAsc} toggleSort={toggleSort}
          targetMap={activeTargetMap} viewType={viewType}
        />
      )}
      {tab === 'summary' && (
        <SummaryTab agents={activeItems} monthColumns={monthColumns} divTotals={divTotals} metric={metric} line={line} periodLabel={periodLabel} viewType={viewType} />
      )}
    </div>
  )
}
