import { Calendar, ArrowRight } from 'lucide-react'

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

export default function DateRangeSummary({ viewMode, startDate, endDate }: {
  viewMode: string
  startDate: string | null
  endDate: string | null
}) {
  const labels: Record<string, string> = {
    month: 'Last 30 days',
    quarter: 'Last 3 months',
    '6m': 'Last 6 months',
    ytd: `Jan 1 – Today`,
    year: 'Last 12 months',
    'last-year': `${new Date().getFullYear() - 1} (Full Year)`,
  }

  if (viewMode === 'custom' && startDate && endDate) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-primary/80">
        <Calendar className="h-3 w-3" />
        <span>{formatDateShort(startDate)}</span>
        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
        <span>{formatDateShort(endDate)}</span>
      </div>
    )
  }

  if (viewMode === 'ytd' && startDate && endDate) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-primary/80">
        <Calendar className="h-3 w-3" />
        <span>{formatDateShort(startDate)}</span>
        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
        <span>{formatDateShort(endDate)}</span>
      </div>
    )
  }

  if (viewMode === 'last-year' && startDate && endDate) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-primary/80">
        <Calendar className="h-3 w-3" />
        <span>{new Date().getFullYear() - 1} Full Year</span>
      </div>
    )
  }

  return (
    <span className="text-[11px] text-muted-foreground/60">
      {labels[viewMode] || ''}
    </span>
  )
}
