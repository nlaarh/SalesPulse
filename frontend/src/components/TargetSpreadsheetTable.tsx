import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  MONTH_NAMES,
  QUARTERS,
  fmtCurrency,
  fmtPercentage,
  getAdvisorMetrics,
} from './targetGridTypes'
import type { AdvisorState, MetadataField, SortDirection, TargetBase } from './targetGridTypes'

type Metrics = ReturnType<typeof getAdvisorMetrics>

interface TargetSpreadsheetTableProps {
  advisors: AdvisorState[]
  base: TargetBase
  year: number
  isFullscreen: boolean
  sortField: string
  sortDirection: SortDirection
  onSort: (field: string) => void
  isMonthEditable: (month: number) => boolean
  onMetadataChange: (advisorId: number, field: MetadataField, value: string) => void
  onTargetCellChange: (advisorId: number, month: number, value: string) => void
}

const ALPHABET_HEADERS = [
  'A (Associate)',
  'B (Title)',
  'C (Branch)',
  'D (Annual Threshold)',
  'E (Monthly Threshold / Label)',
  'F (Stretch Target)',
  'G (Jan)',
  'H (Feb)',
  'I (Mar)',
  'J (Q1 Stretch)',
  'K (YoY%)',
  'L (Apr)',
  'M (May)',
  'N (Jun)',
  'O (Q2 Stretch)',
  'P (Jul)',
  'Q (Aug)',
  'R (Sep)',
  'S (Q3 Stretch)',
  'T (Oct)',
  'U (Nov)',
  'V (Dec)',
  'W (Q4 Stretch)',
  'X (Sum of Qtrs)',
  'Y (Year End Goal)',
]

export function TargetSpreadsheetTable(props: TargetSpreadsheetTableProps) {
  const { advisors, isFullscreen } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackXRef = useRef<HTMLDivElement>(null)
  const thumbXRef = useRef<HTMLDivElement>(null)
  const trackYRef = useRef<HTMLDivElement>(null)
  const thumbYRef = useRef<HTMLDivElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [scrollLeftState, setScrollLeftState] = useState(0)
  const [scrollTopState, setScrollTopState] = useState(0)

  // Direct DOM Scroll Synchronizer (60fps/120fps GPU accelerated, no React lag)
  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = scrollRef.current

    if (thumbXRef.current && trackXRef.current) {
      const showX = scrollWidth > clientWidth
      trackXRef.current.style.display = showX ? 'block' : 'none'
      if (showX) {
        const thumbWidth = Math.max(24, (clientWidth / scrollWidth) * clientWidth)
        const maxScrollLeft = scrollWidth - clientWidth
        const maxThumbLeft = clientWidth - thumbWidth
        const thumbLeft = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbLeft : 0
        thumbXRef.current.style.width = `${thumbWidth}px`
        thumbXRef.current.style.transform = `translateX(${thumbLeft}px)`
      }
    }

    if (thumbYRef.current && trackYRef.current) {
      const showY = scrollHeight > clientHeight
      trackYRef.current.style.display = showY ? 'block' : 'none'
      if (showY) {
        const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * clientHeight)
        const maxScrollTop = scrollHeight - clientHeight
        const maxThumbTop = clientHeight - thumbHeight
        const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0
        thumbYRef.current.style.height = `${thumbHeight}px`
        thumbYRef.current.style.transform = `translateY(${thumbTop}px)`
      }
    }
  }

  // Thumb Drag Handlers
  const handleThumbXMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!scrollRef.current || !trackXRef.current || !thumbXRef.current) return

    const startPageX = e.pageX
    const startScrollLeft = scrollRef.current.scrollLeft
    const { scrollWidth, clientWidth } = scrollRef.current
    const thumbWidth = thumbXRef.current.offsetWidth
    const maxScrollLeft = scrollWidth - clientWidth
    const maxThumbLeft = clientWidth - thumbWidth
    const ratio = maxThumbLeft > 0 ? maxScrollLeft / maxThumbLeft : 0

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.pageX - startPageX
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = startScrollLeft + deltaX * ratio
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleThumbYMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!scrollRef.current || !trackYRef.current || !thumbYRef.current) return

    const startPageY = e.pageY
    const startScrollTop = scrollRef.current.scrollTop
    const { scrollHeight, clientHeight } = scrollRef.current
    const thumbHeight = thumbYRef.current.offsetHeight
    const maxScrollTop = scrollHeight - clientHeight
    const maxThumbTop = clientHeight - thumbHeight
    const ratio = maxThumbTop > 0 ? maxScrollTop / maxThumbTop : 0

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.pageY - startPageY
      if (scrollRef.current) {
        scrollRef.current.scrollTop = startScrollTop + deltaY * ratio
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Click on Track jump scroll
  const handleTrackXClick = (e: React.MouseEvent) => {
    if (e.target !== trackXRef.current) return
    if (!scrollRef.current || !trackXRef.current || !thumbXRef.current) return
    const rect = trackXRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const thumbWidth = thumbXRef.current.offsetWidth
    const percent = (clickX - thumbWidth / 2) / (rect.width - thumbWidth)
    const { scrollWidth, clientWidth } = scrollRef.current
    scrollRef.current.scrollLeft = percent * (scrollWidth - clientWidth)
  }

  const handleTrackYClick = (e: React.MouseEvent) => {
    if (e.target !== trackYRef.current) return
    if (!scrollRef.current || !trackYRef.current || !thumbYRef.current) return
    const rect = trackYRef.current.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const thumbHeight = thumbYRef.current.offsetHeight
    const percent = (clickY - thumbHeight / 2) / (rect.height - thumbHeight)
    const { scrollHeight, clientHeight } = scrollRef.current
    scrollRef.current.scrollTop = percent * (scrollHeight - clientHeight)
  }

  // Figma-like Drag to Scroll Handlers (on table cells)
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.closest('a')
    ) {
      return
    }

    if (!scrollRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setStartY(e.pageY - scrollRef.current.offsetTop)
    setScrollLeftState(scrollRef.current.scrollLeft)
    setScrollTopState(scrollRef.current.scrollTop)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()

    const x = e.pageX - scrollRef.current.offsetLeft
    const y = e.pageY - scrollRef.current.offsetTop
    const walkX = (x - startX) * 1.5
    const walkY = (y - startY) * 1.5

    scrollRef.current.scrollLeft = scrollLeftState - walkX
    scrollRef.current.scrollTop = scrollTopState - walkY
  }

  const handleMouseUpOrLeave = () => {
    setIsDragging(false)
  }

  // Recalculate dimensions on render/resize
  useEffect(() => {
    handleScroll()
    if (typeof ResizeObserver !== 'undefined' && scrollRef.current) {
      const observer = new ResizeObserver(() => {
        handleScroll()
      })
      observer.observe(scrollRef.current)
      return () => observer.disconnect()
    }
  }, [advisors])

  return (
    <div className={cn(
      'card-premium relative max-w-full w-full flex flex-col',
      isFullscreen ? 'flex-1 min-h-0' : 'max-h-[70vh]',
    )}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className={cn(
          'overflow-auto flex-1 min-h-0 w-full custom-spreadsheet-scroll',
          isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        )}
      >
        <table className="w-full border-collapse text-[11px] text-foreground tabular-nums select-text min-w-[1070px]">
          <thead>
            <AlphabetHeaderRow />
            <LabelHeaderRow {...props} />
          </thead>
          <tbody>
            {advisors.length === 0 ? (
              <tr>
                <td colSpan={25} className="py-12 text-center text-muted-foreground border-b border-border">
                  No advisors found matching the filter.
                </td>
              </tr>
            ) : advisors.map((advisor, index) => <AdvisorRows key={advisor.advisor_target_id} advisor={advisor} index={index} {...props} />)}
          </tbody>
          {advisors.length > 0 && (
            <TotalsSection advisors={advisors} base={props.base} />
          )}
        </table>
      </div>

      {/* Custom Horizontal Scrollbar Track */}
      <div
        ref={trackXRef}
        onClick={handleTrackXClick}
        className="absolute bottom-2 left-4 right-6 h-2 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300/70 dark:hover:bg-slate-700/70 rounded-full z-45 transition-colors cursor-pointer"
        style={{ display: 'none' }}
      >
        <div
          ref={thumbXRef}
          onMouseDown={handleThumbXMouseDown}
          className="bg-slate-500 dark:bg-slate-400 hover:bg-slate-600 dark:hover:bg-slate-300 rounded-full cursor-pointer transition-colors h-full w-0"
        />
      </div>

      {/* Custom Vertical Scrollbar Track */}
      <div
        ref={trackYRef}
        onClick={handleTrackYClick}
        className="absolute top-12 bottom-6 right-2 w-2 bg-slate-200/50 dark:bg-slate-800/50 hover:bg-slate-300/70 dark:hover:bg-slate-700/70 rounded-full z-45 transition-colors cursor-pointer"
        style={{ display: 'none' }}
      >
        <div
          ref={thumbYRef}
          onMouseDown={handleThumbYMouseDown}
          className="bg-slate-500 dark:bg-slate-400 hover:bg-slate-600 dark:hover:bg-slate-300 rounded-full cursor-pointer transition-colors w-full h-0"
        />
      </div>
    </div>
  )
}

function AlphabetHeaderRow() {
  return (
    <tr className="h-[20px] bg-secondary/10 text-muted-foreground/50 text-center font-mono border-b border-border/50">
      {ALPHABET_HEADERS.map((label, index) => (
        <th
          key={label}
          className={cn(
            'sticky top-0 z-20 bg-background px-1 h-[20px] py-0 border-r border-b border-border/50 text-[9px] align-middle',
            index === 0 && 'left-0 z-30 bg-background text-left min-w-[95px]',
            (index === 9 || index === 14 || index === 18 || index === 22) && 'bg-secondary min-w-[48px]',
            index === 10 && 'bg-secondary min-w-[35px]',
            index === 23 && 'bg-secondary min-w-[60px]',
            index === 24 && 'bg-secondary min-w-[60px] border-r-0',
            index === 1 && 'min-w-[70px]',
            index === 2 && 'min-w-[55px]',
            index === 3 && 'min-w-[65px]',
            index === 4 && 'min-w-[70px]',
            index === 5 && 'min-w-[65px]',
            index >= 6 && index <= 21 && index !== 9 && index !== 10 && index !== 14 && index !== 18 && 'min-w-[42px]',
          )}
        >
          {label}
        </th>
      ))}
    </tr>
  )
}

function LabelHeaderRow({ sortField, sortDirection, onSort }: TargetSpreadsheetTableProps) {
  const headers = buildLabelHeaders()

  return (
    <tr className="text-muted-foreground font-semibold text-center select-none">
      {headers.map((header, index) => (
        <th
          key={`${header.field}-${header.label}`}
          onClick={() => onSort(header.field)}
          className={cn(
            'sticky top-[20px] z-20 px-1 py-1.5 border-r border-b border-border/60 text-[10px] uppercase tracking-[0.04em] hover:text-foreground cursor-pointer transition-colors',
            // Default: solid background so content doesn't bleed through on scroll
            'bg-background',
            index === 0 && 'left-0 z-30 text-left px-2 bg-background',
            index >= 1 && index <= 5 && 'text-left px-2',
            index === 3 || index === 5 || index >= 23 ? 'text-right' : '',
            header.quarter && 'bg-secondary',
            header.yoy && 'bg-secondary',
            header.total && 'bg-secondary',
            index === 24 && 'bg-secondary border-r-0',
          )}
        >
          {header.label} <SortIndicator field={header.field} sortField={sortField} sortDirection={sortDirection} />
        </th>
      ))}
    </tr>
  )
}

function AdvisorRows({
  advisor,
  base,
  year,
  index,
  isMonthEditable,
  onMetadataChange,
  onTargetCellChange,
}: TargetSpreadsheetTableProps & { advisor: AdvisorState; index: number }) {
  const metrics = getAdvisorMetrics(advisor, base)
  const annualStretch = advisor.annual_stretch !== null ? advisor.annual_stretch : metrics.totalTarget

  return (
    <Fragment>
      <TargetRow
        advisor={advisor}
        metrics={metrics}
        annualStretch={annualStretch}
        index={index}
        isMonthEditable={isMonthEditable}
        onMetadataChange={onMetadataChange}
        onTargetCellChange={onTargetCellChange}
      />
      <ValueRow label={`ACTUALS ${year}`} values={metrics.actuals} quarters={metrics.quarterActuals} total={metrics.totalActual} />
      <ValueRow label={`Actuals ${year - 1}`} values={metrics.actualsPY} quarters={metrics.quarterPY} total={metrics.totalPY} muted />
      <VarianceRow label="Variance YOY" values={metrics.actuals} compare={metrics.actualsPY} quarters={metrics.quarterActuals} quarterCompare={metrics.quarterPY} total={metrics.totalActual} totalCompare={metrics.totalPY} showYoyPct />
      <ThresholdVarianceRow advisor={advisor} metrics={metrics} />
      <VarianceRow label="Variance to Stretch" values={metrics.actuals} compare={metrics.targets} quarters={metrics.quarterActuals} quarterCompare={metrics.quarterTargets} total={metrics.totalActual} totalCompare={annualStretch} finalBorder />
    </Fragment>
  )
}

function TargetRow({
  advisor,
  metrics,
  annualStretch,
  index,
  isMonthEditable,
  onMetadataChange,
  onTargetCellChange,
}: any) {
  return (
    <tr className="hover:bg-primary/5 transition-colors border-t border-border/80">
      <td rowSpan={6} className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left border-r border-b-2 border-border font-bold text-[11px] min-w-[95px] align-top shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
        <span className="text-muted-foreground/60 font-mono text-[9px] mr-1">{(index + 1).toString().padStart(2, '0')}.</span>
        <Link to={`/agent/${encodeURIComponent(advisor.name)}`} className="text-primary transition-colors hover:text-primary/80 hover:underline">
          {advisor.name}
        </Link>
      </td>
      <MetaInput value={advisor.title} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'title', value)} rowSpan />
      <MetaInput value={advisor.branch} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'branch', value)} rowSpan />
      <MoneyInput value={advisor.annual_threshold} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'annual_threshold', value)} />
      <td className="px-1.5 py-1 border-r border-b border-border text-right text-muted-foreground/80 font-semibold bg-background text-[10.5px]">
        {fmtCurrency(advisor.monthly_threshold)}
      </td>
      <MoneyInput value={annualStretch} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'annual_stretch', value)} strong />
      {QUARTERS.map((quarter, quarterIndex) => (
        <Fragment key={quarterIndex}>
          {quarter.map((monthIndex) => (
            <TargetCell
              key={monthIndex}
              value={metrics.targets[monthIndex]}
              month={monthIndex + 1}
              editable={isMonthEditable(monthIndex + 1)}
              onChange={(value) => onTargetCellChange(advisor.advisor_target_id, monthIndex + 1, value)}
            />
          ))}
          <QuarterCell value={metrics.quarterTargets[quarterIndex]} />
          {quarterIndex === 0 && <SpacerCell />}
        </Fragment>
      ))}
      <TotalCell value={metrics.totalTarget} />
      <TotalCell value={annualStretch} primary last />
    </tr>
  )
}

function ValueRow({ label, values, quarters, total, muted = false }: any) {
  return (
    <tr className={cn('hover:bg-primary/5 transition-colors border-t border-border/50', muted ? 'text-muted-foreground/60' : 'bg-secondary/5 text-muted-foreground/80')}>
      <LeadingLabel label={label} finalBorder={false} />
      {QUARTERS.map((quarter, quarterIndex) => (
        <Fragment key={quarterIndex}>
          {quarter.map((monthIndex) => <DisplayCell key={monthIndex} value={values[monthIndex]} muted={muted} />)}
          <DisplayCell value={quarters[quarterIndex]} bold={!muted} />
          {quarterIndex === 0 && <SpacerCell />}
        </Fragment>
      ))}
      <DisplayCell value={total} bold />
      <DisplayCell value={total} bold last shaded={!muted} />
    </tr>
  )
}

function VarianceRow({ label, values, compare, quarters, quarterCompare, total, totalCompare, showYoyPct = false, finalBorder = false }: any) {
  const diff = (current: number, comparison: number) => showYoyPct ? current - comparison : comparison - current

  return (
    <tr className="hover:bg-primary/5 transition-colors border-t border-border/50">
      <LeadingLabel label={label} finalBorder={finalBorder} />
      {QUARTERS.map((quarter, quarterIndex) => (
        <Fragment key={quarterIndex}>
          {quarter.map((monthIndex) => (
            <VarianceCell key={monthIndex} diff={diff(values[monthIndex], compare[monthIndex])} met={values[monthIndex] >= compare[monthIndex]} finalBorder={finalBorder} />
          ))}
          <VarianceCell diff={diff(quarters[quarterIndex], quarterCompare[quarterIndex])} met={quarters[quarterIndex] >= quarterCompare[quarterIndex]} bold finalBorder={finalBorder} />
          {quarterIndex === 0 && (showYoyPct ? <PercentCell current={quarters[0]} prior={quarterCompare[0]} /> : <SpacerCell finalBorder={finalBorder} />)}
        </Fragment>
      ))}
      <DisplayCell value={diff(total, totalCompare)} bold finalBorder={finalBorder} />
      <VarianceCell diff={diff(total, totalCompare)} met={total >= totalCompare} bold last finalBorder={finalBorder} />
    </tr>
  )
}

function ThresholdVarianceRow({ advisor, metrics }: any) {
  const quarterThreshold = advisor.monthly_threshold * 3

  return (
    <tr className="hover:bg-primary/5 transition-colors border-t border-border/50">
      <LeadingLabel label="Variance to Perf. Thresh" finalBorder={false} />
      {QUARTERS.map((quarter, quarterIndex) => (
        <Fragment key={quarterIndex}>
          {quarter.map((monthIndex) => (
            <VarianceCell key={monthIndex} diff={advisor.monthly_threshold - metrics.actuals[monthIndex]} met={metrics.actuals[monthIndex] >= advisor.monthly_threshold} />
          ))}
          <VarianceCell diff={quarterThreshold - metrics.quarterActuals[quarterIndex]} met={metrics.quarterActuals[quarterIndex] >= quarterThreshold} bold />
          {quarterIndex === 0 && <SpacerCell />}
        </Fragment>
      ))}
      <DisplayCell value={advisor.annual_threshold - metrics.totalActual} bold />
      <VarianceCell diff={advisor.annual_threshold - metrics.totalActual} met={metrics.totalActual >= advisor.annual_threshold} bold last />
    </tr>
  )
}

function LeadingLabel({ label, finalBorder }: { label: string; finalBorder: boolean }) {
  return (
    <>
      <td className={cn('border-r bg-secondary/10', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/50')} />
      <td className={cn('px-1.5 py-1 border-r font-medium text-left text-[9px] text-muted-foreground/60', finalBorder ? 'border-b-2 border-border font-bold text-muted-foreground/80' : 'border-b border-border/50')}>
        {label}
      </td>
      <td className={cn('border-r bg-secondary/10', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/50')} />
    </>
  )
}

function TargetCell({ value, month, editable, onChange }: { value: number; month: number; editable: boolean; onChange: (value: string) => void }) {
  return (
    <td className="px-0.5 py-0.5 border-r border-b border-border">
      {editable ? (
        <input
          type="text"
          value={value.toLocaleString()}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          aria-label={`Target for ${MONTH_NAMES[month - 1]}`}
          className="w-full bg-secondary/30 dark:bg-secondary/10 px-0.5 py-0.5 text-right outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded text-[10.5px]"
        />
      ) : (
        <div className="px-1 py-0.5 text-right text-muted-foreground/75 text-[10.5px]">{value > 0 ? fmtCurrency(value) : '-'}</div>
      )}
    </td>
  )
}

function MetaInput({ value, onChange, rowSpan }: { value: string; onChange: (value: string) => void; rowSpan?: boolean }) {
  return (
    <td rowSpan={rowSpan ? 6 : undefined} className="px-1 py-1 border-r border-b-2 border-border align-top bg-background">
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded px-0.5 text-[10.5px]" />
    </td>
  )
}

function MoneyInput({ value, onChange, strong = false }: { value: number; onChange: (value: string) => void; strong?: boolean }) {
  return (
    <td className="px-1 py-0.5 border-r border-b border-border text-right bg-background">
      <input
        type="text"
        value={value.toLocaleString()}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.target.select()}
        className={cn('w-full bg-transparent text-right outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded px-0.5 text-[10.5px]', strong ? 'font-bold text-foreground' : 'font-semibold')}
      />
    </td>
  )
}

function DisplayCell({ value, bold = false, muted = false, last = false, shaded = false, finalBorder = false }: any) {
  return (
    <td className={cn(
      'px-1.5 py-1 border-r text-right text-[10.5px]',
      finalBorder ? 'border-b-2 border-border' : 'border-b border-border',
      bold && 'font-bold text-foreground/80',
      muted && 'text-muted-foreground/60',
      shaded && 'bg-secondary/20',
      last && 'border-r-0',
    )}>
      {value > 0 || bold ? fmtCurrency(value) : '-'}
    </td>
  )
}

function VarianceCell({ diff, met, bold = false, last = false, finalBorder = false }: any) {
  return (
    <td className={cn(
      'px-1.5 py-1 border-r text-right font-medium text-[10.5px]',
      finalBorder ? 'border-b-2 border-border' : 'border-b border-border',
      bold && 'font-bold',
      met ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      last && 'border-r-0',
    )}>
      {fmtCurrency(diff)}
    </td>
  )
}

function QuarterCell({ value }: { value: number }) {
  return (
    <td className="px-1.5 py-1 border-r border-b border-border bg-primary/5 text-right font-bold text-[10.5px]">
      {fmtCurrency(value)}
    </td>
  )
}

function TotalCell({ value, primary = false, last = false }: { value: number; primary?: boolean; last?: boolean }) {
  return (
    <td className={cn(
      'px-1.5 py-1 border-b border-border bg-secondary/40 text-right font-bold text-[10.5px]',
      !last && 'border-r',
      primary && 'bg-primary/10 text-primary',
    )}>
      {fmtCurrency(value)}
    </td>
  )
}

function PercentCell({ current, prior }: { current: number; prior: number }) {
  const value = prior > 0 ? (current - prior) / prior : 0
  return (
    <td className="px-1 py-1 border-r border-b border-border bg-secondary/20 text-center font-bold text-[10px] text-foreground">
      {fmtPercentage(value)}
    </td>
  )
}

function SpacerCell({ finalBorder = false }: { finalBorder?: boolean }) {
  return (
    <td className={cn('px-1.5 py-1 border-r bg-secondary/15', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/60')} />
  )
}

function SortIndicator({ field, sortField, sortDirection }: { field: string; sortField: string; sortDirection: SortDirection }) {
  if (sortField !== field) return <span className="opacity-30 ml-1 select-none font-normal text-[9px] text-muted-foreground/60">⇅</span>
  return sortDirection === 'asc'
    ? <span className="text-orange-500 dark:text-indigo-400 font-bold ml-1 select-none text-[10px]">▲</span>
    : <span className="text-orange-500 dark:text-indigo-400 font-bold ml-1 select-none text-[10px]">▼</span>
}

/* ── Totals footer ─────────────────────────────────────────────────────────── */

function TotalsSection({ advisors, base }: { advisors: AdvisorState[]; base: TargetBase }) {
  const allMetrics: Metrics[] = advisors.map(a => getAdvisorMetrics(a, base))

  const sumByMonth = (getter: (m: Metrics) => number[]) => {
    const result = new Array(12).fill(0)
    for (const m of allMetrics) { const v = getter(m); for (let i = 0; i < 12; i++) result[i] += v[i] || 0 }
    return result
  }

  const totTargets  = sumByMonth(m => m.targets)
  const totActuals  = sumByMonth(m => m.actuals)
  const totPY       = sumByMonth(m => m.actualsPY)
  const totQTargets = QUARTERS.map((_, qi) => allMetrics.reduce((s, m) => s + m.quarterTargets[qi], 0))
  const totQActuals = QUARTERS.map((_, qi) => allMetrics.reduce((s, m) => s + m.quarterActuals[qi], 0))
  const totQPY      = QUARTERS.map((_, qi) => allMetrics.reduce((s, m) => s + m.quarterPY[qi], 0))
  const totTotal    = totQTargets.reduce((s, v) => s + v, 0)
  const totActTotal = totQActuals.reduce((s, v) => s + v, 0)
  const totPYTotal  = totQPY.reduce((s, v) => s + v, 0)

  const totAnnualThreshold  = advisors.reduce((s, a) => s + (a.annual_threshold  || 0), 0)
  const totMonthlyThreshold = advisors.reduce((s, a) => s + (a.monthly_threshold || 0), 0)
  const totStretch = advisors.reduce((s, a, i) => s + (a.annual_stretch !== null ? a.annual_stretch : allMetrics[i].totalTarget), 0)

  const thresholdByMonth = new Array(12).fill(totMonthlyThreshold)
  const thresholdByQ     = QUARTERS.map(() => totMonthlyThreshold * 3)

  return (
    <tfoot>
      <tr><td colSpan={25} className="h-0.5 bg-primary/20 border-t-2 border-border/80" /></tr>

      {/* Row 1: Targets */}
      <tr className="bg-primary/5 hover:bg-primary/8 transition-colors">
        <td rowSpan={6} className="sticky left-0 z-10 bg-background px-2 py-1.5 text-left border-r border-border font-extrabold text-[10.5px] uppercase tracking-[0.1em] text-primary min-w-[95px] align-middle">
          ALL TOTALS
        </td>
        <td rowSpan={6} className="border-r border-border bg-secondary/20" />
        <td rowSpan={6} className="border-r border-border bg-secondary/20" />
        <td className="px-1.5 py-1 border-r border-b border-border text-right font-bold text-[10.5px]">{fmtCurrency(totAnnualThreshold)}</td>
        <td className="px-2 py-1 border-r border-b border-border text-left text-[9.5px] font-bold uppercase tracking-[0.07em] text-primary">TARGET</td>
        <td className="px-1.5 py-1 border-r border-b border-border text-right font-bold text-[10.5px]">{fmtCurrency(totStretch)}</td>
        {QUARTERS.map((quarter, qi) => (
          <Fragment key={qi}>
            {quarter.map(mi => (
              <td key={mi} className="px-1.5 py-1 border-r border-b border-border text-right font-semibold text-[10.5px]">
                {totTargets[mi] > 0 ? fmtCurrency(totTargets[mi]) : '-'}
              </td>
            ))}
            <td className="px-1.5 py-1 border-r border-b border-border bg-primary/8 text-right font-bold text-[10.5px]">{fmtCurrency(totQTargets[qi])}</td>
            {qi === 0 && <td className="border-r border-b border-border bg-secondary/15" />}
          </Fragment>
        ))}
        <td className="px-1.5 py-1 border-r border-b border-border bg-primary/10 text-right font-bold text-[10.5px]">{fmtCurrency(totTotal)}</td>
        <td className="px-1.5 py-1 border-b border-border bg-primary/20 text-right font-bold text-[10.5px] text-primary">{fmtCurrency(totStretch)}</td>
      </tr>

      {/* Row 2: Actuals */}
      <TotalsValueRow label="ACTUAL" values={totActuals} quarters={totQActuals} total={totActTotal} />
      {/* Row 3: Prior Year */}
      <TotalsValueRow label="PRIOR YEAR" values={totPY} quarters={totQPY} total={totPYTotal} muted />
      {/* Row 4: Variance YOY */}
      <TotalsVarianceRow label="VAR YOY" values={totActuals} compare={totPY} quarters={totQActuals} qCompare={totQPY} total={totActTotal} totalCompare={totPYTotal} />
      {/* Row 5: vs Threshold */}
      <TotalsVarianceRow label="VS THRESHOLD" values={totActuals} compare={thresholdByMonth} quarters={totQActuals} qCompare={thresholdByQ} total={totActTotal} totalCompare={totAnnualThreshold} />
      {/* Row 6: vs Stretch */}
      <TotalsVarianceRow label="VS STRETCH" values={totActuals} compare={totTargets} quarters={totQActuals} qCompare={totQTargets} total={totActTotal} totalCompare={totStretch} finalBorder />
    </tfoot>
  )
}

function TotalsValueRow({ label, values, quarters, total, muted = false }: {
  label: string; values: number[]; quarters: number[]; total: number; muted?: boolean
}) {
  return (
    <tr className={cn('hover:bg-primary/5 transition-colors', muted ? 'text-muted-foreground/60' : 'bg-secondary/5 text-muted-foreground/80')}>
      <td className="border-r border-b border-border bg-secondary/15" />
      <td className="px-1.5 py-1 border-r border-b border-border text-left text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{label}</td>
      <td className="border-r border-b border-border bg-secondary/15" />
      {QUARTERS.map((quarter, qi) => (
        <Fragment key={qi}>
          {quarter.map(mi => (
            <td key={mi} className="px-1.5 py-1 border-r border-b border-border text-right text-[10.5px]">
              {values[mi] > 0 ? fmtCurrency(values[mi]) : '-'}
            </td>
          ))}
          <td className="px-1.5 py-1 border-r border-b border-border bg-primary/5 text-right font-bold text-[10.5px]">{fmtCurrency(quarters[qi])}</td>
          {qi === 0 && <td className="border-r border-b border-border bg-secondary/10" />}
        </Fragment>
      ))}
      <td className={cn('px-1.5 py-1 border-r border-b border-border text-right font-bold text-[10.5px]', !muted && 'bg-secondary/10')}>{fmtCurrency(total)}</td>
      <td className={cn('px-1.5 py-1 border-b border-border text-right font-bold text-[10.5px]', !muted ? 'bg-primary/10' : 'bg-secondary/5')}>{fmtCurrency(total)}</td>
    </tr>
  )
}

function TotalsVarianceRow({ label, values, compare, quarters, qCompare, total, totalCompare, finalBorder = false }: {
  label: string; values: number[]; compare: number[]; quarters: number[]; qCompare: number[]; total: number; totalCompare: number; finalBorder?: boolean
}) {
  return (
    <tr className="hover:bg-primary/5 transition-colors">
      <td className={cn('border-r bg-secondary/15', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/60')} />
      <td className={cn('px-1.5 py-1 border-r text-left text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/60')}>{label}</td>
      <td className={cn('border-r bg-secondary/15', finalBorder ? 'border-b-2 border-border' : 'border-b border-border/60')} />
      {QUARTERS.map((quarter, qi) => (
        <Fragment key={qi}>
          {quarter.map(mi => (
            <VarianceCell key={mi} diff={values[mi] - compare[mi]} met={values[mi] >= compare[mi]} finalBorder={finalBorder} />
          ))}
          <VarianceCell diff={quarters[qi] - qCompare[qi]} met={quarters[qi] >= qCompare[qi]} bold finalBorder={finalBorder} />
          {qi === 0 && <SpacerCell finalBorder={finalBorder} />}
        </Fragment>
      ))}
      <DisplayCell value={total - totalCompare} bold finalBorder={finalBorder} />
      <VarianceCell diff={total - totalCompare} met={total >= totalCompare} bold last finalBorder={finalBorder} />
    </tr>
  )
}

function buildLabelHeaders() {
  const monthHeaders = MONTH_NAMES.flatMap((month, index) => {
    const items: { label: string; field: string; quarter?: boolean; yoy?: boolean; total?: boolean }[] = [
      { label: month, field: `month_${index + 1}` },
    ]
    if ([2, 5, 8, 11].includes(index)) {
      items.push({ label: `Q${Math.floor(index / 3) + 1} Stretch`, field: `q${Math.floor(index / 3) + 1}_target`, quarter: true })
    }
    if (index === 2) items.push({ label: 'YoY%', field: 'prior_year_actual', yoy: true })
    return items
  })

  return [
    { label: 'Associate', field: 'name' },
    { label: 'Title', field: 'title' },
    { label: 'Branch', field: 'branch' },
    { label: 'Ann. Thresh', field: 'annual_threshold' },
    { label: 'Mth. Thresh', field: 'monthly_threshold' },
    { label: 'Stretch Target', field: 'total_target' },
    ...monthHeaders,
    { label: 'Sum Qtrs', field: 'total_target', total: true },
    { label: 'Year End Stretch', field: 'total_target', total: true },
  ]
}

export default TargetSpreadsheetTable
