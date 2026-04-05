/**
 * 3D Horizontal Sales Funnel — shared SVG visualization.
 *
 * Used by AdvisorDashboard (compact variant) and Pipeline (full-size variant).
 * Accepts funnel data + layout sizing props so each consumer can control dimensions.
 */

import { formatCurrency, formatNumber, formatPct } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import { GitBranch, ChevronRight } from 'lucide-react'

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface FunnelStep {
  step: string
  count: number
  pct: number
}

export interface FunnelData {
  steps: FunnelStep[]
  won_revenue: number
  win_rate: number
  lost_count?: number
}

interface FunnelChartProps {
  funnel: FunnelData | null
  /** 'compact' = AdvisorDashboard style, 'full' = Pipeline style */
  variant?: 'compact' | 'full'
}

/* ── Palette (shared across variants) ─────────────────────────────────────── */

const PALETTE = [
  { face: '#22d3ee', side: '#0891b2', glow: 'rgba(34,211,238,0.10)' },
  { face: '#3b82f6', side: '#1d4ed8', glow: 'rgba(59,130,246,0.10)' },
  { face: '#8b5cf6', side: '#6d28d9', glow: 'rgba(139,92,246,0.10)' },
  { face: '#f59e0b', side: '#d97706', glow: 'rgba(245,158,11,0.10)' },
  { face: '#10b981', side: '#059669', glow: 'rgba(16,185,129,0.10)' },
]

/* ── Component ────────────────────────────────────────────────────────────── */

export default function FunnelChart({ funnel, variant = 'compact' }: FunnelChartProps) {
  if (!funnel || !funnel.steps?.length) {
    return (
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[12px] font-semibold">Sales Funnel</h3>
        </div>
        <div className="flex h-[100px] items-center justify-center text-[11px] text-muted-foreground">
          No funnel data available
        </div>
      </div>
    )
  }

  const steps = funnel.steps
  const maxCount = steps[0]?.count || 1
  const winRate = funnel.win_rate ?? 0
  const n = steps.length

  // Layout dimensions differ by variant
  const isFull = variant === 'full'
  const svgW = isFull ? 600 : 520
  const svgH = isFull ? 160 : 120
  const cy = svgH / 2
  const gap = isFull ? 4 : 3
  const padX = isFull ? 24 : 20
  const stepW = (svgW - padX - gap * (n - 1)) / n
  const maxH = isFull ? 110 : 76
  const minH = isFull ? 28 : 18
  const depth = isFull ? 7 : 5
  const startX = isFull ? 14 : 12
  const maxSvgHeight = isFull ? 160 : 110

  // Text sizes differ by variant
  const labelFontSize = isFull ? 10 : 8
  const countFontSize = isFull ? 13 : 10
  const pctFontSize = isFull ? 9 : 8
  const convFontSize = isFull ? 8 : 7
  const pctOffsetY = isFull ? 14 : 12

  // Unique prefix for SVG gradient/filter IDs to avoid collisions
  const idPrefix = isFull ? 'pf' : 'hf'

  return (
    <div>
      <div className={`flex items-center justify-between border-b border-border ${isFull ? 'px-5 py-3' : 'px-4 py-2'}`}>
        <div className="flex items-center gap-2">
          <GitBranch className={`${isFull ? 'h-4 w-4' : 'h-3.5 w-3.5'} text-primary`} />
          <h2 className={`${isFull ? 'text-sm' : 'text-[12px]'} font-semibold tracking-tight`}>
            Sales Funnel<Tip text={TIPS.pipeline} />
          </h2>
          <span className={`${isFull ? 'text-[11px]' : 'text-[10px]'} text-muted-foreground`}>
            {funnel.won_revenue ? `${formatCurrency(funnel.won_revenue, true)} won` : 'Lead \u2192 Won'}
          </span>
        </div>
        <div className={`flex items-center ${isFull ? 'gap-4' : 'gap-3'} text-[11px]`}>
          {funnel.won_revenue != null && (
            <span className="tabular-nums font-semibold text-emerald-500">
              {isFull ? `${winRate.toFixed(1)}% win rate` : `${formatPct(winRate)} win`}
            </span>
          )}
          {isFull && funnel.lost_count != null && funnel.lost_count > 0 && (
            <span className="tabular-nums font-semibold text-rose-500">{formatNumber(funnel.lost_count)} lost</span>
          )}
          {!isFull && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/25" />}
        </div>
      </div>
      <div className={isFull ? 'px-4 py-3' : 'px-3 py-1.5'}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: maxSvgHeight }} preserveAspectRatio="xMidYMid meet">
          <defs>
            {steps.map((_, i) => {
              const pal = PALETTE[i % PALETTE.length]
              return (
                <linearGradient key={`${idPrefix}g${i}`} id={`${idPrefix}g${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={pal.face} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={pal.face} stopOpacity="0.5" />
                </linearGradient>
              )
            })}
            <filter id={`${idPrefix}Glow`}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
            </filter>
          </defs>

          {steps.map((step, i) => {
            const pal = PALETTE[i % PALETTE.length]
            const ratio = Math.max(step.count / maxCount, 0.18)
            const nextRatio = steps[i + 1]
              ? Math.max(steps[i + 1].count / maxCount, 0.18)
              : ratio * 0.55
            const leftH = minH + (maxH - minH) * ratio
            const rightH = steps[i + 1] ? minH + (maxH - minH) * nextRatio : leftH * 0.55
            const x = startX + i * (stepW + gap)

            const frontPts = [
              `${x},${cy - leftH / 2}`,
              `${x + stepW},${cy - rightH / 2}`,
              `${x + stepW},${cy + rightH / 2}`,
              `${x},${cy + leftH / 2}`,
            ].join(' ')

            const botPts = [
              `${x},${cy + leftH / 2}`,
              `${x + stepW},${cy + rightH / 2}`,
              `${x + stepW + depth * 0.4},${cy + rightH / 2 + depth}`,
              `${x + depth * 0.4},${cy + leftH / 2 + depth}`,
            ].join(' ')

            const rightPts = [
              `${x + stepW},${cy - rightH / 2}`,
              `${x + stepW + depth * 0.4},${cy - rightH / 2 + depth}`,
              `${x + stepW + depth * 0.4},${cy + rightH / 2 + depth}`,
              `${x + stepW},${cy + rightH / 2}`,
            ].join(' ')

            const convRate = steps[i + 1] && step.count > 0
              ? (steps[i + 1].count / step.count * 100) : null

            return (
              <g key={step.step}>
                <rect x={x - 3} y={cy - leftH / 2 - 3} width={stepW + 6} height={leftH + 6} rx="4" fill={pal.glow} filter={`url(#${idPrefix}Glow)`} />
                <polygon points={botPts} fill={pal.side} fillOpacity="0.35" stroke={pal.side} strokeWidth="0.5" strokeOpacity="0.2" />
                <polygon points={rightPts} fill={pal.side} fillOpacity="0.4" stroke={pal.side} strokeWidth="0.5" strokeOpacity="0.2" />
                <polygon points={frontPts} fill={`url(#${idPrefix}g${i})`} stroke={pal.face} strokeWidth="1" strokeOpacity="0.5" />

                <text x={x + stepW / 2} y={cy - 3} textAnchor="middle" fill="white" fontSize={labelFontSize} fontWeight="700">{step.step}</text>
                <text x={x + stepW / 2} y={cy + 8} textAnchor="middle" fill="white" fillOpacity="0.95" fontSize={countFontSize} fontWeight="800" fontFamily="ui-monospace, monospace">{formatNumber(step.count)}</text>

                {i > 0 && (
                  <text x={x + stepW / 2} y={cy + leftH / 2 + depth + pctOffsetY} textAnchor="middle" fill="currentColor" className="text-muted-foreground" fontSize={pctFontSize} fontWeight="600">
                    {steps[0].count > 0 ? (step.count / steps[0].count * 100).toFixed(0) : 0}%
                  </text>
                )}

                {convRate != null && (
                  <text x={x + stepW + gap / 2} y={cy - leftH / 2 - (isFull ? 3 : 2)} textAnchor="middle" fontSize={convFontSize} fontWeight="700"
                    fill={convRate >= 50 ? '#10b981' : convRate >= 25 ? '#f59e0b' : '#ef4444'}>
                    {convRate.toFixed(0)}%
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
