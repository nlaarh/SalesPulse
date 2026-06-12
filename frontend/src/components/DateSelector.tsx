import { useRef, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PRESETS = [
  { key: 'month'     as const, label: '1M',  title: 'Last 30 days' },
  { key: 'quarter'   as const, label: '3M',  title: 'Last 3 months' },
  { key: '6m'        as const, label: '6M',  title: 'Last 6 months' },
  { key: 'ytd'       as const, label: 'YTD', title: 'Year to date' },
  { key: 'year'      as const, label: '1Y',  title: 'Last 12 months' },
  { key: 'last-year' as const, label: 'PY',  title: 'Prior year' },
]

function resolveDisplayDates(viewMode: string, startDate: string | null, endDate: string | null) {
  if (startDate && endDate) return { start: startDate, end: endDate }
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const yyyy = now.getFullYear()
  const sub = (months: number) => {
    const d = new Date(now); d.setMonth(d.getMonth() - months)
    return d.toISOString().split('T')[0]
  }
  switch (viewMode) {
    case 'month':     return { start: sub(1),  end: today }
    case 'quarter':   return { start: sub(3),  end: today }
    case '6m':        return { start: sub(6),  end: today }
    case 'year':      return { start: sub(12), end: today }
    case 'last-year': return { start: `${yyyy-1}-01-01`, end: `${yyyy-1}-12-31` }
    default:          return { start: `${yyyy}-01-01`,   end: today }
  }
}

function fmt(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

/* ── Mini Calendar Picker ─────────────────────────────────────────────────── */

const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function MiniCalendar({ value, onChange, onClose }: {
  value: string
  onChange: (iso: string) => void
  onClose: () => void
}) {
  const initial = value ? new Date(value + 'T00:00:00') : new Date()
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const selected = value

  const firstDay = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 })
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 })
  }
  function pick(day: number) {
    const iso = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
    onClose()
  }

  const todayIso = new Date().toISOString().split('T')[0]

  return (
    <div className="animate-enter absolute z-50 mt-1.5 rounded-xl border border-border bg-popover shadow-xl p-3 w-[220px]"
      onMouseDown={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="rounded-md p-1 hover:bg-muted transition-colors">
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <span className="text-[12px] font-semibold text-foreground">
          {MONTHS[view.month]} {view.year}
        </span>
        <button onClick={nextMonth} className="rounded-md p-1 hover:bg-muted transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <span key={d} className="text-center text-[10px] font-medium text-muted-foreground/60 py-0.5">{d}</span>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const iso = `${view.year}-${String(view.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const isSelected = iso === selected
          const isToday = iso === todayIso
          return (
            <button
              key={i}
              onClick={() => pick(day)}
              className={cn(
                'rounded-md text-[11px] font-medium py-1 transition-all duration-100',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : isToday
                  ? 'text-primary font-bold'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── DateSelector ─────────────────────────────────────────────────────────── */

export default function DateSelector() {
  const { viewMode, setViewMode, startDate, endDate, setDateRange } = useSales()
  const [open, setOpen] = useState<'start' | 'end' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { start: displayStart, end: displayEnd } = resolveDisplayDates(viewMode, startDate, endDate)
  const isCustom = viewMode === 'custom'

  function handleStartChange(iso: string) {
    setDateRange(iso, displayEnd)
  }
  function handleEndChange(iso: string) {
    setDateRange(displayStart, iso)
  }

  // Close calendar when clicking outside
  function handleBlur(e: React.FocusEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(null)
  }

  return (
    <div ref={containerRef} className="flex items-center gap-1.5" onBlur={handleBlur}>
      {/* Preset chips */}
      <div className="flex gap-0.5 rounded-lg border border-border bg-secondary/30 p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            title={p.title}
            onClick={() => { setViewMode(p.key); setOpen(null) }}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all duration-150',
              viewMode === p.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Date range display */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-2.5 py-1">
        {/* Start */}
        <div className="relative" tabIndex={0}>
          <button
            onClick={() => setOpen(o => o === 'start' ? null : 'start')}
            className={cn(
              'text-[11px] font-semibold tabular-nums transition-all duration-150',
              'underline underline-offset-2 decoration-dotted',
              open === 'start'
                ? 'text-primary scale-105'
                : isCustom
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {fmt(displayStart)}
          </button>
          {open === 'start' && (
            <MiniCalendar
              value={displayStart}
              onChange={handleStartChange}
              onClose={() => setOpen(null)}
            />
          )}
        </div>

        <span className="text-[11px] text-muted-foreground/50 select-none px-0.5">→</span>

        {/* End */}
        <div className="relative" tabIndex={0}>
          <button
            onClick={() => setOpen(o => o === 'end' ? null : 'end')}
            className={cn(
              'text-[11px] font-semibold tabular-nums transition-all duration-150',
              'underline underline-offset-2 decoration-dotted',
              open === 'end'
                ? 'text-primary scale-105'
                : isCustom
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {fmt(displayEnd)}
          </button>
          {open === 'end' && (
            <MiniCalendar
              value={displayEnd}
              onChange={handleEndChange}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
