import { cn } from '@/lib/utils'
import { Calculator, Check, AlertTriangle, Loader2, Save, Download } from 'lucide-react'

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export type TargetBase = 'bookings' | 'commission'
export type ActiveTab = 'base' | 'bookings' | 'commissions'

export interface GridRow {
  advisor_target_id: number
  name: string
  branch: string | null
  title: string | null
  prior_year: number
  prior_year_rev: number
  prior_year_months: number[]
  targets: Record<number, number>
}

export interface GridAdvisor {
  id: number
  name: string
  months: Record<number, number>
  annual: number
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  num: number
  label: string
  active: boolean
  done: boolean
}

export function StepIndicator({ num, label, active, done }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        'flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold transition-all',
        done ? 'bg-emerald-500 text-white' :
        active ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
        'bg-secondary text-muted-foreground/50',
      )}>
        {done ? <Check className="w-3.5 h-3.5" /> : num}
      </div>
      <span className={cn(
        'text-[12px] font-semibold transition-colors',
        active ? 'text-foreground' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50',
      )}>{label}</span>
    </div>
  )
}

// ── Step1Panel ────────────────────────────────────────────────────────────────

interface Step1PanelProps {
  step: number
  year: number
  currentYear: number
  baseYears: number[]
  estimating: boolean
  showConfirm: boolean
  existingCount: number
  onYearChange: (y: number) => void
  onToggleBaseYear: (y: number) => void
  onComputeEstimates: () => void
  onCancelConfirm: () => void
}

export function Step1Panel({
  step, year, currentYear, baseYears, estimating, showConfirm, existingCount,
  onYearChange, onToggleBaseYear, onComputeEstimates, onCancelConfirm,
}: Step1PanelProps) {
  return (
    <div className={cn(
      'rounded-xl border-2 p-4 transition-all',
      step === 1 ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/20',
    )}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Target Year</span>
          <select
            value={year}
            onChange={e => onYearChange(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-bold"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="h-8 w-px bg-border/50" />

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Base Year(s)</span>
          {[year - 1, year - 2, year - 3].map(y => (
            <label key={y} className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-all',
              baseYears.includes(y)
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40',
            )}>
              <input type="checkbox" checked={baseYears.includes(y)} onChange={() => onToggleBaseYear(y)} className="hidden" />
              {y}
            </label>
          ))}
        </div>

        <button
          onClick={onComputeEstimates}
          disabled={estimating || baseYears.length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-semibold transition-all',
            baseYears.length > 0 && step === 1
              ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
              : baseYears.length > 0
              ? 'bg-secondary text-foreground border border-border hover:bg-secondary/80'
              : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
          )}
        >
          {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          {step === 1 ? 'Load Base Estimates' : 'Reload'}
        </button>

        {step > 1 && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            <Check className="w-3.5 h-3.5" /> Base data loaded
          </span>
        )}
      </div>

      {showConfirm && (
        <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-[12px] text-foreground">
            {existingCount} existing targets found for {year}. Recalculating will overwrite <strong>future months only</strong>. Continue?
          </span>
          <button onClick={onComputeEstimates} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90">
            Yes, continue
          </button>
          <button onClick={onCancelConfirm} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Step2Panel ────────────────────────────────────────────────────────────────

interface Step2PanelProps {
  step: number
  commRate: number
  growthPct: number
  estimateData: boolean
  baseYears: number[]
  onCommRateChange: (v: number) => void
  onGrowthPctChange: (v: number) => void
  onApplyGrowth: () => void
}

export function Step2Panel({
  step, commRate, growthPct, estimateData, baseYears,
  onCommRateChange, onGrowthPctChange, onApplyGrowth,
}: Step2PanelProps) {
  return (
    <div className={cn(
      'rounded-xl border-2 p-4 transition-all',
      step === 2 ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/20',
    )}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Avg Commission Rate</span>
          <input
            type="number" step="0.1" value={commRate}
            onChange={e => onCommRateChange(parseFloat(e.target.value) || 0)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-[13px] font-semibold text-muted-foreground">%</span>
        </div>

        <div className="h-8 w-px bg-border/50" />

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Growth Target</span>
          <input
            type="number" value={growthPct}
            onChange={e => onGrowthPctChange(Number(e.target.value) || 0)}
            className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-[13px] font-semibold text-muted-foreground">%</span>
        </div>

        <button
          onClick={onApplyGrowth}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-semibold transition-all',
            step === 2
              ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
              : 'bg-secondary text-foreground border border-border hover:bg-secondary/80',
          )}
        >
          <Calculator className="h-4 w-4" />
          {step === 2 ? 'Calculate Target Estimates' : 'Recalculate'}
        </button>

        {step > 2 && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
            <Check className="w-3.5 h-3.5" /> +{growthPct}% growth applied
          </span>
        )}
      </div>

      {commRate > 0 && estimateData && baseYears.length > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Commission rate: <span className="font-semibold text-foreground">{commRate}%</span>
          <span className="ml-2">• Base: {baseYears.join(', ')} averages</span>
        </div>
      )}
    </div>
  )
}

// ── GridTabBar ────────────────────────────────────────────────────────────────

interface TabDef { key: ActiveTab; label: string; desc: string }

interface GridTabBarProps {
  tabs: TabDef[]
  activeTab: ActiveTab
  saved: boolean
  error: string
  saving: boolean
  isEstimateDirty: boolean
  showSave: boolean
  onTabChange: (t: ActiveTab) => void
  onExport: () => void
  onSave: () => void
  negativeMargin?: string
}

export function GridTabBar({
  tabs, activeTab, saved, error, saving, isEstimateDirty, showSave,
  onTabChange, onExport, onSave, negativeMargin = '-mb-[9px]',
}: GridTabBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border pb-2 mb-3">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            'px-4 py-2 text-[12px] font-semibold border-b-2 transition-all',
            negativeMargin,
            activeTab === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
          )}
        >
          {tab.label}
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">({tab.desc})</span>
        </button>
      ))}
      <div className="ml-auto flex items-center gap-2">
        {saved && <span className="text-[11px] font-medium text-emerald-500">✓ Saved</span>}
        {error && <span className="text-[11px] font-medium text-destructive">{error}</span>}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />Export
        </button>
        {showSave && (
          <button
            onClick={onSave}
            disabled={!isEstimateDirty || saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all',
              isEstimateDirty
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </button>
        )}
      </div>
    </div>
  )
}

// ── EstimateGrid ──────────────────────────────────────────────────────────────

interface EstimateGridProps {
  tab: ActiveTab
  gridAdvisors: GridAdvisor[]
  isEditable: boolean
  isMonthEditable: (m: number) => boolean
  updateEstimateCell: (tab: 'bookings' | 'commissions', advisorId: number, month: number, value: string) => void
  fmt: (v: number) => string
  fmtC: (v: number) => string
  hasEstimateData: boolean
  hasDataMap: boolean
}

export function EstimateGrid({
  tab, gridAdvisors, isEditable, isMonthEditable, updateEstimateCell,
  fmt, fmtC, hasEstimateData, hasDataMap,
}: EstimateGridProps) {
  const label = tab === 'base' ? 'Base Estimates' : tab === 'bookings' ? 'Booking Estimates' : 'Target Commissions'

  if (tab === 'base' && !hasEstimateData) {
    return (
      <div className="py-12 text-center space-y-3">
        <Calculator className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <div className="text-[13px] text-muted-foreground">
          Base estimates not yet calculated. Select base year(s) above and click <span className="font-semibold text-primary">Lookup Base Estimates</span>.
        </div>
      </div>
    )
  }

  if (isEditable && !hasDataMap) {
    return (
      <div className="py-12 text-center space-y-3">
        <Calculator className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <div className="text-[13px] text-muted-foreground">
          No {label.toLowerCase()} yet. Calculate base estimates first, or targets will load from saved data.
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b-2 border-border bg-secondary/60">
            <th className="sticky left-0 z-10 bg-secondary/60 px-3 py-2 text-left font-semibold text-muted-foreground min-w-[150px]">
              Advisor
            </th>
            {MONTHS.map((m, i) => {
              const mo = i + 1
              const editable = isEditable && isMonthEditable(mo)
              return (
                <th key={m} className={cn(
                  'px-1 py-2 text-center font-semibold min-w-[76px]',
                  editable ? 'text-muted-foreground' : 'text-muted-foreground/50',
                )}>
                  <div>{m}</div>
                  {!editable && isEditable && (
                    <div className="text-[9px] text-muted-foreground/40">locked</div>
                  )}
                </th>
              )
            })}
            <th className="px-2 py-2 text-right font-bold text-primary min-w-[90px]">Annual</th>
          </tr>
        </thead>
        <tbody>
          {gridAdvisors.map(a => (
            <tr key={a.id} className="border-t border-border/50 hover:bg-secondary/30 transition-colors">
              <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium min-w-[150px]">{a.name}</td>
              {MONTHS.map((_, mi) => {
                const m = mi + 1
                const val = a.months[m] || 0
                const editable = isEditable && isMonthEditable(m)
                return (
                  <td key={m} className="px-1 py-1">
                    {editable ? (
                      <input
                        type="text"
                        value={fmt(val)}
                        onChange={e => updateEstimateCell(tab as 'bookings' | 'commissions', a.id, m, e.target.value)}
                        onFocus={e => e.target.select()}
                        className="w-full rounded-md border border-border/50 bg-secondary/30 px-2 py-1.5 text-right text-[12px] tabular-nums focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    ) : (
                      <div className={cn(
                        'px-2 py-1.5 text-right text-[12px] tabular-nums',
                        !isEditable ? 'text-foreground' : 'text-muted-foreground/60',
                      )}>
                        {fmt(val)}
                      </div>
                    )}
                  </td>
                )
              })}
              <td className="px-2 py-1.5 text-right font-bold tabular-nums text-primary/80">
                {fmtC(Object.values(a.months).reduce((s, v) => s + v, 0))}
              </td>
            </tr>
          ))}

          <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
            <td className="sticky left-0 z-10 bg-secondary/30 px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide">Total</td>
            {MONTHS.map((_, mi) => {
              const m = mi + 1
              const colTotal = gridAdvisors.reduce((sum, a) => sum + (a.months[m] || 0), 0)
              return (
                <td key={m} className="px-1 py-2.5 text-right">
                  <span className="tabular-nums text-[12px] font-bold text-foreground">{fmt(colTotal)}</span>
                </td>
              )
            })}
            <td className="px-2 py-2.5 text-right font-bold tabular-nums text-primary">
              {fmtC(gridAdvisors.reduce((s, a) => s + Object.values(a.months).reduce((ms, v) => ms + v, 0), 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
