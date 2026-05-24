import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import {
  MONTH_NAMES,
  QUARTERS,
  fmtCurrency,
  fmtPercentage,
  getAdvisorMetrics,
} from './targetGridTypes'
import type { AdvisorState, MetadataField, SortDirection, TargetBase } from './targetGridTypes'

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

  return (
    <div className={cn(
      'overflow-auto rounded-xl border border-border shadow-sm bg-card relative',
      isFullscreen ? 'flex-1 min-h-0' : 'max-h-[70vh]',
    )}>
      <table className="w-full border-collapse text-[11px] text-foreground tabular-nums select-text min-w-[1700px]">
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
      </table>
    </div>
  )
}

function AlphabetHeaderRow() {
  return (
    <tr className="bg-muted/40 text-muted-foreground text-center font-mono border-b border-border/80">
      {ALPHABET_HEADERS.map((label, index) => (
        <th
          key={label}
          className={cn(
            'px-2 py-1 border-r border-border text-[10px]',
            index === 0 && 'sticky left-0 z-20 bg-muted text-left min-w-[160px]',
            index === 9 || index === 14 || index === 18 || index === 22
              ? 'bg-slate-100 dark:bg-slate-800 min-w-[90px]'
              : '',
            index === 10 ? 'bg-slate-50 dark:bg-slate-900/60 min-w-[70px]' : '',
            index === 23 ? 'bg-amber-50 dark:bg-amber-950/20 min-w-[110px]' : '',
            index === 24 ? 'bg-amber-100 dark:bg-amber-950/40 min-w-[110px] border-r-0' : '',
            index > 0 && index < 6 && 'min-w-[120px]',
            index === 1 && 'min-w-[160px]',
            index >= 6 && index <= 21 && index !== 9 && index !== 10 && index !== 14 && index !== 18 && 'min-w-[80px]',
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
    <tr className="bg-slate-900/90 dark:bg-[#0c1222]/95 backdrop-blur-md text-slate-100 dark:text-slate-200 font-semibold text-center border-b border-slate-200/80 dark:border-slate-800/80 select-none">
      {headers.map((header, index) => (
        <th
          key={`${header.field}-${header.label}`}
          onClick={() => onSort(header.field)}
          className={cn(
            'px-2 py-2.5 border-r border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-800 dark:hover:bg-slate-800/50 cursor-pointer transition-colors',
            index === 0 && 'sticky left-0 z-20 bg-slate-900 dark:bg-[#0c1222] text-left px-3',
            index >= 1 && index <= 5 && 'text-left px-3',
            index === 3 || index === 5 || index >= 23 ? 'text-right' : '',
            header.quarter && 'bg-slate-900/90 dark:bg-[#0c1222]/90',
            header.yoy && 'bg-slate-950 dark:bg-[#060a16]',
            header.total && 'bg-amber-900/40 hover:bg-amber-900/50',
            index === 24 && 'bg-amber-900/60 hover:bg-amber-900/70 border-r-0',
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
    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-t border-border/80">
      <td rowSpan={6} className="sticky left-0 z-10 bg-background px-3 py-2 text-left border-r border-b-2 border-slate-300 dark:border-slate-700 font-bold text-[12px] min-w-[160px] align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
        <span className="text-muted-foreground/60 font-mono text-[10px] mr-1.5">{(index + 1).toString().padStart(2, '0')}.</span>
        {advisor.name}
      </td>
      <MetaInput value={advisor.title} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'title', value)} rowSpan />
      <MetaInput value={advisor.branch} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'branch', value)} rowSpan />
      <MoneyInput value={advisor.annual_threshold} onChange={(value) => onMetadataChange(advisor.advisor_target_id, 'annual_threshold', value)} />
      <td className="px-3 py-1.5 border-r border-b border-border min-w-[140px] text-right text-muted-foreground/80 font-semibold bg-background">
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
    <tr className={cn('hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-t border-border/50', muted ? 'text-muted-foreground/70' : 'bg-slate-50/30 dark:bg-slate-900/10 text-muted-foreground/80')}>
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
    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-t border-border/50">
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
    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-t border-border/50">
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
      <td className={cn('border-r bg-slate-50/20 dark:bg-slate-900/5', finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700' : 'border-b border-border')} />
      <td className={cn('px-3 py-1.5 border-r font-medium text-left text-[10px] text-muted-foreground/60', finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700 font-bold text-muted-foreground/80' : 'border-b border-border')}>
        {label}
      </td>
      <td className={cn('border-r bg-slate-50/20 dark:bg-slate-900/5', finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700' : 'border-b border-border')} />
    </>
  )
}

function TargetCell({ value, month, editable, onChange }: { value: number; month: number; editable: boolean; onChange: (value: string) => void }) {
  return (
    <td className="px-1 py-1 border-r border-b border-border min-w-[80px]">
      {editable ? (
        <input
          type="text"
          value={value.toLocaleString()}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          aria-label={`Target for ${MONTH_NAMES[month - 1]}`}
          className="w-full bg-secondary/30 dark:bg-secondary/10 px-1 py-1 text-right outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded text-[11px]"
        />
      ) : (
        <div className="px-2 py-1 text-right text-muted-foreground/75">{value > 0 ? fmtCurrency(value) : '-'}</div>
      )}
    </td>
  )
}

function MetaInput({ value, onChange, rowSpan }: { value: string; onChange: (value: string) => void; rowSpan?: boolean }) {
  return (
    <td rowSpan={rowSpan ? 6 : undefined} className="px-2 py-2 border-r border-b-2 border-slate-300 dark:border-slate-700 min-w-[160px] align-top bg-background">
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded px-1 text-[11px]" />
    </td>
  )
}

function MoneyInput({ value, onChange, strong = false }: { value: number; onChange: (value: string) => void; strong?: boolean }) {
  return (
    <td className="px-2 py-1.5 border-r border-b border-border min-w-[120px] text-right bg-background">
      <input
        type="text"
        value={value.toLocaleString()}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.target.select()}
        className={cn('w-full bg-transparent text-right outline-none focus:bg-background border-none focus:ring-1 focus:ring-primary/40 rounded px-1 text-[11px]', strong ? 'font-bold text-foreground' : 'font-semibold')}
      />
    </td>
  )
}

function DisplayCell({ value, bold = false, muted = false, last = false, shaded = false, finalBorder = false }: any) {
  return (
    <td className={cn(
      'px-3 py-1.5 border-r text-right',
      finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700' : 'border-b border-border',
      bold && 'font-bold text-foreground/80',
      muted && 'text-muted-foreground/60',
      shaded && 'bg-slate-100/40 dark:bg-slate-800/40',
      last && 'border-r-0',
    )}>
      {value > 0 || bold ? fmtCurrency(value) : '-'}
    </td>
  )
}

function VarianceCell({ diff, met, bold = false, last = false, finalBorder = false }: any) {
  return (
    <td className={cn(
      'px-3 py-1.5 border-r text-right font-medium',
      finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700' : 'border-b border-border',
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
    <td className="px-3 py-1.5 border-r border-b border-border bg-slate-100/80 dark:bg-slate-800/80 text-right font-bold min-w-[90px]">
      {fmtCurrency(value)}
    </td>
  )
}

function TotalCell({ value, primary = false, last = false }: { value: number; primary?: boolean; last?: boolean }) {
  return (
    <td className={cn(
      'px-3 py-1.5 border-b border-border bg-amber-50/60 dark:bg-amber-950/20 text-right font-bold min-w-[110px]',
      !last && 'border-r',
      primary && 'bg-amber-100/60 dark:bg-amber-950/40 text-primary',
    )}>
      {fmtCurrency(value)}
    </td>
  )
}

function PercentCell({ current, prior }: { current: number; prior: number }) {
  const value = prior > 0 ? (current - prior) / prior : 0
  return (
    <td className="px-2 py-1.5 border-r border-b border-border bg-slate-50/60 dark:bg-slate-900/40 text-center font-bold text-[10px] text-foreground">
      {fmtPercentage(value)}
    </td>
  )
}

function SpacerCell({ finalBorder = false }: { finalBorder?: boolean }) {
  return (
    <td className={cn('px-3 py-1.5 border-r bg-slate-50/80 dark:bg-slate-900/40 min-w-[70px]', finalBorder ? 'border-b-2 border-slate-300 dark:border-slate-700' : 'border-b border-border')} />
  )
}

function SortIndicator({ field, sortField, sortDirection }: { field: string; sortField: string; sortDirection: SortDirection }) {
  if (sortField !== field) return <span className="opacity-30 ml-1 select-none font-normal text-[9px] text-muted-foreground/60">⇅</span>
  return sortDirection === 'asc'
    ? <span className="text-orange-500 dark:text-indigo-400 font-bold ml-1 select-none text-[10px]">▲</span>
    : <span className="text-orange-500 dark:text-indigo-400 font-bold ml-1 select-none text-[10px]">▼</span>
}

function buildLabelHeaders() {
  const monthHeaders = MONTH_NAMES.flatMap((month, index) => {
    const items: { label: string; field: string; quarter?: boolean; yoy?: boolean; total?: boolean }[] = [
      { label: month, field: `month_${index + 1}` },
    ]
    if ([2, 5, 8, 11].includes(index)) {
      items.push({ label: `Q${Math.floor(index / 3) + 1} Stretch Goal`, field: `q${Math.floor(index / 3) + 1}_target`, quarter: true })
    }
    if (index === 2) items.push({ label: 'YoY%', field: 'prior_year_actual', yoy: true })
    return items
  })

  return [
    { label: 'Associate', field: 'name' },
    { label: 'Title', field: 'title' },
    { label: 'Branch', field: 'branch' },
    { label: 'Annual Threshold', field: 'annual_threshold' },
    { label: 'Monthly Threshold / Label', field: 'monthly_threshold' },
    { label: 'Stretch Target', field: 'total_target' },
    ...monthHeaders,
    { label: 'Sum Qtrly Stretch', field: 'total_target', total: true },
    { label: 'Year End Stretch', field: 'total_target', total: true },
  ]
}

export default TargetSpreadsheetTable
