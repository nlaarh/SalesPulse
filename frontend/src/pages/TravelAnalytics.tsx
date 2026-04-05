import { useEffect, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchTravelDestinations, fetchTravelSeasonal,
  fetchTravelPartySize, fetchDestinationTrend,
  fetchNarrative,
} from '@/lib/api'
import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import KPICard from '@/components/KPICard'
import RichNarrative from '@/components/RichNarrative'
import {
  MapPin, TrendingUp, Users, Loader2,
  BarChart3, Table2, Sparkles, DollarSign, Globe, Download,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area,
} from 'recharts'
import { exportToExcel } from '@/lib/exportExcel'

type Tab = 'charts' | 'details' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'charts', label: 'Charts', icon: BarChart3 },
  { key: 'details', label: 'Details', icon: Table2 },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

export default function TravelAnalytics() {
  const { period, viewMode, startDate, endDate } = useSales()
  const c = useChartColors()
  const [destinations, setDestinations] = useState<any>(null)
  const [, setSeasonal] = useState<any>(null)
  const [partySize, setPartySize] = useState<any>(null)
  const [selectedDest, setSelectedDest] = useState('Caribbean')
  const [destTrend, setDestTrend] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('charts')

  const periodLabel = viewMode === 'custom' && startDate && endDate
    ? `${startDate} → ${endDate}`
    : viewMode === 'month' ? 'Last month'
    : viewMode === 'quarter' ? 'Last 3 months'
    : 'Last 12 months'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchTravelDestinations(period, startDate, endDate),
      fetchTravelSeasonal(24, startDate, endDate),
      fetchTravelPartySize(period, startDate, endDate),
    ]).then(([d, s, p]) => {
      if (cancelled) return
      setDestinations(d); setSeasonal(s); setPartySize(p)
    }).catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, startDate, endDate])

  useEffect(() => {
    fetchDestinationTrend(selectedDest, 24, startDate, endDate).then(setDestTrend).catch(console.error)
  }, [selectedDest, startDate, endDate])

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
  }

  const dests = destinations?.destinations ?? []
  const topDest = dests[0]
  const fastestGrowing = [...dests].sort((a: any, b: any) => (b.yoy_growth_pct ?? b.growth ?? 0) - (a.yoy_growth_pct ?? a.growth ?? 0))[0]
  const totalRev = dests.reduce((s: number, d: any) => s + (d.revenue || 0), 0)
  const totalVol = dests.reduce((s: number, d: any) => s + (d.count || 0), 0)
  const growthVal = fastestGrowing?.yoy_growth_pct ?? fastestGrowing?.growth

  return (
    <div className="space-y-3">
      {/* Header + Tabs */}
      <div className="animate-enter flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">Travel Division &middot; {periodLabel}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Destination & Trend Analytics</h1>
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
                  tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'charts' && (
        <ChartsTab
          dests={dests} topDest={topDest} fastestGrowing={fastestGrowing}
          totalRev={totalRev} totalVol={totalVol} growthVal={growthVal}
          partySize={partySize} destTrend={destTrend} selectedDest={selectedDest}
          setSelectedDest={setSelectedDest} c={c}
        />
      )}
      {tab === 'details' && (
        <DetailsTab dests={dests} selectedDest={selectedDest} setSelectedDest={setSelectedDest} destTrend={destTrend} c={c} />
      )}
      {tab === 'summary' && (
        <SummaryTab dests={dests} topDest={topDest} fastestGrowing={fastestGrowing} totalRev={totalRev} totalVol={totalVol} partySize={partySize} periodLabel={periodLabel} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   CHARTS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ChartsTab({ dests, topDest, fastestGrowing, totalRev, totalVol, growthVal, partySize, destTrend, selectedDest, setSelectedDest, c }: {
  dests: any[]; topDest: any; fastestGrowing: any; totalRev: number; totalVol: number; growthVal: any
  partySize: any; destTrend: any; selectedDest: string; setSelectedDest: (v: string) => void
  c: ReturnType<typeof useChartColors>
}) {
  // Revenue by destination bar chart
  const top10Dests = dests.slice(0, 10).map((d: any) => ({
    name: d.destination, revenue: d.revenue || 0,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Top Destination" value={topDest?.destination ?? '—'} icon={<MapPin className="h-4 w-4" />} className="stagger-1" />
        <KPICard title="Fastest Growing" value={fastestGrowing?.destination ?? '—'} delta={growthVal} icon={<TrendingUp className="h-4 w-4" />} className="stagger-2" />
        <KPICard title="Total Revenue" value={formatCurrency(totalRev, true)} icon={<DollarSign className="h-4 w-4" />} className="stagger-3" />
        <KPICard title="Bookings" value={formatNumber(totalVol)} icon={<Users className="h-4 w-4" />} className="stagger-4" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Destinations Revenue */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Revenue by Destination</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10Dests} layout="vertical">
                <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: number) => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`} />
                <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [formatCurrency(Number(v), true), 'Revenue']} />
                <Bar dataKey="revenue" fill={c.primary} radius={[0, 6, 6, 0]} barSize={18}
                  onClick={(_: any, idx: number) => { if (top10Dests[idx]) setSelectedDest(top10Dests[idx].name) }} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Destination Trend */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">{selectedDest} — Monthly Trend</h2>
          </div>
          <div className="p-5">
            {destTrend?.months?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={destTrend.months}>
                  <defs>
                    <linearGradient id="destGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                    tickFormatter={(v: string) => { const p = v.split('-'); return `${p[1]}/${p[0]?.slice(2)}` }} interval="preserveStartEnd" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                    tickFormatter={(v: number) => `$${(v / 1_000).toFixed(0)}K`} width={50} />
                  <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [formatCurrency(Number(v), true), 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke={c.primary} strokeWidth={2} fill="url(#destGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">Select a destination</div>}
          </div>
        </div>
      </div>

      {/* Party Size */}
      {partySize?.buckets?.length > 0 && (
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Party Size Distribution</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={partySize.buckets}>
                <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                <XAxis dataKey="size" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} />
                <Bar dataKey="count" fill={c.purple} radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DETAILS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function DetailsTab({ dests, selectedDest, setSelectedDest, destTrend, c }: {
  dests: any[]; selectedDest: string; setSelectedDest: (v: string) => void; destTrend: any
  c: ReturnType<typeof useChartColors>
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card-premium animate-enter overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Destination Revenue</h2>
            <span className="text-[11px] text-muted-foreground">Click a row to view trend</span>
          </div>
          <button
            onClick={() => exportToExcel(dests.map((d: any) => ({
              Destination: d.destination,
              Revenue: d.revenue,
              'Avg Booking': d.avg_booking ?? '',
              'YoY %': d.yoy_growth_pct != null ? `${d.yoy_growth_pct.toFixed(1)}%` : '',
            })), `Travel_Destinations_${new Date().toISOString().slice(0,10)}`)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
            <Download className="h-3.5 w-3.5" />Export
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                {['Destination', 'Revenue', 'Avg Booking', 'YoY'].map(h => (
                  <th key={h} className={cn('px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60', h === 'Destination' ? 'text-left' : 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dests.map((d: any) => {
                const yoy = d.yoy_growth_pct ?? d.growth
                return (
                  <tr key={d.destination}
                    className={cn('cursor-pointer border-b border-border/30 transition-colors duration-150', selectedDest === d.destination ? 'bg-primary/[0.06]' : 'hover:bg-secondary/50')}
                    onClick={() => setSelectedDest(d.destination)}>
                    <td className="px-6 py-3 text-[13px] font-medium">{d.destination}</td>
                    <td className="tabular-nums px-6 py-3 text-right text-[13px]">{formatCurrency(d.revenue, true)}</td>
                    <td className="tabular-nums px-6 py-3 text-right text-[13px] text-muted-foreground">{d.avg_booking ? formatCurrency(d.avg_booking) : '—'}</td>
                    <td className="px-6 py-3 text-right">
                      {yoy != null ? (
                        <span className={cn('tabular-nums text-[13px] font-medium', yoy > 0 ? 'text-emerald-500' : yoy < 0 ? 'text-rose-500' : 'text-muted-foreground')}>
                          {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-premium animate-enter">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold tracking-tight">{selectedDest} — Monthly Trend</h2>
        </div>
        <div className="p-5">
          {destTrend?.months?.length ? (
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={destTrend.months}>
                <defs>
                  <linearGradient id="destGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.primary} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: string) => { const p = v.split('-'); return `${p[1]}/${p[0]?.slice(2)}` }} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  tickFormatter={(v: number) => `$${(v / 1_000).toFixed(0)}K`} width={50} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [formatCurrency(Number(v), true), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke={c.primary} strokeWidth={2} fill="url(#destGrad2)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">Select a destination to view trend</div>}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   EXECUTIVE SUMMARY TAB
   ════════════════════════════════════════════════════════════════════════════ */

function SummaryTab({ dests, topDest, fastestGrowing, totalRev, totalVol, partySize, periodLabel }: {
  dests: any[]; topDest: any; fastestGrowing: any; totalRev: number; totalVol: number; partySize: any; periodLabel: string
}) {
  const { period, startDate, endDate } = useSales()
  const [aiNarrative, setAiNarrative] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiLoading(true)
    setAiNarrative(null)
    fetchNarrative('travel', 'Travel', period, startDate, endDate)
      .then(r => { if (r.narrative) setAiNarrative(r.narrative) })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [period, startDate, endDate])

  const avgBooking = totalVol > 0 ? totalRev / totalVol : 0
  const topGrowth = fastestGrowing?.yoy_growth_pct ?? fastestGrowing?.growth ?? 0
  const avgParty = partySize?.avg_size ?? '—'

  // Concentration: top destination share
  const topConcentration = topDest && totalRev > 0 ? (topDest.revenue / totalRev * 100) : 0
  const top3Rev = dests.slice(0, 3).reduce((s: number, d: any) => s + (d.revenue || 0), 0)
  const top3Pct = totalRev > 0 ? (top3Rev / totalRev * 100) : 0

  // Growing vs declining destinations
  const growing = dests.filter((d: any) => (d.yoy_growth_pct ?? d.growth ?? 0) > 5)
  const declining = dests.filter((d: any) => (d.yoy_growth_pct ?? d.growth ?? 0) < -5)
  const decliningRev = declining.reduce((s: number, d: any) => s + (d.revenue || 0), 0)
  const growingRev = growing.reduce((s: number, d: any) => s + (d.revenue || 0), 0)

  // High-value bookings analysis
  const highValueDests = dests.filter((d: any) => (d.avg_booking || 0) > avgBooking * 1.5)

  // VP-level narrative — full paragraphs
  const para1 = topDest
    ? `The Travel Division booked **${formatCurrency(totalRev, true)}** across **${formatNumber(totalVol)} trips** to ${dests.length} destinations ${periodLabel.toLowerCase()}. **${topDest.destination}** leads at **${formatCurrency(topDest.revenue, true)}** (${topConcentration.toFixed(0)}% of total revenue), and the top 3 destinations together account for **${top3Pct.toFixed(0)}%** of all bookings — ${top3Pct > 65 ? '**a high concentration** that creates vulnerability if any of these markets shift' : 'a reasonable distribution across key markets'}.`
    : `The Travel Division booked **${formatCurrency(totalRev, true)}** across **${formatNumber(totalVol)} trips** to ${dests.length} destinations ${periodLabel.toLowerCase()}.`

  const para2 = growing.length > 0 || declining.length > 0
    ? `**Market momentum:** **${growing.length}** destination${growing.length !== 1 ? 's are' : ' is'} growing year-over-year (**${formatCurrency(growingRev, true)}** combined revenue)${fastestGrowing ? `, led by **${fastestGrowing.destination}** at **+${topGrowth.toFixed(0)}%**` : ''}. ${declining.length > 0 ? `On the other side, **${declining.length}** destination${declining.length !== 1 ? 's are' : ' is'} declining — ${declining.slice(0, 3).map((d: any) => d.destination).join(', ')}${declining.length > 3 ? ` and ${declining.length - 3} more` : ''} — representing **${formatCurrency(decliningRev, true)}** in at-risk revenue (${(decliningRev / totalRev * 100).toFixed(0)}% of total). The question is whether this reflects a structural market shift or an execution gap that targeted advisor focus could reverse.` : 'No destinations are showing significant decline — the portfolio is broadly healthy across all markets.'}`
    : `Destination-level growth data is not available for ${periodLabel.toLowerCase()}.`

  const para3 = `Booking profile: the average trip is valued at **${formatCurrency(avgBooking, true)}**${avgParty !== '—' ? ` with a **${avgParty}-person** average party size` : ''}. ${highValueDests.length > 0 ? `**${highValueDests.length} destination${highValueDests.length !== 1 ? 's' : ''}** (${highValueDests.slice(0, 3).map((d: any) => d.destination).join(', ')}) have booking values 50%+ above average — these premium segments represent an opportunity for targeted upselling and advisor specialization.` : 'Booking values are relatively consistent across destinations, suggesting a uniform product mix.'}`

  const narrative = [para1, para2, para3].filter(Boolean).join('\n\n')

  const concentrationHealth: 'strong' | 'moderate' | 'weak' = top3Pct < 50 ? 'strong' : top3Pct < 70 ? 'moderate' : 'weak'
  const growthHealth: 'strong' | 'moderate' | 'weak' = growing.length > declining.length ? 'strong' : growing.length === declining.length ? 'moderate' : 'weak'
  const declineHealth: 'strong' | 'moderate' | 'weak' = declining.length === 0 ? 'strong' : declining.length <= 2 ? 'moderate' : 'weak'
  const bookingHealth: 'strong' | 'moderate' | 'weak' = avgBooking >= 5000 ? 'strong' : avgBooking >= 2000 ? 'moderate' : 'weak'

  const healthCards = [
    { label: 'Top 3 Share', value: `${top3Pct.toFixed(0)}%`, health: concentrationHealth, detail: `of ${formatCurrency(totalRev, true)} total`, icon: Globe },
    { label: 'Growing Markets', value: `${growing.length}`, health: growthHealth, detail: `${formatCurrency(growingRev, true)} in growing dests`, icon: TrendingUp },
    { label: 'Declining Markets', value: declining.length > 0 ? `${declining.length}` : 'None', health: declineHealth, detail: declining.length > 0 ? `${formatCurrency(decliningRev, true)} at risk` : 'All stable or growing', icon: MapPin },
    { label: 'Avg Booking', value: formatCurrency(avgBooking, true), health: bookingHealth, detail: `${formatNumber(totalVol)} total trips`, icon: DollarSign },
  ]

  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []
  if (declining.length > 0 && decliningRev > totalRev * 0.15) actions.push({ priority: 'high', label: `${formatCurrency(decliningRev, true)} in Declining Markets`, action: `${declining.length} destinations showing >5% YoY decline represent ${(decliningRev / totalRev * 100).toFixed(0)}% of revenue. Determine if this is a market shift (redirect resources) or execution issue (invest in recovery).` })
  if (top3Pct > 65) actions.push({ priority: 'medium', label: 'Geographic Concentration', action: `Top 3 destinations drive ${top3Pct.toFixed(0)}% of revenue. A downturn in any of these markets would significantly impact the business. Develop 2-3 emerging destinations to reduce exposure.` })
  if (highValueDests.length > 0) actions.push({ priority: 'medium', label: 'High-Value Segment', action: `${highValueDests.length} destinations have booking values 50%+ above average. These premium segments may respond well to targeted marketing or advisor specialization.` })
  if (growing.length > declining.length && topGrowth > 10) actions.push({ priority: 'low', label: 'Growth Momentum', action: `More destinations are growing than declining, led by ${fastestGrowing?.destination} at +${topGrowth.toFixed(0)}%. Capitalize by sharing best practices from growing markets across the advisory team.` })
  if (declining.length === 0) actions.push({ priority: 'low', label: 'All Markets Stable', action: `No destinations are in significant decline. Focus on increasing wallet share in top markets and testing new destinations.` })

  return (
    <>
      <div className="animate-enter card-premium p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
          <div>
            <h3 className="text-[13px] font-semibold">Executive Briefing</h3>
            <p className="text-[10px] text-muted-foreground">Travel Division · {periodLabel}</p>
          </div>
        </div>
        <RichNarrative text={aiNarrative ?? narrative} />
        {aiLoading && <p className="text-[10px] text-primary/50 animate-pulse mt-1">AI analyzing...</p>}
      </div>

      <div className="animate-enter stagger-1 grid grid-cols-4 gap-3">
        {healthCards.map((card) => {
          const Icon = card.icon
          const statusColor = card.health === 'strong' ? 'text-emerald-500' : card.health === 'moderate' ? 'text-amber-500' : 'text-rose-500'
          const statusBg = card.health === 'strong' ? 'bg-emerald-500/10' : card.health === 'moderate' ? 'bg-amber-500/10' : 'bg-rose-500/10'
          const statusLabel = card.health === 'strong' ? 'Strong' : card.health === 'moderate' ? 'Moderate' : 'Needs Work'
          return (
            <div key={card.label} className="card-premium relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="mb-2 flex items-center gap-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', statusBg)}><Icon className={cn('h-3.5 w-3.5', statusColor)} /></div>
                <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
              </div>
              <p className="tabular-nums text-[22px] font-bold leading-none tracking-tight">{card.value}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBg, statusColor)}>{statusLabel}</span>
                <span className="text-[10px] text-muted-foreground">{card.detail}</span>
              </div>
            </div>
          )
        })}
      </div>

      {actions.length > 0 && (
        <div className="animate-enter stagger-2 card-premium p-6">
          <h3 className="mb-4 text-[13px] font-semibold">Recommended Actions</h3>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className={cn('rounded-lg border-l-[3px] px-4 py-3', a.priority === 'high' ? 'border-l-rose-500 bg-rose-500/5' : a.priority === 'medium' ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-emerald-500 bg-emerald-500/5')}>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase', a.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : a.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500')}>
                    {a.priority === 'high' ? 'Action Needed' : a.priority === 'medium' ? 'Review' : 'Positive'}
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">{a.label}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">{a.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
