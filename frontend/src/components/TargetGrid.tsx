import { useState, useEffect, useCallback } from 'react'
import { fetchMonthlyTargets, saveMonthlyTargets, computeEstimates } from '@/lib/api'
import type { MonthlyTargetAdvisor, EstimateAdvisor } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, Save, Download, Calculator, AlertTriangle } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type TargetBase = 'bookings' | 'commission'
type ActiveTab = 'base' | 'bookings' | 'commissions'

interface GridRow {
  advisor_target_id: number
  name: string
  branch: string | null
  title: string | null
  prior_year: number            // last year commission
  prior_year_rev: number        // last year bookings
  prior_year_months: number[]   // 12 values, seasonal shape (Jan-Dec) — bookings based
  targets: Record<number, number>  // month (1-12) -> amount (in selected base unit)
}

interface Props {
  line: string
}

export default function TargetGrid({ line }: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1 // 1-based

  const [year, setYear] = useState(currentYear)
  const [rows, setRows] = useState<GridRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [growthPct, setGrowthPct] = useState(10)
  const [targetBase] = useState<TargetBase>('bookings')
  const [commRate, setCommRate] = useState(10) // commission rate %

  // ── Estimation state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('bookings')
  const [baseYears, setBaseYears] = useState<number[]>([currentYear - 1])
  const [estimateData, setEstimateData] = useState<EstimateAdvisor[] | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [existingCount, setExistingCount] = useState(0)

  // Booking estimates (editable) - advisor_target_id -> { month -> value }
  const [bookingEstimates, setBookingEstimates] = useState<Record<number, Record<number, number>>>({})
  const [bookingEstimatesOrig, setBookingEstimatesOrig] = useState<Record<number, Record<number, number>>>({})
  // Commission estimates (editable) - advisor_target_id -> { month -> value }
  const [commissionEstimates, setCommissionEstimates] = useState<Record<number, Record<number, number>>>({})
  const [commissionEstimatesOrig, setCommissionEstimatesOrig] = useState<Record<number, Record<number, number>>>({})

  // Is a month editable? Only future months
  const isMonthEditable = (m: number) => {
    if (year > currentYear) return true
    if (year < currentYear) return false
    return m > currentMonth
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchMonthlyTargets(year, line)
      if (data.methodology) {
        if (data.methodology.commission_rate > 0) {
          setCommRate(Math.round(data.methodology.commission_rate * 10) / 10)
        }
      }
      const gridRows: GridRow[] = data.advisors.map((a: MonthlyTargetAdvisor) => {
        const targets: Record<number, number> = {}
        for (const m of a.months) {
          targets[m.month] = targetBase === 'bookings'
            ? (m.target_bookings ?? m.target)
            : m.target
        }
        return {
          advisor_target_id: a.advisor_target_id,
          name: a.name,
          branch: a.branch,
          title: a.title,
          prior_year: a.prior_year_actual ?? 0,
          prior_year_rev: a.prior_year_revenue ?? 0,
          prior_year_months: a.prior_year_months ?? [],
          targets,
        }
      })
      setRows(gridRows)

      // Populate booking/commission estimates from saved targets
      const be: Record<number, Record<number, number>> = {}
      const ce: Record<number, Record<number, number>> = {}
      for (const a of data.advisors) {
        be[a.advisor_target_id] = {}
        ce[a.advisor_target_id] = {}
        for (const m of a.months) {
          be[a.advisor_target_id][m.month] = m.target_bookings ?? 0
          ce[a.advisor_target_id][m.month] = m.target ?? 0
        }
      }
      setBookingEstimates(be)
      setBookingEstimatesOrig(JSON.parse(JSON.stringify(be)))
      setCommissionEstimates(ce)
      setCommissionEstimatesOrig(JSON.parse(JSON.stringify(ce)))

    } catch {
      setError('Failed to load targets')
    } finally {
      setLoading(false)
    }
  }, [year, line, targetBase])

  useEffect(() => { loadData() }, [loadData])

  // ── helpers ──────────────────────────────────────────────────────────────
  

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      // Build updates based on active tab
      if (activeTab === 'bookings') {
        // Save booking estimates (only future months)
        const updates = Object.entries(bookingEstimates)
          .filter(([id]) => {
            const orig = bookingEstimatesOrig[Number(id)] || {}
            const cur = bookingEstimates[Number(id)] || {}
            return JSON.stringify(cur) !== JSON.stringify(orig)
          })
          .map(([id, months]) => ({
            advisor_target_id: Number(id),
            months: Object.fromEntries(
              Object.entries(months).filter(([m]) => isMonthEditable(Number(m)))
            ),
          }))
          .filter(u => Object.keys(u.months).length > 0)
        if (updates.length > 0) await saveMonthlyTargets(year, updates, 'bookings', line)
      } else if (activeTab === 'commissions') {
        // Save commission estimates (only future months)
        const updates = Object.entries(commissionEstimates)
          .filter(([id]) => {
            const orig = commissionEstimatesOrig[Number(id)] || {}
            const cur = commissionEstimates[Number(id)] || {}
            return JSON.stringify(cur) !== JSON.stringify(orig)
          })
          .map(([id, months]) => ({
            advisor_target_id: Number(id),
            months: Object.fromEntries(
              Object.entries(months).filter(([m]) => isMonthEditable(Number(m)))
            ),
          }))
          .filter(u => Object.keys(u.months).length > 0)
        if (updates.length > 0) await saveMonthlyTargets(year, updates, 'commission', line)
      }
      setSaved(true)
      await loadData()
    } catch {
      setError('Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  // ── Estimate computation ─────────────────────────────────────────────────
  async function handleComputeEstimates() {
    if (baseYears.length === 0) {
      setError('Select at least one base year')
      return
    }
    // If targets already exist, show confirmation
    if (existingCount > 0 && !showConfirm) {
      setShowConfirm(true)
      return
    }
    setShowConfirm(false)
    setEstimating(true)
    setError('')
    try {
      const result = await computeEstimates(year, line, baseYears)
      if (result.error) {
        setError(result.error)
        return
      }
      setEstimateData(result.advisors)
      setExistingCount(result.existing_targets)
      if (result.commission_rate > 0) {
        setCommRate(result.commission_rate)
      }
      // Populate editable grids from estimates (only future months)
      const be: Record<number, Record<number, number>> = { ...bookingEstimates }
      const ce: Record<number, Record<number, number>> = { ...commissionEstimates }
      for (const a of result.advisors) {
        if (!be[a.advisor_target_id]) be[a.advisor_target_id] = {}
        if (!ce[a.advisor_target_id]) ce[a.advisor_target_id] = {}
        for (const m of a.months) {
          if (isMonthEditable(m.month)) {
            be[a.advisor_target_id][m.month] = m.base_bookings
            ce[a.advisor_target_id][m.month] = m.base_commission
          }
        }
      }
      setBookingEstimates(be)
      setCommissionEstimates(ce)
      setActiveTab('base')
    } catch {
      setError('Failed to compute estimates')
    } finally {
      setEstimating(false)
    }
  }

  // Apply growth % on top of base estimates → Booking & Commission estimates
  function applyGrowthToEstimates() {
    if (!estimateData) return
    const be: Record<number, Record<number, number>> = { ...bookingEstimates }
    const ce: Record<number, Record<number, number>> = { ...commissionEstimates }
    for (const a of estimateData) {
      if (!be[a.advisor_target_id]) be[a.advisor_target_id] = {}
      if (!ce[a.advisor_target_id]) ce[a.advisor_target_id] = {}
      for (const m of a.months) {
        if (isMonthEditable(m.month)) {
          const grown = Math.round(m.base_bookings * (1 + growthPct / 100))
          be[a.advisor_target_id][m.month] = grown
          ce[a.advisor_target_id][m.month] = Math.round(grown * commRate / 100)
        }
      }
    }
    setBookingEstimates(be)
    setCommissionEstimates(ce)
    setSaved(false)
  }

  function toggleBaseYear(y: number) {
    setBaseYears(prev =>
      prev.includes(y) ? prev.filter(v => v !== y) : [...prev, y].sort()
    )
  }

  function updateEstimateCell(tab: 'bookings' | 'commissions', advisorId: number, month: number, value: string) {
    const num = parseFloat(value.replace(/[^0-9.]/g, '')) || 0
    if (tab === 'bookings') {
      setBookingEstimates(prev => ({
        ...prev,
        [advisorId]: { ...(prev[advisorId] || {}), [month]: num },
      }))
    } else {
      setCommissionEstimates(prev => ({
        ...prev,
        [advisorId]: { ...(prev[advisorId] || {}), [month]: num },
      }))
    }
    setSaved(false)
  }

  // Check if estimate tabs are dirty
  const isEstimateDirty = activeTab === 'bookings'
    ? JSON.stringify(bookingEstimates) !== JSON.stringify(bookingEstimatesOrig)
    : activeTab === 'commissions'
    ? JSON.stringify(commissionEstimates) !== JSON.stringify(commissionEstimatesOrig)
    : false

  function handleExport() {
    // Export from the active tab's data
    const advisorList = rows.length > 0 ? rows : []
    const exportRows = advisorList.map(r => {
      const be = bookingEstimates[r.advisor_target_id] || {}
      const ce = commissionEstimates[r.advisor_target_id] || {}
      const row: Record<string, unknown> = {
        Advisor: r.name,
        Branch: r.branch ?? '',
        [`PY ${year - 1} Bookings`]: r.prior_year_rev,
        [`PY ${year - 1} Commissions`]: r.prior_year,
      }
      let totalBookings = 0, totalCommissions = 0
      for (let m = 1; m <= 12; m++) {
        const bv = be[m] || 0
        const cv = ce[m] || 0
        row[`${MONTHS[m - 1]} Bookings`] = bv
        row[`${MONTHS[m - 1]} Commissions`] = cv
        totalBookings += bv
        totalCommissions += cv
      }
      row[`${year} Total Bookings`] = totalBookings
      row[`${year} Total Commissions`] = totalCommissions
      return row
    })
    exportToExcel(exportRows, `Advisor_Targets_${line}_${year}`)
  }

  const fmt  = (v: number) => v > 0 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'
  const fmtC = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }


  // Derive advisor list for estimate tabs from estimateData or rows
  const estimateAdvisors = estimateData ?? []

  // Helper: get sum across months for estimate data
  const estimateMonthlyTotal = (advisorId: number, data: Record<number, Record<number, number>>) => {
    const months = data[advisorId] || {}
    return Object.values(months).reduce((s, v) => s + v, 0)
  }

  // ── Render: Estimate Grid (Base / Bookings / Commissions tabs) ──────────
  function renderEstimateGrid(tab: ActiveTab) {
    const isEditable = tab !== 'base'
    const dataMap = tab === 'bookings' ? bookingEstimates
      : tab === 'commissions' ? commissionEstimates
      : null
    const label = tab === 'base' ? 'Base Estimates' : tab === 'bookings' ? 'Booking Estimates' : 'Target Commissions'
    const unit = tab === 'commissions' ? 'commission' : 'bookings'

    if (tab === 'base' && !estimateData) {
      return (
        <div className="py-12 text-center space-y-3">
          <Calculator className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <div className="text-[13px] text-muted-foreground">
            Base estimates not yet calculated. Select base year(s) above and click <span className="font-semibold text-primary">Lookup Base Estimates</span>.
          </div>
        </div>
      )
    }

    if (isEditable && (!dataMap || Object.keys(dataMap).length === 0)) {
      return (
        <div className="py-12 text-center space-y-3">
          <Calculator className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <div className="text-[13px] text-muted-foreground">
            No {label.toLowerCase()} yet. Calculate base estimates first, or targets will load from saved data.
          </div>
        </div>
      )
    }

    // For base tab, build from estimateData
    // For editable tabs, build from bookingEstimates/commissionEstimates
    const gridAdvisors = tab === 'base'
      ? estimateAdvisors.map(a => ({
          id: a.advisor_target_id,
          name: a.name,
          months: Object.fromEntries(a.months.map(m => [m.month, unit === 'bookings' ? m.base_bookings : m.base_commission])),
          annual: unit === 'bookings' ? a.avg_annual_bookings : a.avg_annual_commission,
        }))
      : rows.map(r => ({
          id: r.advisor_target_id,
          name: r.name,
          months: dataMap![r.advisor_target_id] || {},
          annual: estimateMonthlyTotal(r.advisor_target_id, dataMap!),
        }))

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
              <th className="px-2 py-2 text-right font-bold text-primary min-w-[90px]">
                Annual
              </th>
            </tr>
          </thead>
          <tbody>
            {gridAdvisors.map(a => (
              <tr key={a.id} className="border-t border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium min-w-[150px]">
                  {a.name}
                </td>
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

            {/* Totals row */}
            <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
              <td className="sticky left-0 z-10 bg-secondary/30 px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide">
                Total
              </td>
              {MONTHS.map((_, mi) => {
                const m = mi + 1
                const colTotal = gridAdvisors.reduce((sum, a) => sum + (a.months[m] || 0), 0)
                return (
                  <td key={m} className="px-1 py-2.5 text-right">
                    <span className="tabular-nums text-[12px] font-bold text-foreground">
                      {fmt(colTotal)}
                    </span>
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

  return (
    <div className="space-y-4">

      {/* ── Year selector + Base year picker + Estimate button ──────────── */}
      <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* Target year */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Target Year</span>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-bold"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="h-8 w-px bg-border/50" />

          {/* Base years selection */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Base Year(s)</span>
            {[year - 1, year - 2, year - 3].map(y => (
              <label key={y} className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-all',
                baseYears.includes(y)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}>
                <input
                  type="checkbox"
                  checked={baseYears.includes(y)}
                  onChange={() => toggleBaseYear(y)}
                  className="hidden"
                />
                {y}
              </label>
            ))}
          </div>

          <button
            onClick={handleComputeEstimates}
            disabled={estimating || baseYears.length === 0}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all',
              baseYears.length > 0
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
            )}
          >
            {estimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
            Lookup Base Estimates
          </button>

          <span className="text-[11px] text-muted-foreground">{rows.length} advisors</span>
        </div>

        {/* Row 2: Growth % + Commission Rate controls */}
        <div className="flex flex-wrap items-center gap-4 border-t border-border/50 pt-3">
          {/* Avg Commission Rate */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Avg Commission Rate</span>
            <input
              type="number"
              step="0.1"
              value={commRate}
              onChange={e => setCommRate(parseFloat(e.target.value) || 0)}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-[13px] font-semibold text-muted-foreground">%</span>
          </div>

          <div className="h-8 w-px bg-border/50" />

          {/* Growth target */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Growth Target</span>
            <input
              type="number"
              value={growthPct}
              onChange={e => setGrowthPct(Number(e.target.value) || 0)}
              className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="text-[13px] font-semibold text-muted-foreground">%</span>
            <button
              onClick={applyGrowthToEstimates}
              disabled={!estimateData}
              className={cn(
                'rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all',
                estimateData
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
              )}
            >
              Calculate Target Estimates
            </button>
          </div>
        </div>

        {/* Confirm dialog */}
        {showConfirm && (
          <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 p-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="text-[12px] text-amber-700 dark:text-amber-300">
              {existingCount} existing targets found for {year}. Recalculating will overwrite <strong>future months only</strong>. Continue?
            </span>
            <button
              onClick={handleComputeEstimates}
              className="rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
            >
              Yes, recalculate
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="rounded-lg border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Commission rate info */}
        {commRate > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Avg commission rate: <span className="font-semibold text-foreground">{commRate}%</span>
            {estimateData && baseYears.length > 0 && (
              <span className="ml-2">• Base: {baseYears.join(', ')} averages</span>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'base' as ActiveTab, label: 'Base Estimates', desc: 'Read-only' },
          { key: 'bookings' as ActiveTab, label: 'Booking Estimates', desc: 'Editable' },
          { key: 'commissions' as ActiveTab, label: 'Target Commissions', desc: 'Editable' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-[12px] font-semibold border-b-2 transition-all -mb-px',
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
          {saved && <span className="text-[11px] font-medium text-emerald-500">Saved ✓</span>}
          {error && <span className="text-[11px] font-medium text-destructive">{error}</span>}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />Export
          </button>
          {activeTab !== 'base' && (
            <button
              onClick={handleSave}
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

      {/* ── Tab content ────────────────────────────────────────────────── */}
      {renderEstimateGrid(activeTab)}

    </div>
  )
}

