import { formatCurrency } from '@/lib/utils'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'

interface TrendMonth {
  label: string
  revenue: number
  deals: number
}

interface YoYMonth {
  month: number
  label: string
  current_revenue: number
  prior_revenue: number
}

interface TrendWithOverlayProps {
  trend: TrendMonth[]
  yoy: {
    months: YoYMonth[]
    current_year: number
    prior_year: number
  } | null
}

export default function TrendWithOverlay({ trend, yoy }: TrendWithOverlayProps) {
  const c = useChartColors()

  // Build merged dataset: current year trend with prior year overlay
  // Use the trend data as base (it already has the right labels)
  // Match prior year data by month number
  const priorMap = new Map<number, number>()
  if (yoy) {
    yoy.months.forEach((m) => {
      if (m.prior_revenue > 0) priorMap.set(m.month, m.prior_revenue)
    })
  }

  const chartData = trend.map((t) => {
    // Extract month from label like "2025-04"
    const parts = t.label.split('-')
    const monthNum = parseInt(parts[1], 10)
    const yearNum = parseInt(parts[0], 10)
    const shortLabel = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthNum - 1]} '${String(yearNum).slice(2)}`

    // Only show prior year data for months that exist in current year portion
    const isCurrentYear = yoy ? yearNum === yoy.current_year : false
    const priorRevenue = isCurrentYear ? (priorMap.get(monthNum) || null) : null

    return {
      label: shortLabel,
      fullLabel: t.label,
      revenue: t.revenue,
      prior: priorRevenue,
    }
  })

  const priorYearLabel = yoy ? String(yoy.prior_year) : ''
  const currentYearLabel = yoy ? String(yoy.current_year) : ''

  return (
    <div className="card-premium animate-enter h-full">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Bookings by Month</h2>
        {yoy && (
          <span className="text-[11px] text-muted-foreground">
            Solid: {currentYearLabel} &middot; Dashed: {priorYearLabel} (Prior Year)
          </span>
        )}
      </div>
      <div className="p-5">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.primary} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: c.tick, fontSize: 11 }}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000 ? `$${(v / 1000).toFixed(0)}K`
                  : `$${v}`
                }
                width={55}
              />
              <Tooltip
                contentStyle={tooltipStyle(c)}
                formatter={(v, name) => {
                  if (v == null) return [null, null]
                  const isPrior = String(name).includes('Prior')
                  const label = isPrior ? `${priorYearLabel} (Prior Year)` : `${currentYearLabel} Revenue`
                  return [formatCurrency(Number(v), true), label]
                }}
                labelFormatter={(l) => String(l)}
                cursor={{ stroke: c.cursor, strokeWidth: 1 }}
              />
              {priorMap.size > 0 && (
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              )}

              {/* Prior year: dashed line, no fill */}
              {priorMap.size > 0 && (
                <Area
                  type="monotone"
                  dataKey="prior"
                  name={`${priorYearLabel} (Prior Year)`}
                  stroke={c.tick}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  fill="none"
                  dot={false}
                  connectNulls={false}
                />
              )}

              {/* Current year: solid area */}
              <Area
                type="monotone"
                dataKey="revenue"
                name={priorMap.size > 0 ? 'Current' : 'Revenue'}
                stroke={c.primary}
                strokeWidth={2}
                fill="url(#trendGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: c.primary,
                  stroke: c.activeDotStroke,
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No trend data available
          </div>
        )}
      </div>
    </div>
  )
}
