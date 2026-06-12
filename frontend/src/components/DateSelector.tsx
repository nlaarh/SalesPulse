import { useRef } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'

const PRESETS = [
  { key: 'month'     as const, label: '1M',  title: 'Last 30 days' },
  { key: 'quarter'   as const, label: '3M',  title: 'Last 3 months' },
  { key: '6m'        as const, label: '6M',  title: 'Last 6 months' },
  { key: 'ytd'       as const, label: 'YTD', title: 'Year to date' },
  { key: 'year'      as const, label: '1Y',  title: 'Last 12 months' },
  { key: 'last-year' as const, label: 'PY',  title: 'Prior year' },
]

function toDisplay(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

export default function DateSelector() {
  const { viewMode, setViewMode, startDate, endDate, setDateRange } = useSales()
  const startRef = useRef<HTMLInputElement>(null)
  const endRef   = useRef<HTMLInputElement>(null)

  const isCustom = viewMode === 'custom'

  // Resolve current date values for the inputs
  const currentStart = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const currentEnd   = endDate   || new Date().toISOString().split('T')[0]

  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newStart = e.target.value
    if (newStart) setDateRange(newStart, currentEnd)
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newEnd = e.target.value
    if (newEnd) setDateRange(currentStart, newEnd)
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Preset chips */}
      <div className="flex gap-0.5 rounded-lg border border-border bg-secondary/30 p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            title={p.title}
            onClick={() => setViewMode(p.key)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
              viewMode === p.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Inline date range — click either date to pick */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-2.5 py-1">

        {/* Start date */}
        <div className="relative">
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums cursor-pointer select-none underline underline-offset-2 decoration-dotted',
              isCustom ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => startRef.current?.showPicker?.()}
          >
            {toDisplay(currentStart)}
          </span>
          <input
            ref={startRef}
            type="date"
            value={currentStart}
            onChange={handleStartChange}
            className="absolute inset-0 opacity-0 w-full cursor-pointer"
            tabIndex={-1}
          />
        </div>

        <span className="text-[11px] text-muted-foreground/50 select-none">→</span>

        {/* End date */}
        <div className="relative">
          <span
            className={cn(
              'text-[11px] font-semibold tabular-nums cursor-pointer select-none underline underline-offset-2 decoration-dotted',
              isCustom ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => endRef.current?.showPicker?.()}
          >
            {toDisplay(currentEnd)}
          </span>
          <input
            ref={endRef}
            type="date"
            value={currentEnd}
            onChange={handleEndChange}
            className="absolute inset-0 opacity-0 w-full cursor-pointer"
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  )
}
