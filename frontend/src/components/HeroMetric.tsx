import { cn } from '@/lib/utils'
import { formatCurrency, formatNumber, formatPct } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface HeroMetricProps {
  bookings: number
  bookingsYoyPct: number
  commission: number
  commissionYoyPct: number
  comparisonLabel: string
  deals: number
  winRate: number
  avgDeal: number
  pipelineValue: number
  line: string
  periodLabel: string
}

export default function HeroMetric({
  bookings, bookingsYoyPct, commission, commissionYoyPct,
  comparisonLabel, deals, winRate, avgDeal, pipelineValue,
  line, periodLabel,
}: HeroMetricProps) {
  return (
    <div className="animate-enter">
      {/* Context line */}
      <p className="text-[12px] font-medium text-muted-foreground">
        {line} Division &middot; {periodLabel}
      </p>

      {/* Two hero numbers side by side */}
      <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
        {/* Bookings — primary */}
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="tabular-nums text-[36px] font-bold leading-none tracking-tight text-foreground">
              {formatCurrency(bookings, true)}
            </span>
            <Delta pct={bookingsYoyPct} label={comparisonLabel} />
          </div>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Bookings
          </p>
        </div>

        {/* Commission — secondary (only show if > 0) */}
        {commission > 0 && (
          <div>
            <div className="flex items-baseline gap-2.5">
              <span className="tabular-nums text-[36px] font-bold leading-none tracking-tight text-primary">
                {formatCurrency(commission, true)}
              </span>
              <Delta pct={commissionYoyPct} label={comparisonLabel} />
            </div>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Commission Revenue
            </p>
          </div>
        )}
      </div>

      {/* Supporting metrics */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        <Stat label="Won Deals" value={formatNumber(deals)} />
        <Sep />
        <Stat label="Win Rate" value={formatPct(winRate)} highlight={winRate >= 50} />
        <Sep />
        <Stat label="Avg Booking" value={formatCurrency(avgDeal, true)} />
        <Sep />
        <Stat label="Open Pipeline" value={formatCurrency(pipelineValue, true)} />
      </div>
    </div>
  )
}

function Delta({ pct, label }: { pct: number; label: string }) {
  if (pct === 0) return null
  const isUp = pct > 0
  return (
    <div className={cn(
      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
      isUp && 'bg-emerald-500/10 text-emerald-500',
      !isUp && 'bg-rose-500/10 text-rose-500',
    )}>
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? '+' : ''}{pct.toFixed(1)}%
      <span className="ml-0.5 font-normal text-muted-foreground">vs {label}</span>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">{label}</span>
      <span className={cn(
        'tabular-nums font-semibold',
        highlight ? 'text-emerald-500' : 'text-foreground',
      )}>
        {value}
      </span>
    </span>
  )
}

function Sep() {
  return <span className="text-border">·</span>
}
