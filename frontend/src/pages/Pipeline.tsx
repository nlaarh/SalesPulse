import { useEffect, useMemo, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchPipelineStages, fetchPipelineForecast,
  fetchPipelineVelocity, fetchPipelineSlipping,
  fetchPerformanceFunnel,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { useChartColors } from '@/lib/chart-theme'
import { Loader2, BarChart3, Table2, Sparkles } from 'lucide-react'
import FunnelTab from './pipeline/FunnelTab'
import DetailsTab from './pipeline/DetailsTab'
import SummaryTab from './pipeline/SummaryTab'

/* ── Types ────────────────────────────────────────────────────────────────── */

type Tab = 'charts' | 'details' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'charts', label: 'Charts', icon: BarChart3 },
  { key: 'details', label: 'Details', icon: Table2 },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

/* ── Main Component ──────────────────────────────────────────────────────── */

export default function Pipeline() {
  const { line, period, viewMode, startDate, endDate } = useSales()
  const c = useChartColors()
  const [stages, setStages] = useState<any>(null)
  const [forecast, setForecast] = useState<any>(null)
  const [velocity, setVelocity] = useState<any>(null)
  const [slipping, setSlipping] = useState<any>(null)
  const [funnel, setFunnel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('charts')

  const periodLabel = viewMode === 'custom' && startDate && endDate
    ? `${startDate} → ${endDate}`
    : viewMode === 'month' ? 'Last month'
    : viewMode === 'quarter' ? 'Last 3 months'
    : viewMode === 'ytd' ? `${new Date().getFullYear()} Year to Date`
    : viewMode === 'last-year' ? `${new Date().getFullYear() - 1}`
    : viewMode === '6m' ? 'Last 6 months'
    : 'Last 12 months'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchPipelineStages(line),
      fetchPipelineForecast(line, period, startDate, endDate),
      fetchPipelineVelocity(line),
      fetchPipelineSlipping(line),
      fetchPerformanceFunnel(line, typeof period === 'number' ? period : 12, startDate, endDate),
    ]).then(([s, f, v, sl, fn]) => {
      if (cancelled) return
      setStages(s); setForecast(f); setVelocity(v); setSlipping(sl); setFunnel(fn)
    }).catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [line, period, startDate, endDate])

  const totalPipeline = useMemo(
    () => stages?.stages?.reduce((s: number, st: any) => s + (st.amount || 0), 0) ?? 0,
    [stages],
  )
  const totalDeals = useMemo(
    () => stages?.stages?.reduce((s: number, st: any) => s + (st.count || 0), 0) ?? 0,
    [stages],
  )
  const avgDeal = useMemo(
    () => velocity?.stages?.length
      ? Math.round(velocity.stages.reduce((s: number, st: any) => s + (st.avg_amount || 0), 0) / velocity.stages.length)
      : 0,
    [velocity],
  )

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
  }

  return (
    <div className="space-y-3">
      {/* Header + Tabs */}
      <div className="animate-enter flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">
            {line} Division &middot; {periodLabel}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Pipeline & Forecasting</h1>
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
        <FunnelTab
          totalPipeline={totalPipeline} totalDeals={totalDeals} avgDeal={avgDeal}
          slipping={slipping} stages={stages} forecast={forecast} funnel={funnel} c={c}
        />
      )}
      {tab === 'details' && (
        <DetailsTab stages={stages} slipping={slipping} />
      )}
      {tab === 'summary' && (
        <SummaryTab
          totalPipeline={totalPipeline} totalDeals={totalDeals}
          slipping={slipping} stages={stages} forecast={forecast} line={line as string}
          periodLabel={periodLabel}
        />
      )}
    </div>
  )
}
