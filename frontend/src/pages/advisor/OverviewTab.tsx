/**
 * AdvisorDashboard — Tab 1: Overview
 *
 * ECharts-powered: gradient area trend, pseudo-3D drillable advisor bars, laggards panel.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { motion } from 'framer-motion'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { fmtAxis, MONTH_SHORT } from '@/lib/formatters'
import { Tip, TIPS } from '@/components/MetricTip'
import { DeltaPill } from '@/components/DeltaPill'
import FunnelChart from '@/components/FunnelChart'
import type { FunnelData } from '@/components/FunnelChart'
import AtRiskDeals from './AtRiskDeals'
import type { Summary, Advisor, YoYData, ChartColors } from './types'
import type { Insight, SlippingDeal } from '@/lib/types'
import {
  DollarSign, Trophy, GitBranch, Target, Users,
  Megaphone, TrendingDown, Sparkles,
  CheckCircle2, AlertTriangle, Lightbulb,
} from 'lucide-react'

/* ── Constants ── */

const CURRENT_COLOR = '#3b82f6'
const PRIOR_COLOR   = '#94a3b8'

const BAR_PALETTE: [string, string][] = [
  ['#3b82f6', '#1e40af'], ['#8b5cf6', '#5b21b6'], ['#06b6d4', '#0e7490'],
  ['#22c55e', '#15803d'], ['#f59e0b', '#b45309'], ['#ec4899', '#9d174d'],
  ['#f97316', '#c2410c'], ['#6366f1', '#4338ca'], ['#14b8a6', '#0f766e'],
  ['#a855f7', '#7e22ce'],
]

/* ── Props ── */

export interface OverviewTabProps {
  summary: Summary
  isInsurance: boolean
  dealsYoyPct: number
  pipelineCoverage: number
  yoy: YoYData | null
  funnel: FunnelData | null
  c: ChartColors
  leaders: Advisor[]
  insights: Insight[]
  slipping: SlippingDeal[]
  onSelectAdvisor: (name: string) => void
  onViewSummary?: () => void
  periodLabel: string
  viewMode: string
}

/* ── Sub-components ── */

function KPITile({ icon: Icon, iconColor, iconBg, title, value, delta, deltaLabel, sub, onClick, tip }: {
  icon: React.ElementType; iconColor: string; iconBg: string
  title: string; value: string
  delta?: number; deltaLabel?: string; sub?: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div onClick={onClick} className={cn('card-premium relative overflow-hidden p-5', onClick && 'cursor-pointer transition-colors hover:bg-secondary/5')}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="mb-3 flex items-center gap-2.5">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4 w-4', iconColor)} />
        </div>
        <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
        {tip && <Tip text={tip} />}
      </div>
      <p className="tabular-nums text-[28px] font-bold leading-none tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta !== undefined && <DeltaPill value={delta} />}
        {(deltaLabel || sub) && <span className="text-[11px] text-muted-foreground">{deltaLabel || sub}</span>}
      </div>
    </div>
  )
}

function ActivityCell({ icon: Icon, label, value, color, bg, onClick, tip }: {
  icon: React.ElementType; label: string; value: string; color: string; bg: string
  onClick?: () => void; tip?: string
}) {
  return (
    <div onClick={onClick} className={cn('flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/10 p-3.5 transition-colors', onClick && 'cursor-pointer hover:bg-secondary/30')}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="tabular-nums text-[20px] font-bold leading-none">{value}</p>
        <p className="mt-0.5 flex items-center text-[12px] font-medium text-muted-foreground">{label}{tip && <Tip text={tip} />}</p>
      </div>
    </div>
  )
}

/* ── Main ── */

export default function OverviewTab({
  summary, isInsurance, dealsYoyPct, pipelineCoverage,
  yoy, funnel, c, leaders, insights, slipping,
  onSelectAdvisor, onViewSummary, periodLabel, viewMode,
}: OverviewTabProps) {
  const nav = useNavigate()
  const [chartMode, setChartMode] = useState<'revenue' | 'commission'>('revenue')
  const [showLost, setShowLost] = useState(false)

  const billedValue = summary.bookings
  const billedPct   = summary.bookings_yoy_pct
  const billedPrev  = summary.bookings_prev
  const commValue   = isInsurance ? summary.bookings : summary.commission

  const currentMonth = new Date().getMonth() + 1
  const showAllMonths = viewMode === 'last-year' || viewMode === 'year'
  const lineData = (yoy?.months ?? [])
    .filter(m => showAllMonths || m.month <= currentMonth)
    .map(m => ({
      label: MONTH_SHORT[m.month - 1],
      current: chartMode === 'commission' ? m.current_commission : m.current_revenue,
      prior: chartMode === 'commission'
        ? (m.prior_commission > 0 ? m.prior_commission : null)
        : (m.prior_revenue > 0 ? m.prior_revenue : null),
      currentLost: chartMode === 'revenue' ? (m.current_lost_amount ?? 0) : (m.current_lost ?? 0),
      priorLost: chartMode === 'revenue' ? (m.prior_lost_amount ?? 0) : (m.prior_lost ?? 0),
    }))

  const top8 = leaders.slice(0, 8)
  const reversed8 = [...top8].reverse() // rank 1 ends up at top of horizontal bar

  const laggards = leaders.length >= 6 ? leaders.slice(-5) : []
  const topVal = leaders[0]
    ? Math.max(leaders[0].commission > 0 ? leaders[0].commission : leaders[0].bookings, 1)
    : 1

  const leadsCount = funnel?.steps?.[0]?.count ?? 0
  const oppsCount  = funnel?.steps?.find(s => s.step.toLowerCase().includes('opp'))?.count
                  ?? funnel?.steps?.[1]?.count ?? 0
  const coveragePct = Math.min(pipelineCoverage / 3 * 100, 100)

  /* ── ECharts option: gradient area trend ── */
  const areaOption = {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 12, right: 12, bottom: 28, left: 52 },
    xAxis: {
      type: 'category',
      data: lineData.map(d => d.label),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: c.tick, fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { color: c.tick, fontSize: 10, formatter: (v: number) => fmtAxis(v) },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.tooltipBg,
      borderColor: c.tooltipBorder,
      textStyle: { fontSize: 12 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any[]) => {
        const lbl = params[0]?.axisValue ?? ''
        const rows = params
          .filter(p => p.value != null)
          .map(p => `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:3px">
            <span style="color:${p.color as string};font-size:11px">${p.seriesName as string}</span>
            <b>${formatCurrency(p.value as number, true)}</b></div>`).join('')
        return `<div style="padding:4px 2px"><div style="font-size:11px;opacity:.5;margin-bottom:2px">${lbl}</div>${rows}</div>`
      },
    },
    legend: { show: false },
    series: [
      ...(lineData.some(d => d.prior !== null) ? [{
        name: String(yoy?.prior_year ?? 'Prior'),
        type: 'line', smooth: true,
        data: lineData.map(d => d.prior),
        lineStyle: { color: PRIOR_COLOR, width: 2, opacity: 0.7 },
        itemStyle: { color: PRIOR_COLOR },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(148,163,184,0.12)' }, { offset: 1, color: 'rgba(148,163,184,0)' }] } },
        symbol: 'circle', symbolSize: 4,
      }] : []),
      {
        name: String(yoy?.current_year ?? 'Current'),
        type: 'line', smooth: true,
        data: lineData.map(d => d.current),
        lineStyle: { color: CURRENT_COLOR, width: 3 },
        itemStyle: { color: CURRENT_COLOR },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.28)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }] } },
        symbol: 'circle', symbolSize: 6, emphasis: { focus: 'series' },
      },
      ...(showLost ? [
        { name: `Lost ${yoy?.current_year ?? 'Cur'}`, type: 'line', smooth: true, data: lineData.map(d => d.currentLost),
          lineStyle: { color: '#8b5cf6', width: 2 }, itemStyle: { color: '#8b5cf6' }, symbol: 'circle', symbolSize: 4 },
        { name: `Lost ${yoy?.prior_year ?? 'Pri'}`, type: 'line', smooth: true, data: lineData.map(d => d.priorLost),
          lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 4 },
      ] : []),
    ],
  }

  /* ── ECharts option: pseudo-3D horizontal bar (advisors) ── */
  const advisorBarOption = {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 4, right: 88, bottom: 4, left: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { color: c.tick, fontSize: 9, formatter: (v: number) => fmtAxis(v) },
    },
    yAxis: {
      type: 'category',
      data: reversed8.map(a => {
        const parts = a.name.split(' ')
        return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : a.name
      }),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { fontSize: 11, fontWeight: 500 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: c.tooltipBg,
      borderColor: c.tooltipBorder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (p: any) => {
        const a = reversed8[p.dataIndex as number]
        if (!a) return ''
        return `<b>${a.name}</b><br/>` +
          `${isInsurance ? 'Bookings' : 'Commission'}: <b>${formatCurrency(p.value as number, true)}</b><br/>` +
          `Deals: <b>${formatNumber(a.deals)}</b> &nbsp; Win: <b>${formatPct(a.win_rate)}</b><br/>` +
          `Pipeline: <b>${formatCurrency(a.pipeline_value, true)}</b>`
      },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 26,
      cursor: 'pointer',
      data: reversed8.map((a, i) => {
        const [from, to] = BAR_PALETTE[i % BAR_PALETTE.length]
        const val = isInsurance ? a.bookings : (a.commission > 0 ? a.commission : a.bookings)
        return {
          value: val,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [{ offset: 0, color: `${from}bb` }, { offset: 1, color: to }] },
            shadowBlur: 10,
            shadowColor: `${from}44`,
            shadowOffsetY: 2,
          },
        }
      }),
      label: {
        show: true, position: 'right',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => formatCurrency(p.value as number, true),
        color: c.tick, fontSize: 10,
      },
    }],
  }

  const INSIGHT_ICON = {
    success: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
    danger:  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />,
    info:    <Lightbulb    className="h-3.5 w-3.5 shrink-0 text-primary" />,
  }
  const INSIGHT_BG = {
    success: 'bg-emerald-500/6', warning: 'bg-amber-500/6',
    danger: 'bg-rose-500/6', info: 'bg-primary/6',
  }

  return (
    <>
      {/* ROW 1 — KPI tiles with entrance stagger */}
      <div className="animate-enter grid grid-cols-4 gap-3">
        {([
          { icon: DollarSign, iconBg: 'bg-primary/10', iconColor: 'text-primary',
            title: 'Billed Bookings', tip: TIPS.billedRevenue,
            value: formatCurrency(billedValue, true),
            delta: billedPct, deltaLabel: 'vs last year', onClick: () => nav('/monthly') },
          { icon: Trophy, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500',
            title: 'Won Deals', tip: TIPS.wonDeals,
            value: formatNumber(summary.deals),
            delta: dealsYoyPct, deltaLabel: 'from last year', onClick: () => nav('/monthly') },
          { icon: GitBranch, iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-500',
            title: 'Open Pipeline', tip: TIPS.pipeline,
            value: formatCurrency(summary.pipeline_value, true),
            sub: `${pipelineCoverage.toFixed(1)}x coverage · ${formatNumber(summary.pipeline_count)} deals`,
            onClick: () => nav('/pipeline') },
          { icon: Target, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500',
            title: 'Win Rate', tip: TIPS.winRate,
            value: formatPct(summary.win_rate),
            sub: `Avg ${formatCurrency(summary.avg_deal_size, true)} per deal`,
            onClick: () => nav('/monthly') },
        ] as const).map((tile, i) => (
          <motion.div key={tile.title}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}>
            <KPITile {...tile} />
          </motion.div>
        ))}
      </div>

      {/* ROW 2 — Gradient area chart + At-Risk */}
      <div className="animate-enter stagger-1 grid gap-3" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="card-premium p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {chartMode === 'commission' ? 'Commissions' : 'Bookings'} Trend · {periodLabel}
              <Tip text={TIPS.salesOverview} />
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLost(!showLost)} className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                showLost ? 'border-violet-400/60 bg-violet-500/10 text-violet-500' : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60',
              )}>Lost Opps</button>
              {!isInsurance && (
                <div className="flex rounded-full border border-border bg-secondary/40 p-0.5">
                  <button onClick={() => setChartMode('revenue')} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors', chartMode === 'revenue' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>Bookings</button>
                  <button onClick={() => setChartMode('commission')} className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors', chartMode === 'commission' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>Commissions</button>
                </div>
              )}
              <span className="rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[12px] text-muted-foreground">
                {yoy ? `${yoy.current_year} vs ${yoy.prior_year}` : 'Last 12 Months'}
              </span>
            </div>
          </div>

          <div className="mb-4 flex items-start gap-10">
            <div>
              <p className="text-[12px] font-medium text-muted-foreground">
                {chartMode === 'commission' ? 'Total Commissions' : 'Total Bookings'}
              </p>
              <p className="mt-0.5 tabular-nums text-[22px] font-bold leading-none">
                {formatCurrency(chartMode === 'commission' ? commValue : billedValue, true)}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <DeltaPill value={chartMode === 'commission' ? (summary.commission_yoy_pct ?? billedPct) : billedPct} />
                <span className="text-[12px] font-medium text-muted-foreground">
                  vs prior: {formatCurrency(chartMode === 'commission' ? (summary.commission_prev ?? 0) : billedPrev, true)}
                </span>
              </div>
            </div>
            {yoy && (
              <div className="ml-auto flex flex-col items-end gap-1.5 self-end pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CURRENT_COLOR }} />
                  <span className="text-[12px] font-medium text-muted-foreground">{yoy.current_year}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ backgroundColor: PRIOR_COLOR }} />
                  <span className="text-[12px] font-medium text-muted-foreground">{yoy.prior_year}</span>
                </div>
              </div>
            )}
          </div>

          <ReactECharts option={areaOption} style={{ height: '200px' }} />
        </div>

        <div className="card-premium p-4">
          <AtRiskDeals deals={slipping} onSelectAdvisor={onSelectAdvisor} />
        </div>
      </div>

      {/* ROW 3 — Drillable advisor bar + Laggards + AI Insights */}
      <div className="animate-enter stagger-2 grid gap-3" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="card-premium overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Top Advisors</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                click bar to drill in
              </span>
            </div>
            <span className="text-[12px] font-medium text-muted-foreground">
              {leaders.length} total · showing top {top8.length}
            </span>
          </div>
          <div className="px-4 pb-4 pt-3">
            {top8.length > 0 ? (
              <ReactECharts
                option={advisorBarOption}
                style={{ height: `${Math.max(top8.length * 40, 200)}px` }}
                onEvents={{
                  click: (params: { dataIndex: number }) => {
                    const a = reversed8[params.dataIndex]
                    if (a) onSelectAdvisor(a.name)
                  },
                }}
              />
            ) : (
              <p className="py-10 text-center text-[12px] text-muted-foreground">No advisor data available</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {laggards.length > 0 && (
            <div className="card-premium p-5">
              <div className="mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-500" />
                <h3 className="text-sm font-semibold">Lowest Performers</h3>
              </div>
              <div className="space-y-2">
                {laggards.map(a => {
                  const val = isInsurance ? a.bookings : (a.commission > 0 ? a.commission : a.bookings)
                  const pct = Math.round(val / topVal * 100)
                  return (
                    <div key={a.name} onClick={() => onSelectAdvisor(a.name)}
                      className="group cursor-pointer rounded-lg border border-border/30 bg-secondary/10 p-3 transition-colors hover:bg-rose-500/5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-primary group-hover:underline">{a.name}</span>
                        <span className="text-[11px] text-muted-foreground">#{a.rank}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/40">
                          <div className="h-full rounded-full bg-rose-500/70 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="shrink-0 tabular-nums text-[11px] text-rose-400">{formatCurrency(val, true)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card-premium flex-1 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">AI Insights</h3>
              </div>
              {onViewSummary && (
                <button onClick={onViewSummary} className="text-[11px] font-medium text-primary/70 transition-colors hover:text-primary">
                  Full briefing →
                </button>
              )}
            </div>
            <div className="space-y-2">
              {insights.slice(0, 4).map((ins, i) => (
                <div key={i} onClick={() => onViewSummary?.()}
                  className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 transition-opacity hover:opacity-75', INSIGHT_BG[ins.type])}>
                  <div className="mt-0.5">{INSIGHT_ICON[ins.type]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold leading-tight">{ins.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{ins.text}</p>
                  </div>
                </div>
              ))}
              {insights.length === 0 && (
                <p className="py-6 text-center text-[11px] text-muted-foreground">No insights for this period.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 4 — Funnel + Activity */}
      <div className="animate-enter stagger-3 grid grid-cols-2 gap-3">
        <div onClick={() => nav('/pipeline')} className="card-premium cursor-pointer transition-colors hover:bg-secondary/5">
          <FunnelChart funnel={funnel} variant="compact" />
        </div>

        <div className="card-premium p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Sales Activity</h3>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <ActivityCell icon={Megaphone}  label="Leads"    value={formatNumber(leadsCount)}                    color="text-primary"     bg="bg-primary/10"     onClick={() => nav('/leads')}    tip={TIPS.leads} />
            <ActivityCell icon={Target}     label="Opps"     value={formatNumber(oppsCount)}                    color="text-amber-500"   bg="bg-amber-500/10"   onClick={() => nav('/pipeline')} tip={TIPS.opps} />
            <ActivityCell icon={Trophy}     label="Won"      value={formatNumber(summary.deals)}                color="text-emerald-500" bg="bg-emerald-500/10" onClick={() => nav('/monthly')}  tip={TIPS.wonDeals} />
            <ActivityCell icon={DollarSign} label="Avg Deal" value={formatCurrency(summary.avg_deal_size, true)} color="text-cyan-500"    bg="bg-cyan-500/10"    onClick={() => nav('/monthly')}  tip={TIPS.avgDeal} />
          </div>
          <div onClick={() => nav('/pipeline')} className="mt-3 cursor-pointer rounded-xl border border-border/40 bg-secondary/20 p-3.5 transition-colors hover:bg-secondary/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted-foreground">Pipeline Coverage<Tip text={TIPS.pipelineCoverage} /></span>
              <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold',
                pipelineCoverage >= 2 ? 'bg-emerald-500/10 text-emerald-500' : pipelineCoverage >= 1 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500')}>
                {pipelineCoverage >= 2 ? 'Healthy' : pipelineCoverage >= 1 ? 'Moderate' : 'Low'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <p className="tabular-nums text-[22px] font-bold leading-none">{pipelineCoverage.toFixed(1)}x</p>
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                  <div className={cn('h-full rounded-full transition-all', pipelineCoverage >= 2 ? 'bg-emerald-500' : pipelineCoverage >= 1 ? 'bg-amber-500' : 'bg-rose-500')}
                    style={{ width: `${coveragePct}%` }} />
                </div>
                <p className="mt-1 text-[12px] font-medium text-muted-foreground">{formatNumber(summary.pipeline_count)} open opportunities</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
