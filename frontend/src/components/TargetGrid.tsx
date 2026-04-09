import { useState, useEffect, useCallback } from 'react'
import { fetchMonthlyTargets, saveMonthlyTargets } from '@/lib/api'
import type { MonthlyTargetAdvisor } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, Save, CopyCheck, ArrowDownToLine, DollarSign, BookOpen } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type TargetBase = 'bookings' | 'commission'

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
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<GridRow[]>([])
  const [original, setOriginal] = useState<GridRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [growthPct, setGrowthPct] = useState(10)
  const [targetBase, setTargetBase] = useState<TargetBase>('bookings')
  const [commRate, setCommRate] = useState(10) // commission rate %
  const [methodology, setMethodology] = useState<{
    commission_rate: number; prior_year: number
    prior_year_bookings: number; prior_year_commission: number; note: string
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchMonthlyTargets(year, line)
      if (data.methodology) {
        setMethodology(data.methodology)
        // Seed commission rate from server
        if (data.methodology.commission_rate > 0) {
          setCommRate(Math.round(data.methodology.commission_rate * 10) / 10)
        }
      }
      const gridRows: GridRow[] = data.advisors.map((a: MonthlyTargetAdvisor) => {
        const targets: Record<number, number> = {}
        for (const m of a.months) targets[m.month] = m.target
        return {
          advisor_target_id: a.advisor_target_id,
          name: a.name,
          branch: a.branch,
          title: a.title,
          prior_year: a.prior_year_actual ?? 0,       // commission
          prior_year_rev: a.prior_year_revenue ?? 0,  // bookings
          prior_year_months: a.prior_year_months ?? [],
          targets,
        }
      })
      setRows(gridRows)
      setOriginal(JSON.parse(JSON.stringify(gridRows)))
    } catch {
      setError('Failed to load targets')
    } finally {
      setLoading(false)
    }
  }, [year, line])

  useEffect(() => { loadData() }, [loadData])

  const isDirty = JSON.stringify(rows) !== JSON.stringify(original)

  // ── helpers ──────────────────────────────────────────────────────────────
  const priorYearBase = (row: GridRow) =>
    targetBase === 'bookings' ? row.prior_year_rev : row.prior_year

  const toOther = (amount: number) =>
    targetBase === 'bookings'
      ? Math.round(amount * commRate / 100)   // bookings → commission
      : commRate > 0 ? Math.round(amount / (commRate / 100)) : 0  // commission → bookings

  const otherLabel = targetBase === 'bookings' ? 'Est. Commission' : 'Est. Bookings'

  // Convert all target cells when switching basis
  function switchBase(newBase: TargetBase) {
    if (newBase === targetBase) return
    setRows(prev => prev.map(r => {
      const newTargets: Record<number, number> = {}
      for (const [k, v] of Object.entries(r.targets)) {
        if (newBase === 'commission') {
          // bookings → commission: multiply by rate
          newTargets[Number(k)] = Math.round(v * commRate / 100)
        } else {
          // commission → bookings: divide by rate
          newTargets[Number(k)] = commRate > 0 ? Math.round(v / (commRate / 100)) : 0
        }
      }
      return { ...r, targets: newTargets }
    }))
    setTargetBase(newBase)
    setSaved(false)
  }

  function updateCell(rowIdx: number, month: number, value: string) {
    const num = parseFloat(value.replace(/[^0-9.]/g, '')) || 0
    setRows(prev => {
      const next = [...prev]
      next[rowIdx] = { ...next[rowIdx], targets: { ...next[rowIdx].targets, [month]: num } }
      return next
    })
    setSaved(false)
  }

  function applyToAllMonths(rowIdx: number) {
    const firstVal = rows[rowIdx].targets[1] || 0
    setRows(prev => {
      const next = [...prev]
      const targets: Record<number, number> = {}
      for (let m = 1; m <= 12; m++) targets[m] = firstVal
      next[rowIdx] = { ...next[rowIdx], targets }
      return next
    })
    setSaved(false)
  }

  function fillDown(month: number) {
    if (rows.length === 0) return
    const firstVal = rows[0].targets[month] || 0
    setRows(prev => prev.map(r => ({ ...r, targets: { ...r.targets, [month]: firstVal } })))
    setSaved(false)
  }

  function applyGrowthPct(pct: number) {
    const companyShape = Array(12).fill(0)
    rows.forEach(r => r.prior_year_months.forEach((v, i) => { companyShape[i] += v }))
    const companyTotal = companyShape.reduce((s, v) => s + v, 0)

    const withData = rows.filter(r => priorYearBase(r) > 0)
    const medianPrior = withData.length > 0
      ? withData.map(r => priorYearBase(r)).sort((a, b) => a - b)[Math.floor(withData.length / 2)]
      : 0

    setRows(prev => prev.map(r => {
      const base = priorYearBase(r) > 0 ? priorYearBase(r) : medianPrior
      const yearlyTarget = Math.round(base * (1 + pct / 100))

      // Use bookings monthly shape for seasonality (same either way)
      const pyMonths = r.prior_year_months
      const pyTotal = pyMonths.reduce((s, v) => s + v, 0)

      const targets: Record<number, number> = {}
      if (pyTotal > 0) {
        for (let m = 1; m <= 12; m++)
          targets[m] = Math.round(yearlyTarget * (pyMonths[m - 1] / pyTotal))
      } else if (companyTotal > 0) {
        for (let m = 1; m <= 12; m++)
          targets[m] = Math.round(yearlyTarget * (companyShape[m - 1] / companyTotal))
      } else {
        for (let m = 1; m <= 12; m++) targets[m] = Math.round(yearlyTarget / 12)
      }
      return { ...r, targets }
    }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updates = rows
        .filter((r, i) => JSON.stringify(r.targets) !== JSON.stringify(original[i]?.targets))
        .map(r => ({
          advisor_target_id: r.advisor_target_id,
          months: Object.fromEntries(Object.entries(r.targets).map(([k, v]) => [k, v])),
        }))
      if (updates.length > 0) await saveMonthlyTargets(year, updates)
      setSaved(true)
      // Reload from server to confirm DB persistence
      await loadData()
    } catch {
      setError('Failed to save targets')
    } finally {
      setSaving(false)
    }
  }

  function rowTotal(row: GridRow) {
    return Object.values(row.targets).reduce((s, v) => s + v, 0)
  }

  const fmt  = (v: number) => v > 0 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'
  const fmtC = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  const fmtK = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
    return `$${v.toFixed(0)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totalPriorBookings  = rows.reduce((s, r) => s + r.prior_year_rev, 0)
  const totalPriorComm      = rows.reduce((s, r) => s + r.prior_year, 0)
  const totalPriorBase      = targetBase === 'bookings' ? totalPriorBookings : totalPriorComm
  const newTargetBase       = Math.round(totalPriorBase * (1 + growthPct / 100))
  const currentTotal        = rows.reduce((s, r) => s + rowTotal(r), 0)
  const currentOtherTotal   = toOther(currentTotal)

  return (
    <div className="space-y-4">

      {/* ── Planner bar ─────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">

          {/* Row 1: Base selector + commission rate */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Base toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
              <button
                onClick={() => switchBase('bookings')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
                  targetBase === 'bookings'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <BookOpen className="h-3.5 w-3.5" /> Bookings basis
              </button>
              <button
                onClick={() => switchBase('commission')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
                  targetBase === 'commission'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <DollarSign className="h-3.5 w-3.5" /> Commission basis
              </button>
            </div>

            {/* Commission rate */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Avg commission rate</span>
              <input
                type="number"
                min={0} max={100} step={0.1}
                value={commRate}
                onChange={e => setCommRate(parseFloat(e.target.value) || 0)}
                className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-[12px] font-semibold text-muted-foreground">%</span>
              {methodology?.commission_rate ? (
                <span className="text-[10px] text-muted-foreground/50">(SF actual: {methodology.commission_rate}%)</span>
              ) : null}
            </div>
          </div>

          {/* Row 2: PY → New target + growth control */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4 flex-1">
              {/* Prior Year */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{year - 1} Actual</div>
                <div className="mt-0.5 text-[13px] font-bold text-foreground tabular-nums">
                  {fmtK(totalPriorBase)} <span className="text-[10px] font-normal text-muted-foreground">({targetBase})</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {targetBase === 'bookings'
                    ? <>{otherLabel}: <span className="font-semibold">{fmtK(Math.round(totalPriorBookings * commRate / 100))}</span></>
                    : <>{otherLabel}: <span className="font-semibold">{fmtK(commRate > 0 ? Math.round(totalPriorComm / (commRate / 100)) : 0)}</span></>
                  }
                </div>
              </div>

              <div className="text-muted-foreground/30 text-lg">→</div>

              {/* New Target */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{year} Target (+{growthPct}%)</div>
                <div className="mt-0.5 text-[13px] font-bold text-primary tabular-nums">
                  {fmtK(newTargetBase)} <span className="text-[10px] font-normal text-primary/60">({targetBase})</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {otherLabel}: <span className="font-semibold text-primary/70">{fmtK(toOther(newTargetBase))}</span>
                </div>
              </div>
            </div>

            {/* Growth control */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-muted-foreground">Growth</span>
              <input
                type="number"
                value={growthPct}
                onChange={e => setGrowthPct(Number(e.target.value) || 0)}
                className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[14px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-[13px] font-semibold text-muted-foreground">%</span>
              <button
                onClick={() => applyGrowthPct(growthPct)}
                className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 transition-colors"
              >
                Apply to grid
              </button>
            </div>
          </div>

          {/* Row 3: Current grid summary */}
          {currentTotal > 0 && (
            <div className="border-t border-border/50 pt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span>Grid total ({targetBase}): <span className="font-semibold text-foreground">{fmtK(currentTotal)}</span></span>
              <span>{otherLabel}: <span className="font-semibold text-foreground">{fmtK(currentOtherTotal)}</span></span>
              {totalPriorBase > 0 && (
                <span className={cn('font-semibold', currentTotal >= totalPriorBase ? 'text-emerald-500' : 'text-rose-500')}>
                  {currentTotal >= totalPriorBase ? '+' : ''}{((currentTotal / totalPriorBase - 1) * 100).toFixed(1)}% vs {year - 1}
                </span>
              )}
              {methodology?.note && (
                <span className="ml-auto text-[10px] text-amber-600 italic">{methodology.note}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium"
          >
            {[year - 1, year, year + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="text-[12px] text-muted-foreground">{rows.length} advisors</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] font-medium text-emerald-500">Saved ✓</span>}
          {error && <span className="text-[11px] font-medium text-destructive">{error}</span>}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all',
              isDirty
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50',
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-muted-foreground/50">
          No targets found for {year}. Upload targets first.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b-2 border-border bg-secondary/60">
                <th className="sticky left-0 z-10 bg-secondary/60 px-3 py-2 text-left font-semibold text-muted-foreground min-w-[150px]">
                  Advisor
                </th>
                {/* Prior year column */}
                <th className="px-2 py-2 text-right font-semibold text-muted-foreground min-w-[80px] border-r border-border/50">
                  <div className="text-[10px] uppercase tracking-wide">{year - 1}</div>
                  <div className="text-[10px] text-muted-foreground/60">{targetBase === 'bookings' ? 'Bookings' : 'Commission'}</div>
                </th>
                {MONTHS.map((m, i) => (
                  <th key={m} className="px-1 py-2 text-center font-semibold text-muted-foreground min-w-[76px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{m} {year}</span>
                      <button
                        onClick={() => fillDown(i + 1)}
                        title={`Fill all with first row's ${m} value`}
                        className="text-[9px] text-primary/50 hover:text-primary transition-colors"
                      >
                        <ArrowDownToLine className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-bold text-primary min-w-[90px]">
                  <div>{year} Total</div>
                  <div className="text-[10px] font-normal text-primary/60">{targetBase}</div>
                </th>
                <th className="px-2 py-2 text-right font-semibold text-muted-foreground/70 min-w-[80px]">
                  <div className="text-[10px] uppercase tracking-wide">{otherLabel}</div>
                </th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const isChanged = JSON.stringify(row.targets) !== JSON.stringify(original[ri]?.targets)
                const total = rowTotal(row)
                const pyBase = priorYearBase(row)
                const vsGrowth = pyBase > 0 ? ((total / pyBase - 1) * 100) : null
                return (
                  <tr key={row.advisor_target_id} className={cn(
                    'border-t border-border/50 transition-colors',
                    isChanged ? 'bg-primary/5' : 'hover:bg-secondary/30',
                  )}>
                    {/* Name */}
                    <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium min-w-[150px]">
                      <div>{row.name}</div>
                      {row.branch && <div className="text-[10px] text-muted-foreground/50">{row.branch}</div>}
                    </td>
                    {/* Prior year */}
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground border-r border-border/50">
                      <div className="font-semibold">{pyBase > 0 ? fmtK(pyBase) : '—'}</div>
                      {vsGrowth !== null && total > 0 && (
                        <div className={cn('text-[10px] font-semibold',
                          vsGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                          {vsGrowth >= 0 ? '+' : ''}{vsGrowth.toFixed(0)}%
                        </div>
                      )}
                    </td>
                    {/* Monthly cells */}
                    {MONTHS.map((_, mi) => {
                      const m = mi + 1
                      const val = row.targets[m] || 0
                      const origVal = original[ri]?.targets[m] || 0
                      const cellChanged = val !== origVal
                      return (
                        <td key={m} className="px-1 py-1">
                          <input
                            type="text"
                            value={fmt(val)}
                            onChange={e => updateCell(ri, m, e.target.value)}
                            onFocus={e => e.target.select()}
                            className={cn(
                              'w-full rounded-md border px-2 py-1.5 text-right text-[12px] tabular-nums',
                              'bg-secondary/30 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/40',
                              cellChanged ? 'border-primary/40 bg-primary/10' : 'border-border/50',
                            )}
                          />
                        </td>
                      )
                    })}
                    {/* Row total */}
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-primary/80">
                      {fmtC(total)}
                    </td>
                    {/* Est. other */}
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground/70 text-[11px]">
                      {total > 0 ? fmtK(toOther(total)) : '—'}
                    </td>
                    <td className="px-1 py-1.5">
                      <button
                        onClick={() => applyToAllMonths(ri)}
                        title="Apply Jan value to all months"
                        className="rounded p-1 text-muted-foreground/40 hover:bg-secondary hover:text-primary transition-colors"
                      >
                        <CopyCheck className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* Totals row */}
              {rows.length > 0 && (
                <tr className="border-t-2 border-border bg-secondary/30 font-semibold">
                  <td className="sticky left-0 z-10 bg-secondary/30 px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide">
                    Total
                  </td>
                  {/* Prior year total */}
                  <td className="px-2 py-2.5 text-right tabular-nums font-bold text-foreground border-r border-border/50">
                    {fmtK(totalPriorBase)}
                  </td>
                  {MONTHS.map((_, mi) => {
                    const m = mi + 1
                    const colTotal = rows.reduce((sum, r) => sum + (r.targets[m] || 0), 0)
                    return (
                      <td key={m} className="px-1 py-2.5 text-right">
                        <span className="tabular-nums text-[12px] font-bold text-foreground">
                          {fmt(colTotal)}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums text-primary">
                    {fmtC(currentTotal)}
                    {totalPriorBase > 0 && (
                      <div className={cn('text-[10px] font-semibold',
                        currentTotal >= totalPriorBase ? 'text-emerald-500' : 'text-rose-500')}>
                        {currentTotal >= totalPriorBase ? '+' : ''}{((currentTotal / totalPriorBase - 1) * 100).toFixed(0)}% vs {year-1}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground/70 text-[11px] font-bold">
                    {fmtK(currentOtherTotal)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

