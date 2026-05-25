import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface TargetProgressBarProps {
  label: string
  actual: number
  target: number
  pacePct: number
  paceLabel: string
  color: 'indigo' | 'green'
  contribution?: {
    pct: number
    actual: number
    total: number
  }
}

function paceStatus(achievementPct: number, pacePct: number) {
  const diff = achievementPct - pacePct
  if (diff > 5) return { text: 'Ahead of pace ✓', cls: 'text-emerald-500' }
  if (diff >= -5) return { text: 'On pace', cls: 'text-amber-500' }
  return { text: 'Behind pace ⚠', cls: 'text-rose-500' }
}

export default function TargetProgressBar({ label, actual, target, pacePct, paceLabel, color, contribution }: TargetProgressBarProps) {
  if (target <= 0) return null

  const rawPct = (actual / target) * 100
  const achievementPct = Math.min(rawPct, 150)
  const barWidthPct = Math.min(achievementPct, 100)
  const pace = paceStatus(rawPct, pacePct)
  const remaining = Math.max(target - actual, 0)
  const isOver = rawPct > 100
  const isAhead = rawPct >= pacePct

  const barBg = color === 'indigo' ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
  const barFill = isOver
    ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
    : color === 'indigo'
      ? 'bg-gradient-to-r from-indigo-500/50 to-indigo-500/90'
      : 'bg-gradient-to-r from-emerald-500/50 to-emerald-500/90'

  const pctText = `${rawPct >= 100 ? Math.round(rawPct) : rawPct.toFixed(1)}%`
  const clampedPacePct = Math.min(pacePct, 100)

  // Avoid overlaps when labels are close
  const isClose = Math.abs(barWidthPct - clampedPacePct) < 12
  let paceTransform = 'translateX(-50%)'
  let currentTransform = 'translateX(-50%)'

  if (isClose) {
    if (barWidthPct >= clampedPacePct) {
      paceTransform = 'translateX(-100%)'
      currentTransform = 'translateX(10%)'
    } else {
      paceTransform = 'translateX(10%)'
      currentTransform = 'translateX(-100%)'
    }
  }

  return (
    <div>
      <div className="mb-2 space-y-0.5">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular-nums text-[14px] shrink-0">
            <span className={cn('font-bold', color === 'indigo' ? 'text-indigo-500' : 'text-emerald-500')}>
              {formatCurrency(actual, true)}
            </span>
            <span className="font-medium text-muted-foreground"> / {formatCurrency(target, true)}</span>
            <span className="text-muted-foreground font-semibold ml-1.5">({pctText})</span>
          </span>
        </div>
      </div>
      {/* Bar + pace/current markers (positioned relative so labels can sit above bar) */}
      <div className="relative mt-4">
        {/* Pace label + arrow above bar */}
        {clampedPacePct > 0 && clampedPacePct < 100 && (
          <div
            className="pointer-events-none absolute -top-4 z-20 flex flex-col items-center"
            style={{ left: `${clampedPacePct}%`, transform: paceTransform }}
          >
            <span className={cn('text-[9px] font-bold tabular-nums leading-none whitespace-nowrap', isAhead ? 'text-emerald-500' : 'text-rose-500')}>
              {Math.round(clampedPacePct)}% pace
            </span>
            <div className={cn('mt-0.5 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent', isAhead ? 'border-t-emerald-500/60' : 'border-t-rose-500/60')} />
          </div>
        )}
        {/* Current progress label + arrow above bar */}
        {barWidthPct > 0 && barWidthPct <= 100 && (
          <div
            className="pointer-events-none absolute -top-4 z-20 flex flex-col items-center"
            style={{ left: `${barWidthPct}%`, transform: currentTransform }}
          >
            <span className={cn('text-[9px] font-bold tabular-nums leading-none whitespace-nowrap', color === 'indigo' ? 'text-indigo-500' : 'text-emerald-500')}>
              {pctText} current
            </span>
            <div className={cn('mt-0.5 w-0 h-0 border-l-[3px] border-r-[3px] border-t-[4px] border-l-transparent border-r-transparent', color === 'indigo' ? 'border-t-indigo-500/60' : 'border-t-emerald-500/60')} />
          </div>
        )}
        <div className={cn('relative h-7 overflow-hidden rounded-full', barBg)}>
          <div
            className={cn('absolute inset-y-0 left-0 rounded-full flex items-center transition-all duration-700', barFill)}
            style={{ width: `${Math.max(barWidthPct, 2)}%` }}
          />
          {/* Current progress boundary line */}
          <div
            className={cn('absolute inset-y-0 w-[2px] z-10', color === 'indigo' ? 'bg-indigo-600/60' : 'bg-emerald-600/60')}
            style={{ left: `${barWidthPct}%` }}
          />
          {/* Pace marker line — visible, colored by status */}
          <div
            className={cn('absolute inset-y-0 w-[2px] z-10', isAhead ? 'bg-emerald-500/50' : 'bg-rose-500/70')}
            style={{ left: `${clampedPacePct}%` }}
          />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] whitespace-nowrap overflow-hidden">
        <span className={cn('font-semibold truncate min-w-0', pace.cls)}>
          ▲ {paceLabel} — {pace.text}
        </span>
        <span className="font-medium text-muted-foreground tabular-nums shrink-0">
          {isOver ? `${pctText} of target 🎉` : `${formatCurrency(remaining, true)} to go`}
        </span>
      </div>
      {contribution && contribution.total > 0 && (
        <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
          <span className="text-muted-foreground font-medium">Division Contribution:</span>
          <span className="font-semibold text-foreground/90 tabular-nums">
            {contribution.pct.toFixed(1)}% <span className="text-muted-foreground font-normal">({formatCurrency(contribution.actual, true)} of {formatCurrency(contribution.total, true)})</span>
          </span>
        </div>
      )}
    </div>
  )
}
