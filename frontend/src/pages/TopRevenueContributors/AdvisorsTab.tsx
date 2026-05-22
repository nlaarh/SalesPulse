import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchAdvisorLeaderboard, fetchBranchMonthly, type BranchMonthlyData } from '@/lib/api'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Loader2, Users, Building2, ChevronRight, Download, ArrowUp, ArrowDown } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'
import { fmt, fmtFull, fmtNum, Pie3D } from './shared'

/* ── Shared ─────────────────────────────────────────────────────────────────*/

const ADV_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#14b8a6','#ec4899','#84cc16']
const BRANCH_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#14b8a6']

function ShareBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="tabular-nums text-[11px] font-semibold w-9 text-right">{pct.toFixed(1)}%</span>
      <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 4, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

/* ── AdvisorsTab ─────────────────────────────────────────────────────────── */

type AdvSort = 'primary' | 'deals' | 'win_rate'

export function AdvisorsTab() {
  const { line, period, startDate, endDate } = useSales()
  const navigate = useNavigate()
  const c = useChartColors()
  const [advisors, setAdvisors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<AdvSort>('primary')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchAdvisorLeaderboard(line, period, startDate, endDate)
      .then(d => setAdvisors(d.advisors ?? []))
      .catch(() => setAdvisors([]))
      .finally(() => setLoading(false))
  }, [line, period, startDate, endDate])

  const getVal = (a: any) => a.commission || 0
  const metricLabel = 'Commission'

  const sorted = useMemo(() =>
    [...advisors].sort((a, b) => {
      const av = sortField === 'deals' ? (a.deals || 0) : sortField === 'win_rate' ? (a.win_rate || 0) : getVal(a)
      const bv = sortField === 'deals' ? (b.deals || 0) : sortField === 'win_rate' ? (b.win_rate || 0) : getVal(b)
      return sortAsc ? av - bv : bv - av
    }),
    [advisors, sortField, sortAsc],
  )

  const totalPrimary = useMemo(() => advisors.reduce((s, a) => s + getVal(a), 0), [advisors])
  const totalDeals   = useMemo(() => advisors.reduce((s, a) => s + (a.deals || 0), 0), [advisors])
  const avgPrimary   = advisors.length > 0 ? totalPrimary / advisors.length : 0

  const chartData = useMemo(() =>
    sorted.slice(0, 20).map(a => ({
      name: a.name.length > 18 ? a.name.slice(0, 16) + '…' : a.name,
      fullName: a.name,
      value: getVal(a),
    })),
    [sorted],
  )

  const pieData = useMemo(() =>
    sorted.slice(0, 10).map((a, i) => ({
      label: a.name.split(' ').slice(-1)[0] || a.name,
      value: getVal(a),
      color: ADV_COLORS[i % ADV_COLORS.length],
      pct: totalPrimary > 0 ? (getVal(a) / totalPrimary * 100) : 0,
    })),
    [sorted, totalPrimary],
  )

  function toggleSort(field: AdvSort) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  function SortIcon({ field }: { field: AdvSort }) {
    if (sortField !== field) return <span className="opacity-20 ml-1">↕</span>
    return sortAsc
      ? <ArrowUp className="inline w-3 h-3 ml-1 opacity-70" />
      : <ArrowDown className="inline w-3 h-3 ml-1 opacity-70" />
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!advisors.length) return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <Users className="w-12 h-12 mb-3 opacity-30" />
      <p>No advisor data found</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: `Total ${metricLabel}`, value: fmt(totalPrimary) },
          { label: 'Total Advisors',       value: fmtNum(advisors.length) },
          { label: `Avg ${metricLabel}`,   value: fmt(avgPrimary) },
          { label: 'Total Deals',          value: fmtNum(totalDeals) },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Top {chartData.length} Advisors by {metricLabel}
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
                {chartData.map((_, i) => <Cell key={i} fill={ADV_COLORS[i % ADV_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {metricLabel} Share — Top 10
          </h2>
          <Pie3D data={pieData} height={Math.max(260, pieData.length * 40)} formatter={fmtFull} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {advisors.length} Advisors — ranked by {metricLabel.toLowerCase()}
            </h2>
          </div>
          <button
            onClick={() => exportToExcel(sorted.map((a, i) => ({
              Rank: i + 1, Advisor: a.name, Branch: a.branch ?? '',
              [metricLabel]: getVal(a),
              'Share %': totalPrimary > 0 ? parseFloat((getVal(a) / totalPrimary * 100).toFixed(2)) : 0,
              Deals: a.deals ?? 0, 'Win Rate': a.win_rate ?? 0,
            })), `Advisors_${line}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="px-5 py-3 w-10">#</th>
                <th className="px-5 py-3">Advisor</th>
                {line === 'Travel' && <th className="px-5 py-3">Branch</th>}
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('primary')}>
                  {metricLabel} <SortIcon field="primary" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('deals')}>
                  Deals <SortIcon field="deals" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('win_rate')}>
                  Win % <SortIcon field="win_rate" />
                </th>
                <th className="px-5 py-3 text-right">Share of Total</th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((a, idx) => {
                const val      = getVal(a)
                const sharePct = totalPrimary > 0 ? (val / totalPrimary * 100) : 0
                const color    = ADV_COLORS[idx % ADV_COLORS.length]
                return (
                  <tr
                    key={a.name}
                    className="hover:bg-muted/50 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/agent/${encodeURIComponent(a.name)}`)}
                  >
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                    <td className="px-5 py-3 font-medium text-primary">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        {a.name}
                      </div>
                    </td>
                    {line === 'Travel' && <td className="px-5 py-3 text-[12px] text-muted-foreground">{a.branch ?? '—'}</td>}
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtFull(val)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums text-[12px]">{a.deals ?? 0}</td>
                    <td className={cn(
                      'px-5 py-3 text-right tabular-nums text-[12px]',
                      (a.win_rate ?? 0) >= 55 ? 'text-emerald-500'
                        : (a.win_rate ?? 0) < 35 ? 'text-rose-500'
                        : 'text-muted-foreground',
                    )}>
                      {(a.win_rate ?? 0).toFixed(1)}%
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ShareBar pct={sharePct} color={color} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-foreground text-[12px]" colSpan={line === 'Travel' ? 2 : 1}>
                  Total ({advisors.length} advisors)
                </td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums text-[12px]">{fmtFull(totalPrimary)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums text-[12px]">{fmtNum(totalDeals)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums text-[12px]">—</td>
                <td className="px-5 py-3 text-right text-muted-foreground font-semibold text-[12px]">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ── BranchesTab ─────────────────────────────────────────────────────────── */

type BranchSort = 'commission' | 'sales' | 'comm_pct'

export function BranchesTab() {
  const { line, period, startDate, endDate } = useSales()
  const c = useChartColors()
  const [data, setData] = useState<BranchMonthlyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<BranchSort>('commission')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchBranchMonthly(line, period, startDate, endDate)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [line, period, startDate, endDate])

  const sorted = useMemo(() => {
    if (!data) return []
    return [...data.branches].sort((a, b) => {
      const av = sortField === 'sales' ? a.total_sales
        : sortField === 'comm_pct' ? (a.total_sales > 0 ? a.total_commission / a.total_sales : 0)
        : a.total_commission
      const bv = sortField === 'sales' ? b.total_sales
        : sortField === 'comm_pct' ? (b.total_sales > 0 ? b.total_commission / b.total_sales : 0)
        : b.total_commission
      return sortAsc ? av - bv : bv - av
    })
  }, [data, sortField, sortAsc])

  const totalComm  = useMemo(() => sorted.reduce((s, b) => s + b.total_commission, 0), [sorted])
  const totalSales = useMemo(() => sorted.reduce((s, b) => s + b.total_sales, 0), [sorted])

  const chartData = useMemo(() =>
    sorted.slice(0, 20).map(b => ({
      name: b.branch.length > 18 ? b.branch.slice(0, 16) + '…' : b.branch,
      fullName: b.branch,
      value: b.total_commission,
    })),
    [sorted],
  )

  const pieData = useMemo(() =>
    sorted.map((b, i) => ({
      label: b.branch,
      value: b.total_commission,
      color: BRANCH_COLORS[i % BRANCH_COLORS.length],
      pct: totalComm > 0 ? (b.total_commission / totalComm * 100) : 0,
    })),
    [sorted, totalComm],
  )

  function toggleSort(field: BranchSort) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(false) }
  }

  function SortIcon({ field }: { field: BranchSort }) {
    if (sortField !== field) return <span className="opacity-20 ml-1">↕</span>
    return sortAsc
      ? <ArrowUp className="inline w-3 h-3 ml-1 opacity-70" />
      : <ArrowDown className="inline w-3 h-3 ml-1 opacity-70" />
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  if (!data || !data.branches.length) return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <Building2 className="w-12 h-12 mb-3 opacity-30" />
      <p>Branch data is available for the Travel line only</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Commission', value: fmt(totalComm) },
          { label: 'Gross Sales',      value: fmt(totalSales) },
          { label: 'Avg Comm %',       value: totalSales > 0 ? `${(totalComm / totalSales * 100).toFixed(1)}%` : '—' },
          { label: 'Branches',         value: fmtNum(data.branches.length) },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Commission by Branch
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 48)}>
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
                {chartData.map((_, i) => <Cell key={i} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Commission Share by Branch
          </h2>
          <Pie3D data={pieData} height={Math.max(260, pieData.length * 50)} formatter={fmtFull} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {data.branches.length} Branches
            </h2>
          </div>
          <button
            onClick={() => exportToExcel(sorted.map((b, i) => ({
              Rank: i + 1, Branch: b.branch,
              Commission: b.total_commission,
              'Gross Sales': b.total_sales,
              'Comm %': b.total_sales > 0 ? parseFloat((b.total_commission / b.total_sales * 100).toFixed(2)) : 0,
              'Share %': totalComm > 0 ? parseFloat((b.total_commission / totalComm * 100).toFixed(2)) : 0,
            })), `Branches_${line}`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
                <th className="px-5 py-3 w-10">#</th>
                <th className="px-5 py-3">Branch / Office</th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('commission')}>
                  Commission <SortIcon field="commission" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('sales')}>
                  Gross Sales <SortIcon field="sales" />
                </th>
                <th className="px-5 py-3 text-right cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('comm_pct')}>
                  Comm % <SortIcon field="comm_pct" />
                </th>
                <th className="px-5 py-3 text-right">Share of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sorted.map((b, i) => {
                const commPct  = b.total_sales > 0 ? (b.total_commission / b.total_sales) * 100 : 0
                const sharePct = totalComm > 0 ? (b.total_commission / totalComm) * 100 : 0
                const color    = BRANCH_COLORS[i % BRANCH_COLORS.length]
                return (
                  <tr key={b.branch} className="hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        {b.branch}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{fmtFull(b.total_commission)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums text-[12px]">{fmtFull(b.total_sales)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums text-[12px]">
                      {commPct > 0 ? `${commPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ShareBar pct={sharePct} color={color} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-foreground text-[12px]">Total</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums text-[12px]">{fmtFull(totalComm)}</td>
                <td className="px-5 py-3 text-right text-foreground tabular-nums text-[12px]">{fmtFull(totalSales)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground tabular-nums text-[12px]">
                  {totalSales > 0 ? `${(totalComm / totalSales * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-5 py-3 text-right text-muted-foreground font-semibold text-[12px]">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
