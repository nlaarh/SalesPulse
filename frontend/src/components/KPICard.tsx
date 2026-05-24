import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Tip } from '@/components/MetricTip'
import { motion } from 'framer-motion'

interface KPICardProps {
  title: string
  value: string
  delta?: number | null
  deltaLabel?: string
  icon?: React.ReactNode
  subtitle?: string
  className?: string
  tip?: string
  accentColor?: string
}

export default function KPICard({
  title, value, delta, deltaLabel, icon, subtitle, className, tip, accentColor,
}: KPICardProps) {
  const trend = delta == null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  return (
    <motion.div
      className={cn('card-premium group relative overflow-hidden p-5', className)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
    >
      {/* Per-accent top glow line */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: accentColor
            ? `linear-gradient(90deg, transparent, ${accentColor}80, transparent)`
            : 'linear-gradient(90deg, transparent, var(--si-primary)50, transparent)',
        }}
      />

      {/* Icon background glow */}
      {accentColor && (
        <div
          className="absolute -top-8 -right-8 h-20 w-20 rounded-full blur-2xl opacity-20 pointer-events-none"
          style={{ background: accentColor }}
        />
      )}

      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {title}{tip && <Tip text={tip} />}
        </span>
        {icon && (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{
              background: accentColor ? `${accentColor}14` : 'var(--si-primary-soft)',
              color:      accentColor ?? 'var(--si-primary)',
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3">
        <span className="tabular-nums text-[28px] font-extrabold leading-none tracking-tight text-foreground">
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
            trend === 'up'   && 'bg-emerald-500/10 text-emerald-500',
            trend === 'down' && 'bg-rose-500/10 text-rose-500',
            trend === 'flat' && 'bg-muted text-muted-foreground',
          )}>
            {trend === 'up'   && <TrendingUp   className="h-3 w-3" />}
            {trend === 'down' && <TrendingDown  className="h-3 w-3" />}
            {trend === 'flat' && <Minus         className="h-3 w-3" />}
            <span>{delta! > 0 ? '+' : ''}{delta!.toFixed(1)}%</span>
          </div>
          {deltaLabel && (
            <span className="text-[11px] font-medium text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      )}
    </motion.div>
  )
}
