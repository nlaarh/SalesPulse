export type TargetBase = 'commission' | 'bookings'
export type SortDirection = 'asc' | 'desc'
export type MetadataField = 'title' | 'branch' | 'annual_threshold' | 'annual_stretch'

export interface AdvisorMonth {
  month: number
  target: number
  target_bookings: number
  actual: number
  bookings_actual: number
  actual_py: number
  bookings_actual_py: number
}

export interface AdvisorState {
  advisor_target_id: number
  name: string
  sf_name: string
  branch: string
  title: string
  annual_threshold: number
  monthly_threshold: number
  annual_stretch: number | null
  months: AdvisorMonth[]
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const QUARTERS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
] as const

export function fmtCurrency(value: number) {
  return '$' + Math.round(value).toLocaleString('en-US')
}

export function fmtPercentage(value: number) {
  if (isNaN(value) || !isFinite(value)) return '0.0%'
  return (value >= 0 ? '+' : '') + (value * 100).toFixed(1) + '%'
}

export function parseMoney(value: string) {
  return parseFloat(value.replace(/[^0-9.]/g, '')) || 0
}

export function mapAdvisorTargets(data: any): AdvisorState[] {
  return data.advisors.map((advisor: any) => ({
    advisor_target_id: advisor.advisor_target_id,
    name: advisor.name,
    sf_name: advisor.sf_name,
    branch: advisor.branch || '',
    title: advisor.title || '',
    annual_threshold: advisor.annual_threshold || 180000,
    monthly_threshold: advisor.monthly_threshold || 15000,
    annual_stretch: advisor.annual_stretch != null ? advisor.annual_stretch : null,
    months: advisor.months.map((month: any) => ({
      month: month.month,
      target: month.target || 0,
      target_bookings: month.target_bookings || 0,
      actual: month.actual || 0,
      bookings_actual: month.bookings_actual || 0,
      actual_py: month.actual_py || 0,
      bookings_actual_py: month.bookings_actual_py || 0,
    })),
  }))
}

export function buildDirtyTargetUpdates(
  advisors: AdvisorState[],
  originalAdvisors: AdvisorState[],
  base: TargetBase,
) {
  return advisors
    .filter((advisor) => isAdvisorDirty(advisor, originalAdvisors))
    .map((advisor) => {
      const months: Record<string, number> = {}
      advisor.months.forEach((month) => {
        months[String(month.month)] = base === 'bookings' ? month.target_bookings : month.target
      })

      return {
        advisor_target_id: advisor.advisor_target_id,
        months,
        title: advisor.title,
        branch: advisor.branch,
        monthly_target: advisor.monthly_threshold,
        annual_stretch: advisor.annual_stretch,
      }
    })
}

export function getAdvisorMetrics(advisor: AdvisorState, base: TargetBase) {
  const targets = advisor.months.map((month) => (base === 'bookings' ? month.target_bookings : month.target))
  const actuals = advisor.months.map((month) => (base === 'bookings' ? month.bookings_actual : month.actual))
  const actualsPY = advisor.months.map((month) => (base === 'bookings' ? month.bookings_actual_py : month.actual_py))
  const quarterTargets = QUARTERS.map((quarter) => sumIndexes(targets, quarter))
  const quarterActuals = QUARTERS.map((quarter) => sumIndexes(actuals, quarter))
  const quarterPY = QUARTERS.map((quarter) => sumIndexes(actualsPY, quarter))

  return {
    targets,
    actuals,
    actualsPY,
    quarterTargets,
    quarterActuals,
    quarterPY,
    totalTarget: sum(quarterTargets),
    totalActual: sum(quarterActuals),
    totalPY: sum(quarterPY),
  }
}

export function sortTargetAdvisors(
  advisors: AdvisorState[],
  base: TargetBase,
  sortField: string,
  sortDirection: SortDirection,
) {
  return [...advisors].sort((a, b) => {
    const valA = sortValue(a, base, sortField)
    const valB = sortValue(b, base, sortField)
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
}

function isAdvisorDirty(advisor: AdvisorState, originalAdvisors: AdvisorState[]) {
  const original = originalAdvisors.find((item) => item.advisor_target_id === advisor.advisor_target_id)
  if (!original) return true
  if (advisor.title !== original.title || advisor.branch !== original.branch) return true
  if (advisor.annual_threshold !== original.annual_threshold) return true
  if (advisor.annual_stretch !== original.annual_stretch) return true
  return advisor.months.some((month, index) => (
    month.target !== original.months[index].target ||
    month.target_bookings !== original.months[index].target_bookings
  ))
}

function sortValue(advisor: AdvisorState, base: TargetBase, sortField: string) {
  if (sortField === 'name') return advisor.name.toLowerCase()
  if (sortField === 'title') return (advisor.title || '').toLowerCase()
  if (sortField === 'branch') return (advisor.branch || '').toLowerCase()
  if (sortField === 'annual_threshold') return advisor.annual_threshold
  if (sortField === 'monthly_threshold') return advisor.monthly_threshold
  if (sortField === 'prior_year_actual') return getAdvisorMetrics(advisor, base).totalPY
  if (sortField === 'total_target') return getAdvisorMetrics(advisor, base).totalTarget
  if (sortField.startsWith('month_')) return monthSortValue(advisor, base, sortField)
  if (/^q[1-4]_target$/.test(sortField)) return quarterSortValue(advisor, base, sortField)
  return 0
}

function monthSortValue(advisor: AdvisorState, base: TargetBase, sortField: string) {
  const index = parseInt(sortField.replace('month_', ''), 10) - 1
  const month = advisor.months[index]
  return base === 'bookings' ? month.target_bookings : month.target
}

function quarterSortValue(advisor: AdvisorState, base: TargetBase, sortField: string) {
  const quarterIndex = parseInt(sortField.slice(1, 2), 10) - 1
  return getAdvisorMetrics(advisor, base).quarterTargets[quarterIndex]
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function sumIndexes(values: number[], indexes: readonly number[]) {
  return indexes.reduce((total, index) => total + values[index], 0)
}
