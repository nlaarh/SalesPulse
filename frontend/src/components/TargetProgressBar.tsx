import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface TargetProgressBarProps {
  label: string
  actual: number
  target: number
  pacePct: number
  paceLabel: string
  color: 'indigo' | 'green'
}

function paceStatus(achievementPct: number, pacePct: number) {
  const diff = achievementPct - pacePct
  if (diff > 5) return { text: 'Ahead of pace ✓', cls: 'text-emerald-500' }
  if (diff >= -5) return { text: 'On pace', cls: 'text-amber-500' }
  return { text: 'Behind pace ⚠', cls: 'text-rose-500' }
}

export default function TargetProgressBar({ label, actual, target, pacePct, paceLabel, color }: TargetProgressBarProps) {
  if (target <= 0) return null

  const rawPct = (actual / target) * 100
  const achievementPct = Math.min(rawPct, 150)
  const barWidthPct = Math.min(achievementPct, 100)
  const pace = paceStatus(rawPct, pacePct)
  const remaining = Math.max(target - actual, 0)
  const isOver = rawPct > 100

  const barBg = color === 'indigo' ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
  const barFill = isOver
    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
    : color === 'indigo'
      ? 'bg-gradient-to-r from-indigo-500/50 to-indigo-500/90'
      : 'bg-gradient-to-r from-emerald-500/50 to-emerald-500/90'

  const pctText = `${rawPct >= 100 ? Math.round(rawPct) : rawPct.toFixed(1)}%`
  const showInside = barWidthPct >= 12

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <span className="tabular-nums text-[14px]">
          <span className={cn('font-bold', color === 'indigo' ? 'text-indigo-500' : 'text-emerald-500')}>
            {formatCurrency(actual, true)}
          </span>
          <span className="font-medium text-muted-foreground"> / {formatCurrency(target, true)}</span>
        </span>
      </div>
      <div className={cn('relative h-7 overflow-hidden rounded-full', barBg)}>
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full flex items-center transition-all duration-700', barFill, showInside ? 'justify-end pr-2.5' : 'justify-start')}
          style={{ width: `${Math.max(barWidthPct, 2)}%` }}
        >
          {showInside && (
            <span className="text-[13px] font-bold text-white drop-shadow-sm tabular-nums">
              {pctText}
            </span>
          )}
        </div>
        {/* Achievement % outside the bar when fill is too small */}
        {!showInside && (
          <span
            className={cn('absolute top-1/2 -translate-y-1/2 text-[12px] font-bold tabular-nums',
              color === 'indigo' ? 'text-indigo-600' : 'text-emerald-600')}
            style={{ left: `${Math.max(barWidthPct, 2) + 1}%` }}
          >
            {pctText}
          </span>
        )}
        {/* Pace marker */}
        <div
          className="absolute inset-y-0 w-0.5 z-10 bg-foreground/30"
          style={{ left: `${Math.min(pacePct, 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className={cn('font-semibold', pace.cls)} style={{ marginLeft: `${Math.max(Math.min(pacePct, 100) - 5, 0)}%` }}>
          ▲ {paceLabel} — {pace.text}
        </span>
        <span className="font-medium text-muted-foreground tabular-nums">
          {isOver ? `${pctText} of target 🎉` : `${formatCurrency(remaining, true)} to go`}
        </span>
      </div>
    </div>
  )
}
