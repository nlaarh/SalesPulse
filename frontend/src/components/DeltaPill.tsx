/**
 * DeltaPill — compact percentage-change badge.
 *
 * Shows a green/red/neutral pill with trend icon and formatted value.
 * Used in KPI cards, chart headers, and comparison rows.
 *
 * @param value    - The delta value to display (positive = up, negative = down)
 * @param suffix   - Unit suffix, e.g. '%', 'pts', '% YoY'  (default: '%')
 * @param invert   - Flip the color logic (negative = good, e.g. days-to-close)
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DeltaPill({
  value,
  suffix = '%',
  invert = false,
}: {
  value: number
  suffix?: string
  invert?: boolean
}) {
  if (value == null) return null

  const positive = invert ? value < 0 : value > 0
  const negative = invert ? value > 0 : value < 0

  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Minus className="h-2.5 w-2.5" /> 0{suffix}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        positive && 'bg-emerald-500/10 text-emerald-500',
        negative && 'bg-rose-500/10 text-rose-500',
      )}
    >
      {positive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {value > 0 ? '+' : ''}
      {typeof value === 'number' ? value.toFixed(1) : value}
      {suffix}
    </span>
  )
}
