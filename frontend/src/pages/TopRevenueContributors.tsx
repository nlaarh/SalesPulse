/**
 * TopRevenueContributors — Unified revenue ranking page.
 *
 * Three tabs:
 *   Customers   — Top accounts by closed-won bookings (line-filtered)
 *   Destinations — Top travel destinations by revenue (Travel only)
 *   Regions     — Revenue breakdown by operating region (line-filtered)
 */

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchTopCustomers, searchCustomers, fetchTravelDestinations,
  fetchTerritoryMapData,
  type TopCustomer, type CustomerSummary, type TerritoryMapData,
} from '@/lib/api'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import {
  Loader2, Users, ExternalLink, ArrowUp, ArrowDown,
  Search, X, MapPin, Globe, DollarSign, TrendingUp,
  Download, UserCheck, Plane, Map,
} from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function fmtNum(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

type Tab = 'customers' | 'destinations' | 'regions'

const TABS: { key: Tab; label: string; icon: typeof UserCheck }[] = [
  { key: 'customers', label: 'Customers', icon: UserCheck },
  { key: 'destinations', label: 'Destinations', icon: Plane },
  { key: 'regions', label: 'Regions', icon: Map },
]

/* ── Customer Search Box ─────────────────────────────────────────────────── */

function CustomerSearchBox() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setSearching(true)
    searchCustomers(q)
      .then(r => { setResults(r); setOpen(true) })
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 350)
  }

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(id: string) {
    setQuery(''); setResults([]); setOpen(false)
    navigate(`/customer/${id}`)
  }

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40 transition-all">
        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50 shrink-0" /> : <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
        <input
          value={query}
          onChange={onChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by name, member # or email…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 text-foreground"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>
            <X className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => pick(r.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left border-b border-border/50 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-primary">{(r.name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold text-foreground truncate">{r.name}</span>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/60 flex-wrap">
                  {r.member_id && <span className="font-mono"># {r.member_id}</span>}
                  {r.email && <span>{r.email}</span>}
                  {r.city && <span>{r.city}{r.state ? `, ${r.state}` : ''}</span>}
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground/30 mt-1 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Customers Tab ───────────────────────────────────────────────────────── */

type SortField = 'total_rev' | 'deal_count' | 'avg_deal'

function CustomersTab() {
  const { line, startDate, endDate } = useSales()
  const navigate = useNavigate()
  const c = useChartColors()

  const [customers, setCustomers] = useState<TopCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [topN, setTopN] = useState(25)
  const [sortField, setSortField] = useState<SortField>('total_rev')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchTopCustomers(line, topN, startDate, endDate)
      .then(data => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [line, topN, startDate, endDate])

  const sorted = useMemo(() =>
    [...customers].sort((a, b) => sortAsc ? a[sortField] - b[sortField] : b[sortField] - a[sortField]),
    [customers, sortField, sortAsc],
  )

  const chartData = useMemo(
    () => sorted.slice(0, Math.min(topN, 20)).map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
      fullName: c.name,
      value: c.total_rev,
      account_id: c.account_id,
    })),
    [sorted, topN],
  )

  function toggleSort(field: SortField) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="opacity-20 ml-1">↕</span>
    return sortAsc
      ? <ArrowUp className="inline w-3 h-3 ml-1 opacity-70" />
      : <ArrowDown className="inline w-3 h-3 ml-1 opacity-70" />
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={tooltipStyle(c)} className="px-3 py-2 text-sm">
        <p className="font-semibold mb-1">{d.fullName}</p>
        <p style={{ color: c.primary }}>{fmtFull(d.value)}</p>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!customers.length) return <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Users className="w-12 h-12 mb-3 opacity-30" /><p>No customer data found</p></div>

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <CustomerSearchBox />
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Show top</label>
          <input
            type="number" min={1} max={200} value={topN}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) setTopN(v) }}
            className="w-16 rounded-md border border-border bg-secondary/50 px-2 py-1 text-center text-[12px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Bar Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Top {chartData.length} by Bookings
        </h2>
        <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" tickFormatter={fmt} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursor }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d: any) => navigate(`/customer/${d.account_id}`)} style={{ cursor: 'pointer' }}
              label={{ position: 'right', formatter: (v: any) => fmt(Number(v)), fill: c.tick, fontSize: 11 }}>
              {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? c.primary : i < 3 ? c.secondary : c.cyan} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Leaderboard */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Full Leaderboard — {sorted.length} customers
          </h2>
          <button onClick={() => exportToExcel(sorted.map((c, i) => ({
            Rank: i + 1, Customer: c.name, Advisor: c.advisor,
            Bookings: c.total_rev, Deals: c.deal_count, 'Avg Deal': c.avg_deal,
          })), `Top_Customers_${line}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="px-5 py-3 w-10">#</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Advisor</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('total_rev')}>
                  Bookings <SortIcon field="total_rev" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('deal_count')}>
                  Deals <SortIcon field="deal_count" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('avg_deal')}>
                  Avg Deal <SortIcon field="avg_deal" />
                </th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((cust, idx) => (
                <tr key={cust.account_id} className="hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => navigate(`/customer/${cust.account_id}`)}>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{cust.name || cust.account_id}</td>
                  <td className="px-5 py-3 text-[12px] text-muted-foreground">{cust.advisor || '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-foreground tabular-nums">{fmtFull(cust.total_rev)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{cust.deal_count}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">{fmt(cust.avg_deal)}</td>
                  <td className="px-5 py-3 text-center"><ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── Destinations Tab ────────────────────────────────────────────────────── */

interface Destination {
  destination: string
  revenue: number
  volume: number
  avg_booking: number
  yoy_growth_pct: number | null
  prev_revenue: number
}

type DestSort = 'revenue' | 'volume' | 'avg_booking' | 'yoy_growth_pct'

function DestinationsTab() {
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
      {/* Top N control */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Show top</span>
        <input type="number" min={1} max={200} value={topN}
          onChange={e => setTopN(Math.max(1, Math.min(200, Number(e.target.value) || 25)))}
          className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground" />
      </div>
      {/* Bar Chart */}
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

      {/* Table */}
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
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('revenue')}>
                  Revenue <SortIcon field="revenue" />
                </th>
                <th className="px-5 py-3 text-right">% Share</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('volume')}>
                  Trips <SortIcon field="volume" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('avg_booking')}>
                  Avg Booking <SortIcon field="avg_booking" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('yoy_growth_pct')}>
                  YoY <SortIcon field="yoy_growth_pct" />
                </th>
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

/* ── Regions Tab ─────────────────────────────────────────────────────────── */

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

function RegionsTab() {
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
    const entries = Object.entries(mapData.regions)
    const rows: RegionRow[] = entries.map(([name, r]) => {
      const rev = line === 'Insurance' ? (r.ins_rev_cy || 0)
        : line === 'Travel' ? r.travel_rev_cy
        : r.travel_rev_cy + (r.ins_rev_cy || 0)
      const custs = line === 'Insurance' ? r.ins_cy
        : line === 'Travel' ? r.travel_3yr
        : r.ins_cy + r.travel_3yr
      return {
        name,
        revenue: rev,
        customers: custs,
        members: r.members,
        zip_count: r.zip_count,
        population: r.population,
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
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Bookings</p>
          <p className="mt-1 text-xl font-bold text-foreground">{fmt(totalRev)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Active Customers</p>
          <p className="mt-1 text-xl font-bold text-foreground">{fmtNum(totalCusts)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Members</p>
          <p className="mt-1 text-xl font-bold text-foreground">{fmtNum(totalMembers)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Population</p>
          <p className="mt-1 text-xl font-bold text-foreground">{fmtNum(totalPop)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{totalPop > 0 ? (totalMembers / totalPop * 100).toFixed(1) : 0}% market share</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Horizontal bar */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Bookings by Region
          </h2>
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

        {/* Pie chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Revenue Share
          </h2>
          <ResponsiveContainer width="100%" height={regions.length * 60 + 40}>
            <PieChart>
              <Pie
                data={regions}
                dataKey="revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, rev_pct }: any) => `${name} ${rev_pct.toFixed(1)}%`}
              >
                {regions.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                return <div style={tooltipStyle(c)} className="px-3 py-2 text-sm"><p className="font-semibold">{d.name}</p><p style={{ color: c.primary }}>{fmtFull(d.revenue)}</p></div>
              }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Region comparison table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Region Comparison
          </h2>
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
              {/* Totals row */}
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

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function TopRevenueContributors() {
  const { line } = useSales()
  const [tab, setTab] = useState<Tab>('customers')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-enter">
        <p className="text-[12px] font-medium text-muted-foreground">Revenue Analysis</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Top Revenue Contributors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {line === 'All' ? 'All business lines' : `${line} division`} — Ranked by bookings
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'regions' && <RegionsTab />}
    </div>
  )
}
