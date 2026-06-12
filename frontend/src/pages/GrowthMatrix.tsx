import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, ReferenceLine,
} from 'recharts'
import { fetchZipTable } from '@/lib/api_growth'

const QUADRANT_COLORS: Record<string, string> = {
  Defend: '#22c55e',
  Grow: '#3b82f6',
  Activate: '#f59e0b',
  Retreat: '#ef4444',
  Maintain: '#6b7280',
}

const SEGMENT_COLORS: Record<string, string> = {
  'Established Suburban': '#3b82f6',
  'Rural / Residential': '#22c55e',
  'Urban / Multi-Family': '#f59e0b',
  'University / Student': '#8b5cf6',
  'Unknown': '#6b7280',
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

export default function GrowthMatrix() {
  const nav = useNavigate()
  const [colorBy, setColorBy] = useState<'quadrant' | 'segment'>('quadrant')
  const [filterQuadrant, setFilterQuadrant] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['growth-matrix'],
    queryFn: () => fetchZipTable({ limit: 560, sort: 'opp_total' }),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const rows = filterQuadrant
    ? data.rows.filter(r => r.quadrant === filterQuadrant)
    : data.rows

  // Scatter: X = mem_pen, Y = opp_total, Z (bubble size) = active_members
  const scatterData = rows
    .filter(r => r.mem_pen != null && r.opp_total > 0)
    .map(r => ({
      ...r,
      x: (r.mem_pen || 0) * 100,
      y: r.opp_total / 1_000_000,
      z: r.active_members,
      color: colorBy === 'quadrant'
        ? QUADRANT_COLORS[r.quadrant] || '#6b7280'
        : SEGMENT_COLORS[r.segment] || '#6b7280',
    }))

  // Medians for reference lines
  const medX = scatterData.length
    ? scatterData.map(d => d.x).sort((a, b) => a - b)[Math.floor(scatterData.length / 2)]
    : 25

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prioritization Matrix</h1>
          <p className="text-sm text-gray-500 mt-1">
            X = Membership Penetration · Y = Opportunity $ · Bubble = Members
          </p>
        </div>
        <button onClick={() => nav('/growth')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
          ← Back to Scorecard
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-gray-600">Color by:</label>
        <select value={colorBy} onChange={e => setColorBy(e.target.value as 'quadrant' | 'segment')}
          className="text-sm border rounded px-2 py-1">
          <option value="quadrant">Quadrant</option>
          <option value="segment">Customer Segment</option>
        </select>
        <label className="text-sm text-gray-600 ml-4">Filter:</label>
        <select value={filterQuadrant} onChange={e => setFilterQuadrant(e.target.value)}
          className="text-sm border rounded px-2 py-1">
          <option value="">All Quadrants</option>
          {Object.keys(QUADRANT_COLORS).map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
        {/* Legend */}
        <div className="flex gap-3 ml-auto">
          {Object.entries(colorBy === 'quadrant' ? QUADRANT_COLORS : SEGMENT_COLORS).map(([k, c]) => (
            <span key={k} className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: c }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Scatter Chart */}
      <div className="bg-white rounded-xl shadow p-4">
        <ResponsiveContainer width="100%" height={450}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" name="Mem Pen %"
              label={{ value: 'Membership Penetration %', position: 'insideBottom', offset: -10 }}
              tick={{ fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Opportunity $M"
              label={{ value: 'Opportunity ($M)', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 11 }} />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="Members" />
            <ReferenceLine x={medX} stroke="#999" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Scatter data={scatterData}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={0.7}
                  cursor="pointer"
                  onClick={() => nav(`/territory/${d.zip}`)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Priority Table */}
      <div className="bg-white rounded-xl shadow p-4 overflow-auto">
        <h3 className="font-semibold text-gray-800 mb-3">
          Top {Math.min(50, rows.length)} Priority ZIPs
          {filterQuadrant && <span className="text-sm font-normal text-gray-500 ml-2">({filterQuadrant})</span>}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500 text-xs uppercase">
              <th className="pb-2">ZIP</th>
              <th className="pb-2">City</th>
              <th className="pb-2">County</th>
              <th className="pb-2">Segment</th>
              <th className="pb-2">Quadrant</th>
              <th className="pb-2 text-right">Mem Pen</th>
              <th className="pb-2 text-right">Ins X-Sell</th>
              <th className="pb-2 text-right">Friction</th>
              <th className="pb-2 text-right">Opp Total</th>
              <th className="pb-2 text-right">Opp Auto</th>
              <th className="pb-2 text-right">Opp Home</th>
              <th className="pb-2 text-right">Opp Travel</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map(r => (
              <tr key={r.zip} className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => nav(`/territory/${r.zip}`)}>
                <td className="py-1.5 font-mono text-blue-600 font-medium">{r.zip}</td>
                <td className="py-1.5">{r.city}</td>
                <td className="py-1.5">{r.county}</td>
                <td className="py-1.5 text-xs">{r.segment}</td>
                <td className="py-1.5">
                  <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: QUADRANT_COLORS[r.quadrant] }}>
                    {r.quadrant}
                  </span>
                </td>
                <td className="py-1.5 text-right">{fmtPct(r.mem_pen)}</td>
                <td className="py-1.5 text-right">{fmtPct(r.ins_xsell)}</td>
                <td className="py-1.5 text-right">{r.friction}</td>
                <td className="py-1.5 text-right font-medium">{fmtM(r.opp_total)}</td>
                <td className="py-1.5 text-right">{fmtM(r.opp_auto)}</td>
                <td className="py-1.5 text-right">{fmtM(r.opp_home)}</td>
                <td className="py-1.5 text-right">{fmtM(r.opp_travel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-bold">{d.zip} — {d.city}, {d.county}</p>
      <p>Segment: {d.segment}</p>
      <p>Quadrant: <span style={{ color: QUADRANT_COLORS[d.quadrant] }}>{d.quadrant}</span></p>
      <p>Mem Penetration: {d.x.toFixed(1)}%</p>
      <p>Opportunity: {fmtM(d.opp_total)}</p>
      <p>Members: {d.active_members.toLocaleString()}</p>
      <p className="text-xs text-gray-400 mt-1">Click to drill down</p>
    </div>
  )
}
