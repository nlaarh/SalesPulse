import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchTopCustomers, type TopCustomer } from '@/lib/api'
import { useChartColors, tooltipStyle, ChartGradients } from '@/lib/chart-theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, Users, ExternalLink, ArrowUp, ArrowDown, Download } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'
import { fmt, fmtFull, CustomerSearchBox } from './shared'

type SortField = 'total_rev' | 'deal_count' | 'avg_deal'

export function CustomersTab() {
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

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Top {chartData.length} by Bookings
        </h2>
        <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 32)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
            <ChartGradients colors={c} idPrefix="customers" />
            <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
            <XAxis type="number" tickFormatter={fmt} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: c.cursor }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} onClick={(d: any) => navigate(`/customer/${d.account_id}`)} style={{ cursor: 'pointer' }}
              label={{ position: 'right', formatter: (v: any) => fmt(Number(v)), fill: c.tick, fontSize: 11 }}>
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
