import { formatCurrency, formatNumber, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'
import { Tip, TIPS } from '@/components/MetricTip'
import { Layers, AlertTriangle, Download } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'

/* ── Props ────────────────────────────────────────────────────────────────── */

interface DetailsTabProps {
  stages: any
  slipping: any
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function DetailsTab({ stages, slipping }: DetailsTabProps) {
  return (
    <div className="space-y-6">
      {/* Pipeline by Stage Table */}
      <div className="card-premium animate-enter overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Pipeline by Stage<Tip text={TIPS.pipelineByStage} /></h2>
          </div>
          <button
            onClick={() => {
              const total = (stages?.stages ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0)
              exportToExcel((stages?.stages ?? []).map((s: any) => ({
                Stage: s.stage ?? '',
                'Forecast Category': s.forecast_category || '',
                Deals: s.count ?? 0,
                Value: s.amount ?? 0,
                'Pipeline %': total > 0 ? +((s.amount ?? 0) / total * 100).toFixed(2) : 0,
              })), `Pipeline_by_Stage_${new Date().toISOString().slice(0,10)}`)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
            <Download className="h-3.5 w-3.5" />Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Stage', 'Forecast Category', 'Deals', 'Value', '% of Pipeline'].map(h => (
                  <th key={h} className={cn('px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60', h === 'Stage' || h === 'Forecast Category' ? 'text-left' : 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stages?.stages ?? []).map((s: any) => {
                const total = stages?.stages?.reduce((sum: number, st: any) => sum + (st.amount || 0), 0) ?? 1
                const pct = total > 0 ? (s.amount / total * 100) : 0
                return (
                  <tr key={`${s.stage}-${s.forecast_category}`} className="border-b border-border/30 transition-colors duration-150 hover:bg-secondary/50">
                    <td className="px-5 py-3 text-[13px] font-medium">{s.stage}</td>
                    <td className="px-5 py-3 text-[13px] text-muted-foreground">{s.forecast_category || '—'}</td>
                    <td className="tabular-nums px-5 py-3 text-right text-[13px]">{formatNumber(s.count)}</td>
                    <td className="tabular-nums px-5 py-3 text-right text-[13px] font-medium">{formatCurrency(s.amount, true)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-secondary">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="tabular-nums text-[11px] text-muted-foreground">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Past-Due Deals */}
      {slipping?.deals?.length > 0 && (
        <div className="card-premium animate-enter overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold tracking-tight">Past-Due Deals<Tip text={TIPS.pastDue} /></h2>
            <span className="ml-2 text-[11px] text-muted-foreground">
              Open deals past their close date &middot; Top {Math.min(slipping.deals.length, 15)} of {slipping.count}
            </span>
            <button
              onClick={() => exportToExcel(slipping.deals.map((d: any) => ({
                Advisor: d.owner_name ?? '',
                Opportunity: d.name ?? '',
                Stage: d.stage ?? '',
                Amount: d.amount ?? 0,
                'Close Date': d.close_date ? fmtDate(d.close_date) : '',
                'Days Past Due': d.days_past_due ?? 0,
              })), `Past_Due_Deals_${new Date().toISOString().slice(0,10)}`)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition">
              <Download className="h-3.5 w-3.5" />Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {['Deal', 'Owner', 'Stage', 'Amount', 'Days Overdue', 'Last Activity', 'Close Date'].map(h => (
                    <th key={h} className={cn('px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60', h === 'Deal' || h === 'Owner' ? 'text-left' : 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slipping.deals.slice(0, 15).map((d: any) => (
                  <tr key={d.id} className="border-b border-border/30 transition-colors duration-150 hover:bg-secondary/50">
                    <td className="max-w-[200px] truncate px-5 py-3 text-[13px] font-medium">{d.name}</td>
                    <td className="px-5 py-3 text-[13px] text-muted-foreground">{d.owner}</td>
                    <td className="px-5 py-3 text-right text-[13px] text-muted-foreground">{d.stage}</td>
                    <td className="tabular-nums px-5 py-3 text-right text-[13px] font-medium">{formatCurrency(d.amount, true)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                        (d.days_overdue ?? 0) >= 90 ? 'bg-rose-500/15 text-rose-500'
                        : (d.days_overdue ?? 0) >= 30 ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-secondary text-muted-foreground',
                      )}>
                        {d.days_overdue != null ? `${d.days_overdue}d` : '—'}
                      </span>
                    </td>
                    <td className="tabular-nums px-5 py-3 text-right text-[13px] text-muted-foreground">
                      {d.days_since_activity != null ? `${d.days_since_activity}d ago` : '—'}
                    </td>
                    <td className="tabular-nums px-5 py-3 text-right text-[13px] text-muted-foreground">{fmtDate(d.close_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!slipping?.deals?.length) && (
        <div className="card-premium animate-enter flex items-center gap-3 p-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <AlertTriangle className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">No past-due deals</p>
            <p className="text-[11px] text-muted-foreground">All open deals are within their expected close date.</p>
          </div>
        </div>
      )}
    </div>
  )
}
