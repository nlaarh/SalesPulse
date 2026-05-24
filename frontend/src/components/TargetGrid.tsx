import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  fetchMonthlyTargets,
  saveMonthlyTargets,
  exportMonthlyTargetsExcel,
  importMonthlyTargetsExcel,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { AlertCircle, Calculator, Check, Download, Loader2, Maximize2, Minimize2, Save, Search, Upload } from 'lucide-react'
import TargetSpreadsheetTable from './TargetSpreadsheetTable'
import {
  buildDirtyTargetUpdates,
  mapAdvisorTargets,
  parseMoney,
  sortTargetAdvisors,
} from './targetGridTypes'
import type { AdvisorState, MetadataField, SortDirection, TargetBase } from './targetGridTypes'

interface Props {
  line: string
}

export default function TargetGrid({ line }: Props) {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [year, setYear] = useState(currentYear)
  const [base] = useState<TargetBase>('commission')
  const [advisors, setAdvisors] = useState<AdvisorState[]>([])
  const [originalAdvisors, setOriginalAdvisors] = useState<AdvisorState[]>([])
  const [commRate, setCommRate] = useState(0.187)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sortField, setSortField] = useState('prior_year_actual')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [growthPct, setGrowthPct] = useState(5)

  const isMonthEditable = useCallback((month: number) => {
    if (year > currentYear) return true
    if (year < currentYear) return false
    return month > currentMonth
  }, [currentMonth, currentYear, year])

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const data = await fetchMonthlyTargets(year, line)
      if (data.methodology?.commission_rate) {
        setCommRate(data.methodology.commission_rate / 100.0)
      }
      const mapped = mapAdvisorTargets(data)
      setAdvisors(mapped)
      setOriginalAdvisors(JSON.parse(JSON.stringify(mapped)))
    } catch {
      setErrorMsg('Failed to load targets and actuals.')
    } finally {
      setLoading(false)
    }
  }, [line, year])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    const updates = buildDirtyTargetUpdates(advisors, originalAdvisors, base)
    if (updates.length === 0) {
      setSuccessMsg('No changes to save.')
      return
    }

    setSaving(true)
    try {
      await saveMonthlyTargets(year, updates, base, line)
      setSuccessMsg(`Successfully saved target updates for ${updates.length} advisor(s).`)
      await loadData()
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Failed to save targets.')
    } finally {
      setSaving(false)
    }
  }

  const applyGrowth = () => {
    setAdvisors((prev) => prev.map((advisor) => ({
      ...advisor,
      months: advisor.months.map((month) => {
        if (!isMonthEditable(month.month)) return month
        const grownVal = Math.round(getGrowthBase(month, base) * (1 + growthPct / 100))
        return {
          ...month,
          target: base === 'commission' ? grownVal : Math.round(grownVal * commRate),
          target_bookings: base === 'bookings' ? grownVal : Math.round(grownVal / commRate),
        }
      }),
    })))
    setSuccessMsg(`Applied +${growthPct}% growth to editable months. Click "Save Changes" to persist.`)
  }

  const handleExport = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const blob = await exportMonthlyTargetsExcel(year, line, base)
      downloadBlob(blob, `Monthly_Targets_${line}_${year}_${base}.xlsx`)
      setSuccessMsg('Excel sheet exported successfully.')
    } catch {
      setErrorMsg('Failed to export Excel spreadsheet.')
    }
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const res = await importMonthlyTargetsExcel(year, file, line, base)
      setSuccessMsg(`Successfully imported targets spreadsheet! Updated ${res.advisors_updated} advisors and ${res.targets_updated} monthly targets.`)
      await loadData()
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || 'Failed to import Excel targets.')
      setLoading(false)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleMetadataChange = (advisorId: number, field: MetadataField, value: string) => {
    setAdvisors((prev) => prev.map((advisor) => {
      if (advisor.advisor_target_id !== advisorId) return advisor
      if (field === 'annual_threshold') {
        const annualThreshold = parseMoney(value)
        return { ...advisor, annual_threshold: annualThreshold, monthly_threshold: Math.round(annualThreshold / 12) }
      }
      if (field === 'annual_stretch') return { ...advisor, annual_stretch: parseMoney(value) }
      return { ...advisor, [field]: value }
    }))
  }

  const handleTargetCellChange = (advisorId: number, month: number, value: string) => {
    const targetValue = parseMoney(value)
    setAdvisors((prev) => prev.map((advisor) => {
      if (advisor.advisor_target_id !== advisorId) return advisor
      return {
        ...advisor,
        months: advisor.months.map((item) => item.month === month
          ? toTargetMonth(item, targetValue, base, commRate)
          : item),
      }
    }))
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('desc')
  }

  const filteredAdvisors = advisors.filter((advisor) => {
    const query = searchQuery.toLowerCase()
    return advisor.name.toLowerCase().includes(query) || advisor.branch.toLowerCase().includes(query)
  })
  const sortedAdvisors = sortTargetAdvisors(filteredAdvisors, base, sortField, sortDirection)
  const isDirty = JSON.stringify(advisors) !== JSON.stringify(originalAdvisors)

  if (loading) return <LoadingState />

  return (
    <div className={cn('space-y-6', isFullscreen && 'fixed inset-0 z-50 bg-background p-6 overflow-hidden flex flex-col animate-fade-in')}>
      <StatusMessage errorMsg={errorMsg} successMsg={successMsg} />
      <ControlPanel
        year={year}
        currentYear={currentYear}
        growthPct={growthPct}
        searchQuery={searchQuery}
        saving={saving}
        isDirty={isDirty}
        isFullscreen={isFullscreen}
        fileInputRef={fileInputRef}
        onYearChange={setYear}
        onGrowthPctChange={setGrowthPct}
        onApplyGrowth={applyGrowth}
        onSearchChange={setSearchQuery}
        onExport={handleExport}
        onImport={handleImport}
        onSave={handleSave}
        onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
      />
      <TargetSpreadsheetTable
        advisors={sortedAdvisors}
        base={base}
        year={year}
        isFullscreen={isFullscreen}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        isMonthEditable={isMonthEditable}
        onMetadataChange={handleMetadataChange}
        onTargetCellChange={handleTargetCellChange}
      />
    </div>
  )
}

function ControlPanel({
  year,
  currentYear,
  growthPct,
  searchQuery,
  saving,
  isDirty,
  isFullscreen,
  fileInputRef,
  onYearChange,
  onGrowthPctChange,
  onApplyGrowth,
  onSearchChange,
  onExport,
  onImport,
  onSave,
  onToggleFullscreen,
}: any) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Target Year</span>
          <select value={year} onChange={(event) => onYearChange(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-bold outline-none focus:ring-2 focus:ring-primary/20">
            {[currentYear - 1, currentYear, currentYear + 1].map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}</option>)}
          </select>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Growth Tool</span>
          <div className="flex items-center rounded-lg border border-border bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-primary/20">
            <input type="number" value={growthPct} onChange={(event) => onGrowthPctChange(Number(event.target.value) || 0)} className="w-10 bg-transparent text-center text-[12px] font-bold outline-none border-none" />
            <span className="text-[11px] font-medium text-muted-foreground">%</span>
          </div>
          <IconButton onClick={onApplyGrowth} title="Apply growth formula (+% to future targets)"><Calculator className="h-4 w-4" /></IconButton>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex items-center rounded-lg border border-border bg-background px-3 py-1.5 focus-within:ring-2 focus:ring-primary/20">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search advisor or branch..." value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} className="ml-2 w-44 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60" />
        </div>
        <IconButton onClick={onExport} title="Export target spreadsheet"><Download className="h-4 w-4" /></IconButton>
        <label className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground cursor-pointer transition-colors shadow-sm" title="Import Excel spreadsheet">
          <Upload className="h-4 w-4" />
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onImport} className="hidden" />
        </label>
        <button onClick={onSave} disabled={!isDirty || saving} className={cn('flex items-center justify-center h-8 w-8 rounded-lg transition-all shadow-sm border border-border', isDirty ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary text-muted-foreground/50 cursor-not-allowed opacity-60')} title="Save changes">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </button>
        <IconButton onClick={onToggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-foreground transition-colors shadow-sm">
      {children}
    </button>
  )
}

function StatusMessage({ errorMsg, successMsg }: { errorMsg: string; successMsg: string }) {
  return (
    <>
      {errorMsg && <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[13px] text-destructive animate-fade-in"><AlertCircle className="h-4 w-4 shrink-0" />{errorMsg}</div>}
      {successMsg && <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-600 dark:text-emerald-400 animate-fade-in"><Check className="h-4 w-4 shrink-0" />{successMsg}</div>}
    </>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-[13px] text-muted-foreground">Loading spreadsheet data...</span>
    </div>
  )
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

function getGrowthBase(month: any, base: TargetBase) {
  const current = base === 'bookings' ? month.bookings_actual : month.actual
  const prior = base === 'bookings' ? month.bookings_actual_py : month.actual_py
  return prior > 0 ? prior : current > 0 ? current : base === 'bookings' ? month.target_bookings : month.target
}

function toTargetMonth(month: any, targetValue: number, base: TargetBase, commRate: number) {
  return {
    ...month,
    target: base === 'commission' ? targetValue : Math.round(targetValue * commRate),
    target_bookings: base === 'bookings' ? targetValue : Math.round(targetValue / commRate),
  }
}
