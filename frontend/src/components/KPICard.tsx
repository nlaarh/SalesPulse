import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Tip } from '@/components/MetricTip'

interface KPICardProps {
  title: string
  value: string
  delta?: number | null
  deltaLabel?: string
  icon?: React.ReactNode
  subtitle?: string
  className?: string
  tip?: string
}

export default function KPICard({ title, value, delta, deltaLabel, icon, subtitle, className, tip }: KPICardProps) {
  const trend = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  return (
    <div className={cn(
      'card-premium group relative overflow-hidden p-5',
      'animate-enter',
      className,
    )}>
      {/* Top accent line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}{tip && <Tip text={tip} />}
        </span>
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/12">
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3">
        <span className="tabular-nums text-[28px] font-bold leading-none tracking-tight text-foreground">
          {value}
        </span>
      </div>

      {subtitle && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}

      {trend && (
        <div className="mt-3 flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            trend === 'up' && 'bg-emerald-500/10 text-emerald-600',
            trend === 'down' && 'bg-rose-500/10 text-rose-600',
            trend === 'flat' && 'bg-muted text-muted-foreground',
          )}>
            {trend === 'up' && <TrendingUp className="h-3 w-3" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3" />}
            {trend === 'flat' && <Minus className="h-3 w-3" />}
            <span>{delta! > 0 ? '+' : ''}{delta!.toFixed(1)}%</span>
          </div>
          {deltaLabel && (
            <span className="text-[10px] text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
