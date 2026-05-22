import { cn } from '@/lib/utils'
import { Tip } from '@/components/MetricTip'

export function SummaryCard({
  icon: Icon, label, value, sub, accent, tip,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  accent: string
  tip?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 h-full">
      <div className={cn('p-2 rounded-lg shrink-0', accent)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex flex-col">
        <p className="text-xs text-muted-foreground h-8 flex items-end">{label}{tip && <Tip text={tip} />}</p>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub || ' '}</p>
      </div>
    </div>
  )
}
