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

  const achievementPct = Math.min((actual / target) * 100, 100)
  const pace = paceStatus(achievementPct, pacePct)
  const remaining = Math.max(target - actual, 0)

  const barBg = color === 'indigo' ? 'bg-indigo-500/10' : 'bg-emerald-500/10'
  const barFill = color === 'indigo'
    ? 'bg-gradient-to-r from-indigo-500/50 to-indigo-500/90'
    : 'bg-gradient-to-r from-emerald-500/50 to-emerald-500/90'

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
          className={cn('absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-2.5 transition-all duration-700', barFill)}
          style={{ width: `${Math.max(achievementPct, 3)}%` }}
        >
          {achievementPct >= 12 && (
            <span className="text-[13px] font-bold text-white drop-shadow-sm tabular-nums">
              {achievementPct.toFixed(1)}%
            </span>
          )}
        </div>
        {/* Pace marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white/50 z-10"
          style={{ left: `${pacePct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className={cn('font-semibold', pace.cls)} style={{ marginLeft: `${Math.max(pacePct - 5, 0)}%` }}>
          ▲ {paceLabel} — {pace.text}
        </span>
        <span className="font-medium text-muted-foreground tabular-nums">
          {formatCurrency(remaining, true)} to go
        </span>
      </div>
    </div>
  )
}
