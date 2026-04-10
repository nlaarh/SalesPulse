/**
 * TopCustomers — Executive view of highest-revenue customers.
 *
 * Queries closed-won Opportunities grouped by AccountId (no 1.9M Account scan).
 * Shows bar chart (top 10) + full sortable leaderboard.
 * Click any customer → Customer 360 view.
 */

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchTopCustomers, searchCustomers, type TopCustomer, type CustomerSummary } from '@/lib/api'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, Users, ExternalLink, ArrowUp, ArrowDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const LIMITS = [25, 50, 100] as const
type Limit = typeof LIMITS[number]
type SortField = 'total_rev' | 'deal_count' | 'avg_deal'

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

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

  const COVERAGE_COLOR: Record<string, string> = {
    PREMIER: 'text-amber-600', PLUS: 'text-blue-600', B: 'text-slate-500',
  }

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/40 transition-all">
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
                <span className="text-[10px] font-bold text-primary">
                  {(r.name || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-foreground truncate">{r.name}</span>
                  {r.coverage && (
                    <span className={cn('text-[10px] font-bold', COVERAGE_COLOR[r.coverage] ?? 'text-slate-500')}>
                      {r.coverage}
                    </span>
                  )}
                  {r.member_status_label && (
                    <span className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                      r.member_status === 'A' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500',
                    )}>
                      {r.member_status_label}
                    </span>
                  )}
                </div>
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

      {open && results.length === 0 && query.length >= 2 && !searching && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl px-4 py-3 text-sm text-muted-foreground/60">
          No customers found for "{query}"
        </div>
      )}
    </div>
  )
}

export default function TopCustomers() {
  const { line, startDate, endDate } = useSales()
  const navigate = useNavigate()
  const c = useChartColors()

  const [customers, setCustomers] = useState<TopCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState<Limit>(25)
  const [sortField, setSortField] = useState<SortField>('total_rev')
  const [sortAsc, setSortAsc] = useState(false)
  const [chartTopN, setChartTopN] = useState(10)

  useEffect(() => {
    setLoading(true)
    fetchTopCustomers(line, limit, startDate, endDate)
      .then(data => setCustomers(Array.isArray(data) ? data : []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [line, limit, startDate, endDate])

  const sorted = useMemo(() => {
    return [...customers].sort((a, b) => {
      const diff = a[sortField] - b[sortField]
      return sortAsc ? diff : -diff
    })
  }, [customers, sortField, sortAsc])

  const chartData = useMemo(
    () => sorted.slice(0, chartTopN).map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
      fullName: c.name,
      value: c.total_rev,
      account_id: c.account_id,
    })),
    [sorted, chartTopN],
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Top Customers</h1>
            <p className="text-sm text-slate-500">Highest revenue accounts from closed deals</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <CustomerSearchBox />
          {/* Limit toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {LIMITS.map(l => (
              <button
                key={l}
                onClick={() => setLimit(l)}
                className={cn(
                  'px-3 py-1 rounded-md text-sm font-medium transition-all',
                  limit === l
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                Top {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p>No customer data found for this period</p>
        </div>
      ) : (
        <>
          {/* Bar Chart */}
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Top Customers by Bookings
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Show top</label>
                <input
                  type="number"
                  min={1}
                  max={sorted.length || 50}
                  value={chartTopN}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) setChartTopN(v) }}
                  className="w-16 rounded-md border border-border bg-secondary/50 px-2 py-1 text-center text-[12px] font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[11px] text-muted-foreground">of {sorted.length}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 10, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke={c.grid} />
                <XAxis
                  type="number"
                  tickFormatter={fmt}
                  tick={{ fill: c.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fill: c.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursor }} />
                <Bar
                  dataKey="value"
                  radius={[0, 4, 4, 0]}
                  onClick={(d: any) => navigate(`/customer/${d.account_id}`)}
                  style={{ cursor: 'pointer' }}
                  label={{ position: 'right', formatter: (v: any) => fmt(Number(v)), fill: c.tick, fontSize: 11 }}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? c.primary : i < 3 ? c.secondary : c.cyan}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Full Leaderboard — {sorted.length} customers
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700">
                    <th className="px-5 py-3 w-10">#</th>
                    <th className="px-5 py-3">Customer</th>
                    <th
                      className="px-5 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                      onClick={() => toggleSort('total_rev')}
                    >
                      Bookings <SortIcon field="total_rev" />
                    </th>
                    <th
                      className="px-5 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                      onClick={() => toggleSort('deal_count')}
                    >
                      Deals <SortIcon field="deal_count" />
                    </th>
                    <th
                      className="px-5 py-3 text-right cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none"
                      onClick={() => toggleSort('avg_deal')}
                    >
                      Avg Deal <SortIcon field="avg_deal" />
                    </th>
                    <th className="px-5 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                  {sorted.map((cust, idx) => (
                    <tr
                      key={cust.account_id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/customer/${cust.account_id}`)}
                    >
                      <td className="px-5 py-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {cust.name || cust.account_id}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-white tabular-nums">
                        {fmtFull(cust.total_rev)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                        {cust.deal_count}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                        {fmt(cust.avg_deal)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
