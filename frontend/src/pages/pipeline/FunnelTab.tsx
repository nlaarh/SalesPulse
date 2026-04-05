import { formatCurrency, formatNumber } from '@/lib/utils'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import KPICard from '@/components/KPICard'
import { Tip, TIPS } from '@/components/MetricTip'
import FunnelChart from '@/components/FunnelChart'
import {
  Layers, TrendingUp, Timer, AlertTriangle,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface FunnelTabProps {
  totalPipeline: number
  totalDeals: number
  avgDeal: number
  slipping: any
  stages: any
  forecast: any
  funnel: any
  c: ReturnType<typeof useChartColors>
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function FunnelTab({ totalPipeline, totalDeals, avgDeal, slipping, stages, forecast, funnel, c }: FunnelTabProps) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Active Pipeline" value={formatCurrency(totalPipeline, true)} icon={<Layers className="h-4 w-4" />} className="stagger-1" tip={TIPS.activePipeline} />
        <KPICard title="Open Deals" value={formatNumber(totalDeals)} subtitle="Closing in next 12 months" icon={<TrendingUp className="h-4 w-4" />} className="stagger-2" tip={TIPS.openDeals} />
        <KPICard title="Avg Deal Value" value={formatCurrency(avgDeal, true)} icon={<Timer className="h-4 w-4" />} className="stagger-3" tip={TIPS.avgDealValue} />
        <KPICard
          title="Past-Due Deals"
          value={`${slipping?.count ?? 0}`}
          subtitle={`${formatCurrency(slipping?.total_at_risk ?? 0, true)} past close date`}
          icon={<AlertTriangle className="h-4 w-4" />}
          className="stagger-4"
          tip={TIPS.pastDue}
        />
      </div>

      {/* 3D Horizontal Sales Funnel (shared component) */}
      {funnel?.steps?.length > 0 && (
        <div className="card-premium animate-enter">
          <FunnelChart funnel={funnel} variant="full" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stage Bar Chart */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Active Pipeline by Stage<Tip text={TIPS.pipelineByStage} /></h2>
            <span className="text-[11px] text-muted-foreground">Deals closing today → next 12 months</span>
          </div>
          <div className="p-5">
            {stages?.stages?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stages.stages} layout="vertical">
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="stage" width={120} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [formatCurrency(Number(v), true), 'Booking Value']} />
                  <Bar dataKey="amount" fill={c.primary} radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No active pipeline deals</div>}
          </div>
        </div>

        {/* Forecast Trend */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Monthly Won Bookings & Close Rate<Tip text={TIPS.wonBookingsCloseRate} /></h2>
            <span className="text-[11px] text-muted-foreground">Closed Won deals by month</span>
          </div>
          <div className="p-5">
            {forecast?.months?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecast.months}>
                  <defs>
                    <linearGradient id="wonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                  <XAxis
                    dataKey="label" axisLine={false} tickLine={false}
                    tick={{ fill: c.tick, fontSize: 11 }}
                    tickFormatter={(v: string) => { const p = v.split('-'); return `${p[1]}/${p[0]?.slice(2)}` }}
                    interval="preserveStartEnd"
                  />
                  <YAxis yAxisId="rev" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}K`} width={55} />
                  <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={40} />
                  <Tooltip
                    contentStyle={tooltipStyle(c)}
                    formatter={((v: number, name: string) => [
                      name === 'Won Bookings' ? formatCurrency(Number(v), true) : `${Number(v).toFixed(1)}%`,
                      name,
                    ]) as any}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: c.tick }} />
                  <Area yAxisId="rev" type="monotone" dataKey="won_revenue" stroke={c.primary} strokeWidth={2} fill="url(#wonGrad)" dot={false} name="Won Bookings" />
                  <Area yAxisId="pct" type="monotone" dataKey="close_rate" stroke={c.secondary} strokeWidth={1.5} fill="transparent" dot={false} name="Close Rate %" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
