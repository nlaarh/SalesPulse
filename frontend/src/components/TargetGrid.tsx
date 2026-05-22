import { useState, useEffect, useCallback } from 'react'
import { fetchMonthlyTargets, saveMonthlyTargets, computeEstimates } from '@/lib/api'
import type { MonthlyTargetAdvisor, EstimateAdvisor } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, ArrowLeft, ChevronRight } from 'lucide-react'
import { exportToExcel } from '@/lib/exportExcel'
import {
  MONTHS,
  type ActiveTab,
  type GridRow,
  type GridAdvisor,
  StepIndicator,
  Step1Panel,
  Step2Panel,
  GridTabBar,
  EstimateGrid,
} from './TargetGridParts'

interface Props {
  line: string
}

export default function TargetGrid({ line }: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [rows, setRows] = useState<GridRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [growthPct, setGrowthPct] = useState(5)
  const [commRate, setCommRate] = useState(10)

  const [activeTab, setActiveTab] = useState<ActiveTab>('bookings')
  const [baseYears, setBaseYears] = useState<number[]>([currentYear - 1])
  const [estimateData, setEstimateData] = useState<EstimateAdvisor[] | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [existingCount, setExistingCount] = useState(0)
  const [growthApplied, setGrowthApplied] = useState(false)

  const [bookingEstimates, setBookingEstimates] = useState<Record<number, Record<number, number>>>({})
  const [bookingEstimatesOrig, setBookingEstimatesOrig] = useState<Record<number, Record<number, number>>>({})
  const [commissionEstimates, setCommissionEstimates] = useState<Record<number, Record<number, number>>>({})
  const [commissionEstimatesOrig, setCommissionEstimatesOrig] = useState<Record<number, Record<number, number>>>({})

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
      if (data.methodology?.commission_rate && data.methodology.commission_rate > 0) {
        setCommRate(Math.round(data.methodology.commission_rate * 10) / 10)
      }
      const gridRows: GridRow[] = data.advisors.map((a: MonthlyTargetAdvisor) => {
        const targets: Record<number, number> = {}
        for (const m of a.months) targets[m.month] = m.target_bookings ?? m.target
        return {
          advisor_target_id: a.advisor_target_id,
          name: a.name, branch: a.branch, title: a.title,
          prior_year: a.prior_year_actual ?? 0,
          prior_year_rev: a.prior_year_revenue ?? 0,
          prior_year_months: a.prior_year_months ?? [],
          targets,
        }
      })
      setRows(gridRows)
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
  }, [year, line])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const isBookings = activeTab === 'bookings'
      const estimates = isBookings ? bookingEstimates : commissionEstimates
      const orig = isBookings ? bookingEstimatesOrig : commissionEstimatesOrig
      const updates = Object.entries(estimates)
        .filter(([id]) => JSON.stringify(estimates[Number(id)]) !== JSON.stringify(orig[Number(id)]))
        .map(([id, months]) => ({
          advisor_target_id: Number(id),
          months: Object.fromEntries(Object.entries(months).filter(([m]) => isMonthEditable(Number(m)))),
        }))
        .filter(u => Object.keys(u.months).length > 0)
      if (updates.length > 0) await saveMonthlyTargets(year, updates, isBookings ? 'bookings' : 'commission', line)
      setSaved(true)
      await loadData()
    } catch {
      setError('Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  async function handleComputeEstimates() {
    if (baseYears.length === 0) { setError('Select at least one base year'); return }
    if (existingCount > 0 && !showConfirm) { setShowConfirm(true); return }
    setShowConfirm(false)
    setEstimating(true)
    setError('')
    try {
      const result = await computeEstimates(year, line, baseYears)
      if (result.error) { setError(result.error); return }
      setEstimateData(result.advisors)
      setExistingCount(result.existing_targets)
      if (result.commission_rate > 0) setCommRate(result.commission_rate)
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

  function applyGrowthToEstimates() {
    if (estimateData) {
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
    } else if (rows.length > 0) {
      const be: Record<number, Record<number, number>> = { ...bookingEstimates }
      const ce: Record<number, Record<number, number>> = { ...commissionEstimates }
      for (const r of rows) {
        if (!be[r.advisor_target_id]) be[r.advisor_target_id] = {}
        if (!ce[r.advisor_target_id]) ce[r.advisor_target_id] = {}
        for (let m = 1; m <= 12; m++) {
          if (isMonthEditable(m)) {
            const current = be[r.advisor_target_id][m] || 0
            const grown = Math.round(current * (1 + growthPct / 100))
            be[r.advisor_target_id][m] = grown
            ce[r.advisor_target_id][m] = Math.round(grown * commRate / 100)
          }
        }
      }
      setBookingEstimates(be)
      setCommissionEstimates(ce)
    }
    setSaved(false)
  }

  function toggleBaseYear(y: number) {
    setBaseYears(prev => prev.includes(y) ? prev.filter(v => v !== y) : [...prev, y].sort())
  }

  function updateEstimateCell(tab: 'bookings' | 'commissions', advisorId: number, month: number, value: string) {
    const num = parseFloat(value.replace(/[^0-9.]/g, '')) || 0
    if (tab === 'bookings') {
      setBookingEstimates(prev => ({ ...prev, [advisorId]: { ...(prev[advisorId] || {}), [month]: num } }))
    } else {
      setCommissionEstimates(prev => ({ ...prev, [advisorId]: { ...(prev[advisorId] || {}), [month]: num } }))
    }
    setSaved(false)
  }

  const isEstimateDirty = activeTab === 'bookings'
    ? JSON.stringify(bookingEstimates) !== JSON.stringify(bookingEstimatesOrig)
    : activeTab === 'commissions'
    ? JSON.stringify(commissionEstimates) !== JSON.stringify(commissionEstimatesOrig)
    : false

  function handleExport() {
    const exportRows = rows.map(r => {
      const be = bookingEstimates[r.advisor_target_id] || {}
      const ce = commissionEstimates[r.advisor_target_id] || {}
      const row: Record<string, unknown> = {
        Advisor: r.name, Branch: r.branch ?? '',
        [`PY ${year - 1} Bookings`]: r.prior_year_rev,
        [`PY ${year - 1} Commissions`]: r.prior_year,
      }
      let totalBookings = 0, totalCommissions = 0
      for (let m = 1; m <= 12; m++) {
        row[`${MONTHS[m - 1]} Bookings`] = be[m] || 0
        row[`${MONTHS[m - 1]} Commissions`] = ce[m] || 0
        totalBookings += be[m] || 0
        totalCommissions += ce[m] || 0
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
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  const estimateAdvisors = estimateData ?? []

  function buildGridAdvisors(tab: ActiveTab): GridAdvisor[] {
    const unit = tab === 'commissions' ? 'commission' : 'bookings'
    const dataMap = tab === 'bookings' ? bookingEstimates : tab === 'commissions' ? commissionEstimates : null
    if (tab === 'base') {
      return estimateAdvisors.map(a => ({
        id: a.advisor_target_id, name: a.name,
        months: Object.fromEntries(a.months.map(m => [m.month, unit === 'bookings' ? m.base_bookings : m.base_commission])),
        annual: unit === 'bookings' ? a.avg_annual_bookings : a.avg_annual_commission,
      }))
    }
    return rows.map(r => ({
      id: r.advisor_target_id, name: r.name,
      months: dataMap![r.advisor_target_id] || {},
      annual: Object.values(dataMap![r.advisor_target_id] || {}).reduce((s, v) => s + v, 0),
    }))
  }

  const step = !estimateData ? 1 : !growthApplied ? 2 : 3
  const gridProps = { isMonthEditable, updateEstimateCell, fmt, fmtC, hasEstimateData: !!estimateData }

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2 px-1">
        <StepIndicator num={1} label="Load Base Data" active={step === 1} done={step > 1} />
        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        <StepIndicator num={2} label="Apply Growth" active={step === 2} done={step > 2} />
        <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
        <StepIndicator num={3} label="Review & Save" active={step === 3} done={saved} />
        <div className="ml-auto text-[11px] text-muted-foreground">{rows.length} advisors</div>
      </div>

      <Step1Panel
        step={step} year={year} currentYear={currentYear} baseYears={baseYears}
        estimating={estimating} showConfirm={showConfirm} existingCount={existingCount}
        onYearChange={y => { setYear(y); setEstimateData(null); setGrowthApplied(false) }}
        onToggleBaseYear={toggleBaseYear}
        onComputeEstimates={handleComputeEstimates}
        onCancelConfirm={() => setShowConfirm(false)}
      />

      {step >= 2 && (
        <Step2Panel
          step={step} commRate={commRate} growthPct={growthPct}
          estimateData={!!estimateData} baseYears={baseYears}
          onCommRateChange={setCommRate}
          onGrowthPctChange={setGrowthPct}
          onApplyGrowth={() => { applyGrowthToEstimates(); setGrowthApplied(true); setActiveTab('bookings') }}
        />
      )}

      {step >= 3 && (<>
        <div className={cn('rounded-xl border-2 p-4 transition-all', 'border-primary/40 bg-primary/5')}>
          <GridTabBar
            tabs={[
              { key: 'bookings', label: 'Booking Targets', desc: 'Editable' },
              { key: 'commissions', label: 'Commission Targets', desc: 'Editable' },
              { key: 'base', label: 'Base Data', desc: 'Read-only' },
            ]}
            activeTab={activeTab} saved={saved} error={error} saving={saving}
            isEstimateDirty={isEstimateDirty} showSave={activeTab !== 'base'}
            onTabChange={setActiveTab} onExport={handleExport} onSave={handleSave}
          />
          <EstimateGrid
            tab={activeTab} gridAdvisors={buildGridAdvisors(activeTab)}
            isEditable={activeTab !== 'base'}
            hasDataMap={activeTab === 'bookings' ? Object.keys(bookingEstimates).length > 0 : activeTab === 'commissions' ? Object.keys(commissionEstimates).length > 0 : true}
            {...gridProps}
          />
        </div>
        <button onClick={() => setGrowthApplied(false)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" /> Adjust growth settings
        </button>
      </>)}

      {step === 1 && (
        <div className="space-y-3">
          <GridTabBar
            tabs={[
              { key: 'bookings', label: 'Booking Targets', desc: 'Current' },
              { key: 'commissions', label: 'Commission Targets', desc: 'Current' },
            ]}
            activeTab={activeTab === 'base' ? 'bookings' : activeTab} saved={saved} error={error} saving={saving}
            isEstimateDirty={isEstimateDirty} showSave={true}
            onTabChange={setActiveTab} onExport={handleExport} onSave={handleSave}
            negativeMargin="-mb-px"
          />
          <EstimateGrid
            tab={activeTab === 'base' ? 'bookings' : activeTab}
            gridAdvisors={buildGridAdvisors(activeTab === 'base' ? 'bookings' : activeTab)}
            isEditable={true} hasDataMap={Object.keys(bookingEstimates).length > 0}
            {...gridProps}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Base Estimates</h3>
            <span className="text-[11px] text-muted-foreground">Prior year averages from {baseYears.join(', ')}</span>
          </div>
          <EstimateGrid
            tab="base" gridAdvisors={buildGridAdvisors('base')}
            isEditable={false} hasDataMap={true}
            {...gridProps}
          />
        </div>
      )}

    </div>
  )
}
