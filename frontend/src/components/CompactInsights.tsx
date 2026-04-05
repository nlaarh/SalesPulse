import { cn, formatCurrency } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, XCircle, Info, Shield } from 'lucide-react'

interface Insight {
  type: 'success' | 'warning' | 'danger' | 'info'
  title: string
  text: string
}

interface CompactInsightsProps {
  insights: Insight[]
  pipelineValue?: number
  pipelineCoverage?: number
}

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
}

const COLORS = {
  success: 'border-emerald-500/50 text-emerald-500',
  warning: 'border-amber-500/50 text-amber-500',
  danger: 'border-rose-500/50 text-rose-500',
  info: 'border-primary/50 text-primary',
}

const BG = {
  success: 'bg-emerald-500/5',
  warning: 'bg-amber-500/5',
  danger: 'bg-rose-500/5',
  info: 'bg-primary/5',
}

export default function CompactInsights({ insights, pipelineValue, pipelineCoverage }: CompactInsightsProps) {
  const displayed = insights.slice(0, 3)

  return (
    <div className="card-premium animate-enter flex h-full flex-col">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">Key Insights</h2>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {displayed.map((insight, i) => {
          const Icon = ICONS[insight.type]
          return (
            <div
              key={i}
              className={cn(
                'rounded-lg border-l-[3px] px-3 py-2.5',
                COLORS[insight.type],
                BG[insight.type],
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide">
                    {insight.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {insight.text}
                  </p>
                </div>
              </div>
            </div>
          )
        })}

        {/* Pipeline Health Badge */}
        {pipelineValue != null && pipelineCoverage != null && (
          <div className="mt-auto rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pipeline Health
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="tabular-nums text-[16px] font-bold text-foreground">
                {formatCurrency(pipelineValue, true)}
              </span>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                pipelineCoverage >= 2 ? 'bg-emerald-500/10 text-emerald-500'
                : pipelineCoverage >= 1 ? 'bg-amber-500/10 text-amber-500'
                : 'bg-rose-500/10 text-rose-500',
              )}>
                {pipelineCoverage.toFixed(1)}x coverage
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
