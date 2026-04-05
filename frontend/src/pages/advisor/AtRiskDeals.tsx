/**
 * At-Risk Deals card — shared across all advisor tabs.
 */

import { formatCurrency, cn } from '@/lib/utils'
import { Tip, TIPS } from '@/components/MetricTip'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { SlippingDeal } from '@/lib/types'

interface AtRiskDealsProps {
  deals: SlippingDeal[]
  onSelectAdvisor?: (name: string) => void
}

export default function AtRiskDeals({ deals, onSelectAdvisor }: AtRiskDealsProps) {
  const totalAtRisk = deals.reduce((sum, d) => sum + d.amount, 0)
  const top8 = deals.slice(0, 8)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">At-Risk Pipeline<Tip text={TIPS.atRisk} /></h3>
        <span className="text-[11px] text-muted-foreground">{deals.length} deals</span>
      </div>

      {deals.length > 0 ? (
        <>
          <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-[13px] font-semibold text-amber-500">{formatCurrency(totalAtRisk, true)} at risk</span>
              <span className="text-[11px] text-muted-foreground">across {deals.length} slipping deals</span>
            </div>
          </div>
          <div className="space-y-2">
            {top8.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectAdvisor?.(d.owner)}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-border/30 px-3 py-2.5 transition-colors hover:bg-secondary/20',
                  onSelectAdvisor && 'cursor-pointer hover:border-primary/20',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{d.name}</p>
                  <p className={cn('mt-0.5 text-[10px]', onSelectAdvisor ? 'text-primary/70' : 'text-muted-foreground')}>
                    {d.owner} &middot; {d.stage}
                  </p>
                </div>
                <span className="tabular-nums text-[12px] font-semibold shrink-0">{formatCurrency(d.amount, true)}</span>
                <span className="tabular-nums text-[11px] font-semibold text-rose-500 shrink-0">{d.days_overdue}d overdue</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" />
            <span className="mt-2 block text-[12px] text-muted-foreground">No at-risk deals</span>
          </div>
        </div>
      )}
    </div>
  )
}
