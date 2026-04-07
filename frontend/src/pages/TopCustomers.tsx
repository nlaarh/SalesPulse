/**
 * TopCustomers — Executive view of highest-revenue customers.
 *
 * Queries closed-won Opportunities grouped by AccountId (no 1.9M Account scan).
 * Shows bar chart (top 10) + full sortable leaderboard.
 * Click any customer → Customer 360 view.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchTopCustomers, type TopCustomer } from '@/lib/api'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, Users, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react'
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

export default function TopCustomers() {
  const { line, startDate, endDate } = useSales()
  const navigate = useNavigate()
  const c = useChartColors()

  const [customers, setCustomers] = useState<TopCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState<Limit>(25)
  const [sortField, setSortField] = useState<SortField>('total_rev')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchTopCustomers(line, limit, startDate, endDate)
      .then(setCustomers)
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
    () => sorted.slice(0, 10).map(c => ({
      name: c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
      fullName: c.name,
      value: c.total_rev,
      account_id: c.account_id,
    })),
    [sorted],
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
          {/* Bar Chart — top 10 */}
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
              Top 10 by Revenue
            </h2>
            <ResponsiveContainer width="100%" height={320}>
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
                      Revenue <SortIcon field="total_rev" />
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
