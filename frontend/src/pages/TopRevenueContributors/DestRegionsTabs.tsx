import { useEffect, useState, useMemo } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { fetchTravelDestinations, fetchTerritoryMapData, type TerritoryMapData } from '@/lib/api'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, Globe, Map, Plane, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'
import { fmt, fmtFull, fmtNum, Pie3D } from './shared'

/* ── DestinationsTab ─────────────────────────────────────────────────────────*/

interface Destination {
  destination: string
  revenue: number
  volume: number
  avg_booking: number
  yoy_growth_pct: number | null
  prev_revenue: number
}

type DestSort = 'revenue' | 'volume' | 'avg_booking' | 'yoy_growth_pct'

export function DestinationsTab() {
  const { line, period, startDate, endDate } = useSales()
  const c = useChartColors()

  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<DestSort>('revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const [topN, setTopN] = useState(25)

  useEffect(() => {
    setLoading(true)
    fetchTravelDestinations(period, startDate, endDate)
      .then(d => setDestinations(d?.destinations ?? []))
      .catch(() => setDestinations([]))
      .finally(() => setLoading(false))
  }, [period, startDate, endDate])

  const sorted = useMemo(() =>
    [...destinations].sort((a, b) => {
      const av = a[sortField] ?? -Infinity
      const bv = b[sortField] ?? -Infinity
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    }),
    [destinations, sortField, sortAsc],
  )

  const chartData = useMemo(
    () => sorted.slice(0, Math.min(topN, 20)).map(d => ({
      name: d.destination.length > 18 ? d.destination.slice(0, 16) + '…' : d.destination,
      fullName: d.destination,
      value: d.revenue,
    })),
    [sorted, topN],
  )

  const displayedDest = useMemo(() => sorted.slice(0, topN), [sorted, topN])
  const totalRev = useMemo(() => destinations.reduce((s, d) => s + d.revenue, 0), [destinations])

  function toggleSort(field: DestSort) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  function SortIcon({ field }: { field: DestSort }) {
    if (sortField !== field) return <span className="opacity-20 ml-1">↕</span>
    return sortAsc ? <ArrowUp className="inline w-3 h-3 ml-1 opacity-70" /> : <ArrowDown className="inline w-3 h-3 ml-1 opacity-70" />
  }

  if (line === 'Insurance') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Plane className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-lg font-medium">Destinations are Travel-only</p>
        <p className="text-sm mt-1">Switch to Travel to see destination revenue rankings</p>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!destinations.length) return <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Globe className="w-12 h-12 mb-3 opacity-30" /><p>No destination data found</p></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Show top</span>
        <input type="number" min={1} max={200} value={topN}
          onChange={e => setTopN(Math.max(1, Math.min(200, Number(e.target.value) || 25)))}
          className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground" />
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Top {chartData.length} Destinations by Revenue
        </h2>
        <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" tickFormatter={fmt} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload
              return <div style={tooltipStyle(c)} className="px-3 py-2 text-sm"><p className="font-semibold mb-1">{d.fullName}</p><p style={{ color: c.primary }}>{fmtFull(d.value)}</p></div>
            }} cursor={{ fill: c.cursor }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}
              label={{ position: 'right', formatter: (v: any) => fmt(Number(v)), fill: c.tick, fontSize: 11 }}>
              {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? c.primary : i < 3 ? c.secondary : c.cyan} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Top {displayedDest.length} Destinations — {sorted.length} total markets
          </h2>
          <button onClick={() => exportToExcel(displayedDest.map((d, i) => ({
            Rank: i + 1, Destination: d.destination, Revenue: d.revenue,
            Volume: d.volume, 'Avg Booking': d.avg_booking, 'YoY Growth %': d.yoy_growth_pct ?? '',
          })), 'Top_Destinations')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="px-5 py-3 w-10">#</th>
                <th className="px-5 py-3">Destination</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('revenue')}>Revenue <SortIcon field="revenue" /></th>
                <th className="px-5 py-3 text-right">% Share</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('volume')}>Trips <SortIcon field="volume" /></th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('avg_booking')}>Avg Booking <SortIcon field="avg_booking" /></th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('yoy_growth_pct')}>YoY <SortIcon field="yoy_growth_pct" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {displayedDest.map((d, idx) => {
                const share = totalRev > 0 ? (d.revenue / totalRev * 100) : 0
                return (
                  <tr key={d.destination} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{d.destination}</td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">{fmtFull(d.revenue)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{share.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmtNum(d.volume)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmt(d.avg_booking)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {d.yoy_growth_pct != null ? (
                        <span className={d.yoy_growth_pct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {d.yoy_growth_pct >= 0 ? '+' : ''}{d.yoy_growth_pct.toFixed(1)}%
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── RegionsTab ──────────────────────────────────────────────────────────────*/

interface RegionRow {
  name: string
  revenue: number
  customers: number
  members: number
  zip_count: number
  population: number
  market_share: number
  rev_pct: number
}

export function RegionsTab() {
  const { line, period, startDate, endDate } = useSales()
  const c = useChartColors()

  const [mapData, setMapData] = useState<TerritoryMapData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchTerritoryMapData(period, startDate, endDate)
      .then(setMapData)
      .catch(() => setMapData(null))
      .finally(() => setLoading(false))
  }, [period, startDate, endDate])

  const regions = useMemo((): RegionRow[] => {
    if (!mapData) return []
    const rows: RegionRow[] = Object.entries(mapData.regions).map(([name, r]) => {
      const rev = line === 'Insurance' ? (r.ins_rev_cy || 0)
        : line === 'Travel' ? r.travel_rev_cy
        : r.travel_rev_cy + (r.ins_rev_cy || 0)
      const custs = line === 'Insurance' ? r.ins_cy
        : line === 'Travel' ? r.travel_3yr
        : r.ins_cy + r.travel_3yr
      return {
        name, revenue: rev, customers: custs, members: r.members,
        zip_count: r.zip_count, population: r.population,
        market_share: r.population > 0 ? (r.members / r.population * 100) : 0,
        rev_pct: 0,
      }
    })
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0)
    rows.forEach(r => r.rev_pct = totalRev > 0 ? (r.revenue / totalRev * 100) : 0)
    rows.sort((a, b) => b.revenue - a.revenue)
    return rows
  }, [mapData, line])

  const totalRev = regions.reduce((s, r) => s + r.revenue, 0)
  const totalMembers = regions.reduce((s, r) => s + r.members, 0)
  const totalPop = regions.reduce((s, r) => s + r.population, 0)
  const totalCusts = regions.reduce((s, r) => s + r.customers, 0)
  const COLORS = [c.primary, c.secondary, c.cyan, '#f59e0b', '#8b5cf6']

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!regions.length) return <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Map className="w-12 h-12 mb-3 opacity-30" /><p>No region data found</p></div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Bookings', value: fmt(totalRev) },
          { label: 'Active Customers', value: fmtNum(totalCusts) },
          { label: 'Members', value: fmtNum(totalMembers) },
          { label: 'Population', value: fmtNum(totalPop), sub: `${totalPop > 0 ? (totalMembers / totalPop * 100).toFixed(1) : 0}% market share` },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
            {card.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Bookings by Region</h2>
          <ResponsiveContainer width="100%" height={regions.length * 60 + 40}>
            <BarChart data={regions} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={c.grid} />
              <XAxis type="number" tickFormatter={fmt} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fill: c.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as RegionRow
                return (
                  <div style={tooltipStyle(c)} className="px-3 py-2 text-sm space-y-1">
                    <p className="font-semibold">{d.name}</p>
                    <p>Revenue: <span className="font-semibold" style={{ color: c.primary }}>{fmtFull(d.revenue)}</span></p>
                    <p>Customers: {fmtNum(d.customers)} • Members: {fmtNum(d.members)}</p>
                    <p>Population: {fmtNum(d.population)} • Mkt Share: {d.market_share.toFixed(1)}%</p>
                  </div>
                )
              }} cursor={{ fill: c.cursor }} />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}
                label={{ position: 'right', formatter: (v: any) => fmt(Number(v)), fill: c.tick, fontSize: 11 }}>
                {regions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Bookings Share</h2>
          <Pie3D
            data={regions.map((r, i) => ({ label: r.name, value: r.revenue, color: COLORS[i % COLORS.length], pct: r.rev_pct }))}
            height={Math.max(260, regions.length * 50)}
            formatter={fmtFull}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Region Comparison</h2>
          <button onClick={() => exportToExcel(regions.map((r, i) => ({
            Rank: i + 1, Region: r.name, Revenue: r.revenue, '% Share': `${r.rev_pct.toFixed(1)}%`,
            Customers: r.customers, Members: r.members, Zips: r.zip_count,
            Population: r.population, 'Market Share %': `${r.market_share.toFixed(1)}%`,
          })), `Top_Regions_${line}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="px-5 py-3 w-10">#</th>
                <th className="px-5 py-3">Region</th>
                <th className="px-5 py-3 text-right">Revenue</th>
                <th className="px-5 py-3 text-right">% Share</th>
                <th className="px-5 py-3 text-right">Customers</th>
                <th className="px-5 py-3 text-right">Members</th>
                <th className="px-5 py-3 text-right">Zips</th>
                <th className="px-5 py-3 text-right">Population</th>
                <th className="px-5 py-3 text-right">Mkt Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {regions.map((r, idx) => (
                <tr key={r.name} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                  <td className="px-5 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                      {r.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">{fmtFull(r.revenue)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{r.rev_pct.toFixed(1)}%</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmtNum(r.customers)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmtNum(r.members)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{r.zip_count}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmtNum(r.population)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={r.market_share > 3 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>
                      {r.market_share.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-foreground">Total</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{fmtFull(totalRev)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">100%</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{fmtNum(totalCusts)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{fmtNum(totalMembers)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{regions.reduce((s, r) => s + r.zip_count, 0)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{fmtNum(totalPop)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums">{totalPop > 0 ? (totalMembers / totalPop * 100).toFixed(1) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
