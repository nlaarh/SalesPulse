/**
 * ECharts option builders for the Overview tab.
 * Pure functions — no React, no side effects.
 */

import type { ChartColors, Advisor } from './types'
import type { BranchEntry, MonthlyTargetMonth } from '@/lib/api'
import { fmtAxis } from '@/lib/formatters'
import { formatCurrency } from '@/lib/utils'

export const BAR_PALETTE: [string, string][] = [
  ['#3b82f6', '#1e40af'], ['#8b5cf6', '#5b21b6'], ['#06b6d4', '#0e7490'],
  ['#22c55e', '#15803d'], ['#f59e0b', '#b45309'], ['#ec4899', '#9d174d'],
  ['#f97316', '#c2410c'], ['#6366f1', '#4338ca'], ['#14b8a6', '#0f766e'],
  ['#a855f7', '#7e22ce'],
]

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Annual Gauge ─────────────────────────────────────────────────────────────

export function buildGaugeOption(achievementPct: number, pacePct: number, c: ChartColors) {
  const pct  = Math.min(Math.max(achievementPct, 0), 130)
  const color =
    pct >= pacePct        ? '#22c55e' :
    pct >= pacePct * 0.85 ? '#f59e0b' : '#ef4444'

  const clampedPace = Math.min(Math.max(pacePct, 0), 130)

  return {
    backgroundColor: 'transparent',
    animation: true,
    series: [
      {
        type: 'gauge',
        center: ['50%', '70%'],
        startAngle: 180, endAngle: 0,
        min: 0, max: 130,
        radius: '96%',
        progress: {
          show: true, width: 22,
          itemStyle: { color, shadowBlur: 24, shadowColor: `${color}44` },
        },
        axisLine: { lineStyle: { width: 22, color: [[1, c.grid]] } },
        pointer: {
          show: true,
          length: '48%',
          width: 3,
          itemStyle: {
            color: color,
          }
        },
        anchor: {
          show: true,
          showAbove: true,
          size: 8,
          itemStyle: {
            color: color,
          }
        },
        axisTick: { show: false },
        splitLine: {
          show: true, distance: -30, length: 6,
          lineStyle: { color: c.tick, width: 1, opacity: 0.5 },
        },
        axisLabel: {
          distance: -42, fontSize: 9, color: c.tick,
          formatter: (v: number) => v % 50 === 0 ? `${v}%` : '',
        },
        detail: {
          valueAnimation: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (v: any) =>
            `{pct|${Number(v).toFixed(0)}%}\n{lbl|of annual goal}\n{pace|target pace: ${Math.round(pacePct)}%}`,
          rich: {
            pct:  { fontSize: 28, fontWeight: 'bold', color, lineHeight: 34 },
            lbl:  { fontSize: 10, color: c.tick, lineHeight: 15 },
            pace: { fontSize: 10, fontWeight: 'bold', color: '#22c55e', lineHeight: 18 },
          },
          offsetCenter: [0, '-5%'],
        },
        data: [{ value: pct }],
      },
      {
        type: 'gauge',
        center: ['50%', '70%'],
        startAngle: 180, endAngle: 0,
        min: 0, max: 130,
        radius: '96%',
        axisLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        pointer: {
          show: true,
          length: '96%',
          width: 5,
          icon: 'path://M -0.01,0 L 0.01,0 L 0.01,-80 L 2,-80 L 2,-100 L -2,-100 L -2,-80 L -0.01,-80 L -0.01,0 Z',
          itemStyle: {
            color: '#22c55e', // Always green as requested
          }
        },
        anchor: {
          show: false
        },
        detail: {
          show: false,
        },
        data: [{ value: clampedPace }]
      }
    ],
  }
}

// ── Monthly Progress Chart (actual bars + dashed target line) ─────────────────

export function buildMonthlyBulletOption(
  months: MonthlyTargetMonth[],
  currentMonthIdx: number,    // 0-indexed Jan=0
  c: ChartColors,
) {
  const filled = Array.from({ length: 12 }, (_, i) => {
    const m = months.find(x => x.month === i + 1)
    return m ?? { month: i + 1, target: 0, actual: 0, achievement_pct: null }
  })

  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const pacePct = dayOfMonth / daysInMonth

  const currentMonthEntry = filled[currentMonthIdx]
  const currentMonthTarget = currentMonthEntry ? (currentMonthEntry.target || 0) : 0
  const paceTargetValue = currentMonthTarget * pacePct
  const currentMonthActual = currentMonthEntry ? (currentMonthEntry.actual || 0) : 0
  const currentMonthPct = currentMonthTarget > 0 ? (currentMonthActual / currentMonthTarget) * 100 : 0
  const isAhead = currentMonthActual >= paceTargetValue
  const paceColor = isAhead ? '#22c55e' : '#ef4444'

  const barColor = (m: MonthlyTargetMonth, i: number): string | object => {
    if (i > currentMonthIdx) return '#64748b22'
    if (i === currentMonthIdx) return {
      type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [{ offset: 0, color: '#60a5fa' }, { offset: 1, color: '#2563eb' }],
    }
    if (!m.target) return '#94a3b844'
    if (m.actual >= m.target)       return '#22c55e'
    if (m.actual >= m.target * 0.8) return '#f59e0b'
    return '#ef4444'
  }

  return {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 28, right: 16, bottom: 36, left: 52 },
    xAxis: {
      type: 'category', data: MONTH_LABELS,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: c.tick, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { color: c.tick, fontSize: 10, formatter: (v: number) => fmtAxis(v) },
    },
    legend: {
      top: 4, right: 0, textStyle: { fontSize: 10, color: c.tick },
      itemWidth: 14, itemHeight: 2,
      data: [
        { name: 'Actual', icon: 'rect' },
        { name: 'Target', icon: 'line' },
      ],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any[]) => {
        const idx = params[0]?.dataIndex ?? 0
        const m = filled[idx]
        const achPct = m.target > 0 ? Math.round(m.actual / m.target * 100) : null
        const col    = achPct !== null ? (achPct >= 100 ? '#22c55e' : achPct >= 80 ? '#f59e0b' : '#ef4444') : '#94a3b8'
        return `<b>${MONTH_LABELS[m.month - 1]}</b><br/>` +
          `Actual: <b>${formatCurrency(m.actual, true)}</b><br/>` +
          `Target: <b>${formatCurrency(m.target, true)}</b>` +
          (achPct !== null ? `<br/>Achievement: <b style="color:${col}">${achPct}%</b>` : '')
      },
    },
    series: [
      // Actual bars — color-coded green/amber/red/blue/ghost
      {
        type: 'bar', name: 'Actual', barMaxWidth: 44,
        data: filled.map((m, i) => ({
          value: m.actual || 0,
          itemStyle: {
            color: barColor(m, i),
            borderRadius: [3, 3, 0, 0],
            shadowBlur: i === currentMonthIdx ? 14 : 0,
            shadowColor: i === currentMonthIdx ? '#3b82f666' : 'transparent',
            shadowOffsetY: i === currentMonthIdx ? -2 : 0,
          },
        })),
        z: 2,
        label: {
          show: true, position: 'top', fontSize: 9, color: c.tick,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter: (p: any) => (p.value as number) > 0 ? formatCurrency(p.value as number, true) : '',
        },
        markLine: currentMonthTarget > 0 ? {
          symbol: ['none', 'none'],
          label: {
            show: true,
            position: 'middle',
            offset: [42, 0],
            formatter: `${currentMonthPct.toFixed(1)}%\u00A0current`,
            fontSize: 9,
            fontWeight: 'bold',
            color: '#ffffff',
            backgroundColor: c.primary,
            borderRadius: 3,
            padding: [2, 4],
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.2)',
          },
          lineStyle: {
            color: c.primary,
            width: 2.2,
            type: 'dashed',
          },
          data: [
            [
              { coord: [currentMonthIdx - 0.25, currentMonthActual] },
              { coord: [currentMonthIdx + 0.25, currentMonthActual] }
            ]
          ],
          z: 4,
        } : undefined,
      },
      // Dashed target line — connects monthly target values
      {
        type: 'line', name: 'Target',
        data: filled.map(m => m.target > 0 ? m.target : null),
        lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
        itemStyle: { color: '#f59e0b' },
        symbol: 'circle', symbolSize: 5,
        connectNulls: false,
        z: 3,
      },
      // Pace Line — dummy series to carry independent pace markLine
      {
        type: 'line',
        name: 'PaceLine',
        showSymbol: false,
        data: [],
        markLine: currentMonthTarget > 0 ? {
          symbol: ['none', 'none'],
          label: {
            show: true,
            position: 'middle',
            offset: [-42, 0],
            formatter: `${Math.round(pacePct * 100)}%\u00A0pace`,
            fontSize: 9,
            fontWeight: 'bold',
            color: '#ffffff',
            backgroundColor: paceColor,
            borderRadius: 3,
            padding: [2, 4],
            shadowBlur: 4,
            shadowColor: 'rgba(0, 0, 0, 0.2)',
          },
          lineStyle: {
            color: paceColor,
            width: 2.2,
            type: 'solid',
          },
          data: [
            [
              { coord: [currentMonthIdx - 0.25, paceTargetValue] },
              { coord: [currentMonthIdx + 0.25, paceTargetValue] }
            ]
          ],
          z: 4,
        } : undefined,
      },
    ],
  }
}

// ── Branch Contribution (horizontal bar + % share) ────────────────────────────

export function buildBranchBarOption(
  branches: BranchEntry[],
  c: ChartColors,
  totalValue = 0,
) {
  const sorted   = [...branches]
    .filter(b => b.total_commission > 0)
    .sort((a, b) => b.total_commission - a.total_commission)
    .slice(0, 8)
  const reversed = [...sorted].reverse()
  const total    = totalValue > 0 ? totalValue : sorted.reduce((s, b) => s + b.total_commission, 0)

  return {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 4, right: 92, bottom: 4, left: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category', data: reversed.map(b => b.branch),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { fontSize: 10, fontWeight: 500 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (p: any) => {
        const b = reversed[p.dataIndex as number]
        if (!b) return ''
        const pct = total > 0 ? Math.round(b.total_commission / total * 100) : 0
        return `<b>${b.branch}</b><br/>` +
          `Commission: <b>${formatCurrency(b.total_commission, true)}</b><br/>` +
          `Share: <b>${pct}%</b><br/>` +
          `Sales: <b>${formatCurrency(b.total_sales, true)}</b>`
      },
    },
    series: [{
      type: 'bar', barMaxWidth: 22,
      data: reversed.map((b, i) => {
        const [from, to] = BAR_PALETTE[i % BAR_PALETTE.length]
        return {
          value: b.total_commission,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [{ offset: 0, color: `${from}aa` }, { offset: 1, color: to }] },
            shadowBlur: 8, shadowColor: `${from}33`, shadowOffsetY: 2,
          },
        }
      }),
      label: {
        show: true, position: 'right',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const pct = total > 0 ? Math.round((p.value as number) / total * 100) : 0
          return `${formatCurrency(p.value as number, true)}  ${pct > 0 ? `${pct}%` : ''}`
        },
        color: c.tick, fontSize: 9,
      },
    }],
  }
}

// ── Advisor Leaderboard (horizontal bar + % share) ────────────────────────────

export function buildAdvisorBarOption(
  reversed8: Advisor[],
  isInsurance: boolean,
  c: ChartColors,
  totalValue = 0,
) {
  const total = totalValue > 0
    ? totalValue
    : reversed8.reduce((s, a) => s + (isInsurance ? a.bookings : (a.commission > 0 ? a.commission : a.bookings)), 0)

  return {
    backgroundColor: 'transparent',
    animation: true,
    grid: { top: 4, right: 106, bottom: 4, left: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: reversed8.map(a => {
        const parts = a.name.split(' ')
        return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : a.name
      }),
      axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { fontSize: 11, fontWeight: 500 },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (p: any) => {
        const a = reversed8[p.dataIndex as number]
        if (!a) return ''
        const pct = total > 0 ? Math.round((p.value as number) / total * 100) : 0
        const branchStr = a.branch ? `<br/>Branch: <b>${a.branch}</b>` : ''
        return `<b>${a.name}</b>${branchStr}<br/>` +
          `${isInsurance ? 'Written Premium' : 'Commission'}: <b>${formatCurrency(p.value as number, true)}</b><br/>` +
          `Share: <b>${pct}%</b><br/>` +
          `Deals: <b>${a.deals}</b> &nbsp; Win: <b>${Math.round((a.win_rate ?? 0) * 100)}%</b><br/>` +
          `Pipeline: <b>${formatCurrency(a.pipeline_value, true)}</b>`
      },
    },
    series: [{
      type: 'bar', barMaxWidth: 26, cursor: 'pointer',
      data: reversed8.map((a, i) => {
        const [from, to] = BAR_PALETTE[i % BAR_PALETTE.length]
        const val = isInsurance ? a.bookings : (a.commission > 0 ? a.commission : a.bookings)
        return {
          value: val,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [{ offset: 0, color: `${from}bb` }, { offset: 1, color: to }] },
            shadowBlur: 10, shadowColor: `${from}44`, shadowOffsetY: 2,
          },
        }
      }),
      label: {
        show: true, position: 'right',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (p: any) => {
          const pct = total > 0 ? Math.round((p.value as number) / total * 100) : 0
          return `${formatCurrency(p.value as number, true)}  ${pct > 0 ? `${pct}%` : ''}`
        },
        color: c.tick, fontSize: 10,
      },
    }],
  }
}
