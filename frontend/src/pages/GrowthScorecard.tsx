import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { fetchScorecard, fetchZipTable } from '@/lib/api_growth'

const QUADRANT_COLORS: Record<string, string> = {
  Defend: '#22c55e',
  Grow: '#3b82f6',
  Activate: '#f59e0b',
  Retreat: '#ef4444',
  Maintain: '#6b7280',
}

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtNum(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function GrowthScorecard() {
  const nav = useNavigate()
  const [selectedQuadrant, setSelectedQuadrant] = useState<string | null>(null)

  const { data: scorecard, isLoading } = useQuery({
    queryKey: ['growth-scorecard'],
    queryFn: fetchScorecard,
    staleTime: 5 * 60 * 1000,
  })

  const { data: zipData } = useQuery({
    queryKey: ['growth-zips', selectedQuadrant],
    queryFn: () => fetchZipTable({
      quadrant: selectedQuadrant || undefined,
      limit: 20,
      sort: 'opp_total',
    }),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading || !scorecard) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const { totals, quadrants, waterfall } = scorecard

  // Waterfall chart data
  const waterfallData = [
    { name: 'Current Revenue', value: waterfall.current, fill: '#6b7280' },
    { name: '+ Cross-Sell', value: waterfall.cross_sell_opp, fill: '#3b82f6' },
    { name: '+ Acquisition', value: waterfall.acquisition_opp, fill: '#22c55e' },
    { name: '+ Travel Growth', value: waterfall.travel_growth, fill: '#8b5cf6' },
    { name: 'Target $120M', value: waterfall.target, fill: '#f59e0b' },
  ]

  // Opportunity by product (pie)
  const oppData = [
    { name: 'Auto Insurance', value: totals.opp_auto, color: '#3b82f6' },
    { name: 'Home Insurance', value: totals.opp_home, color: '#22c55e' },
    { name: 'Travel', value: totals.opp_travel, color: '#8b5cf6' },
    { name: 'Membership', value: totals.opp_membership, color: '#f59e0b' },
  ]

  // Quadrant pie
  const quadrantData = Object.entries(quadrants).map(([name, value]) => ({
    name, value, color: QUADRANT_COLORS[name] || '#6b7280',
  }))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Path to $120M — Growth Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totals.zips} ZIPs · {fmtNum(totals.active_members)} active members · {fmtM(totals.opp_total)} total opportunity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/growth/product-report')}
            className="px-4 py-2 bg-[#002B5C] text-white rounded-lg hover:bg-[#003d80] text-sm font-medium"
          >
            Product Deep-Dive →
          </button>
          <button
            onClick={() => nav('/growth/matrix')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Prioritization Matrix →
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Member Penetration" value={fmtPct(totals.mem_pen)} sub={`${fmtNum(totals.active_members)} members / ${fmtNum(totals.adults_18p)} adults`} />
        <KpiCard label="Insurance Cross-Sell" value={fmtPct(totals.ins_xsell)} sub={`${fmtNum(totals.ins_customers)} ins / ${fmtNum(totals.active_members)} members`} />
        <KpiCard label="Travel Engagement" value={fmtPct(totals.travel_eng)} sub={`${fmtNum(totals.travel_customers)} travel / ${fmtM(totals.travel_revenue)} rev`} />
        <KpiCard label="Total Opportunity" value={fmtM(totals.opp_total)} sub="Addressable gap × conversion × LTV" color="text-green-600" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Waterfall */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Revenue Path to $120M</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={waterfallData} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1e6).toFixed(0)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {waterfallData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Opportunity by Product */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Opportunity by Product</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={oppData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={50} outerRadius={90} paddingAngle={2}>
                {oppData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmtM(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quadrant Distribution + Priority Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quadrant Donut */}
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-gray-800 mb-3">ZIP Quadrant Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={quadrantData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={40} outerRadius={80} paddingAngle={1}
                onClick={(d) => setSelectedQuadrant(d.name === selectedQuadrant ? null : (d.name || null))}>
                {quadrantData.map((d, i) => (
                  <Cell key={i} fill={d.color} stroke={d.name === selectedQuadrant ? '#000' : 'none'} strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          {selectedQuadrant && (
            <p className="text-center text-sm text-gray-600 mt-2">
              Showing <strong>{selectedQuadrant}</strong> ZIPs · <button onClick={() => setSelectedQuadrant(null)} className="text-blue-600 underline">Clear</button>
            </p>
          )}
        </div>

        {/* Priority ZIP Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow p-4 overflow-auto">
          <h3 className="font-semibold text-gray-800 mb-3">
            {selectedQuadrant ? `${selectedQuadrant} ZIPs` : 'Top Priority ZIPs'} — by Opportunity $
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2">ZIP</th>
                <th className="pb-2">City</th>
                <th className="pb-2">County</th>
                <th className="pb-2">Segment</th>
                <th className="pb-2">Quadrant</th>
                <th className="pb-2 text-right">Opportunity</th>
                <th className="pb-2 text-right">Mem Pen</th>
                <th className="pb-2 text-right">Ins X-Sell</th>
              </tr>
            </thead>
            <tbody>
              {(zipData?.rows || []).map((r) => (
                <tr key={r.zip} className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/territory/${r.zip}`)}>
                  <td className="py-1.5 font-mono text-blue-600">{r.zip}</td>
                  <td className="py-1.5">{r.city}</td>
                  <td className="py-1.5">{r.county}</td>
                  <td className="py-1.5 text-xs">{r.segment}</td>
                  <td className="py-1.5">
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: QUADRANT_COLORS[r.quadrant] }}>
                      {r.quadrant}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-medium">{fmtM(r.opp_total)}</td>
                  <td className="py-1.5 text-right">{fmtPct(r.mem_pen)}</td>
                  <td className="py-1.5 text-right">{fmtPct(r.ins_xsell)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
