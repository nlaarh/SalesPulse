import { useState, useEffect, useRef } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import { Calendar, ArrowRight, X, ChevronDown } from 'lucide-react'
import DateRangeSummary from '@/components/DateRangeSummary'

const PRESETS = [
  { key: 'month' as const, label: '1M', title: 'Last month' },
  { key: 'quarter' as const, label: '3M', title: 'Last 3 months' },
  { key: '6m' as const, label: '6M', title: 'Last 6 months' },
  { key: 'ytd' as const, label: 'YTD', title: 'Year to date' },
  { key: 'year' as const, label: '1Y', title: 'Last 12 months' },
  { key: 'last-year' as const, label: 'PY', title: 'Prior year' },
]

export default function DateSelector() {
  const { viewMode, setViewMode, startDate, endDate, setDateRange } = useSales()
  const [showCustom, setShowCustom] = useState(false)
  const [tempStart, setTempStart] = useState(startDate || '')
  const [tempEnd, setTempEnd] = useState(endDate || '')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync temp dates when custom mode opens or context changes
  useEffect(() => {
    if (viewMode === 'custom') {
      setShowCustom(true)
      setTempStart(startDate || '')
      setTempEnd(endDate || '')
    } else {
      setShowCustom(false)
    }
  }, [viewMode, startDate, endDate])

  // Click outside to close custom range popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustom(false)
      }
    }
    if (showCustom) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCustom])

  const handlePresetClick = (key: typeof PRESETS[number]['key']) => {
    setShowCustom(false)
    setViewMode(key)
  }

  const handleCustomToggle = () => {
    if (showCustom) {
      setShowCustom(false)
    } else {
      setShowCustom(true)
      if (!tempStart || !tempEnd) {
        const now = new Date()
        const past = new Date(now)
        past.setDate(past.getDate() - 30)
        setTempStart(past.toISOString().split('T')[0])
        setTempEnd(now.toISOString().split('T')[0])
      }
    }
  }

  const applyCustomRange = () => {
    if (tempStart && tempEnd) {
      setDateRange(tempStart, tempEnd)
      setShowCustom(false)
    }
  }

  return (
    <div className="relative flex flex-col items-end gap-1.5" ref={dropdownRef}>
      <div className="flex items-center gap-1.5">
        {/* Preset Chips */}
        <div className="flex gap-0.5 rounded-lg border border-border bg-secondary/30 p-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              title={p.title}
              onClick={() => handlePresetClick(p.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
                viewMode === p.key && !showCustom
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Range Toggle */}
        <button
          onClick={handleCustomToggle}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 border',
            viewMode === 'custom'
              ? 'bg-primary text-primary-foreground border-primary'
              : showCustom
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50',
          )}
        >
          <Calendar className="h-3 w-3" />
          <span>Custom</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', showCustom && 'rotate-180')} />
        </button>
      </div>

      {/* Dropdown Card for Custom Range */}
      {showCustom && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-[240px] animate-enter rounded-xl border border-border bg-popover/95 p-4 shadow-xl backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-[11px] font-bold text-foreground">Select Custom Range</span>
            <button onClick={() => setShowCustom(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground/80">From</label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="date"
                  value={tempStart}
                  onChange={(e) => setTempStart(e.target.value)}
                  className={cn(
                    'w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5',
                    'text-[12px] font-medium text-foreground',
                    'outline-none transition-all duration-200',
                    'focus:border-primary/45 focus:ring-1 focus:ring-primary/20',
                  )}
                />
              </div>
            </div>
            <div className="flex items-center justify-center py-0.5">
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground/80">To</label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="date"
                  value={tempEnd}
                  onChange={(e) => setTempEnd(e.target.value)}
                  className={cn(
                    'w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5',
                    'text-[12px] font-medium text-foreground',
                    'outline-none transition-all duration-200',
                    'focus:border-primary/45 focus:ring-1 focus:ring-primary/20',
                  )}
                />
              </div>
            </div>
          </div>

          <button
            onClick={applyCustomRange}
            disabled={!tempStart || !tempEnd}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 rounded-lg py-2',
              'text-[11px] font-semibold transition-all duration-200 border',
              tempStart && tempEnd
                ? 'bg-primary text-primary-foreground border-primary hover:opacity-95'
                : 'bg-secondary/60 text-muted-foreground/40 border-transparent cursor-not-allowed',
            )}
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Date Range Summary label */}
      <div className="mr-1">
        <DateRangeSummary viewMode={viewMode} startDate={startDate} endDate={endDate} />
      </div>
    </div>
  )
}
