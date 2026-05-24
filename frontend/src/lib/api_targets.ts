import { api, withDates } from './api'

export async function uploadTargetsFile(file: File) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/admin/targets/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  })
  return data as {
    filename: string
    mapping: Record<string, string>
    has_months: boolean
    advisors: { raw_name: string; sf_name: string; branch: string | null; title: string | null; monthly_target: number | null; monthly_targets: Record<string, number> | null }[]
    count: number
  }
}

export async function confirmTargets(filename: string, line: string, advisors: unknown[]) {
  const { data } = await api.post('/api/admin/targets/confirm', { filename, line, advisors })
  return data as { upload_id: number; count: number; status: string }
}

export async function fetchTargets() {
  const { data } = await api.get('/api/targets')
  return data as {
    targets: { id: number; sf_name: string; branch: string | null; title: string | null; monthly_target: number | null }[]
    upload: { id: number; filename: string; uploaded_by_email: string; advisor_count: number; created_at: string } | null
  }
}

export async function fetchTargetsWithActuals(
  line = 'Travel', startDate?: string | null, endDate?: string | null,
) {
  const { data } = await api.get('/api/targets/with-actuals', {
    params: withDates({ line }, startDate, endDate),
  })
  return data as {
    advisors: {
      name: string; branch: string | null; title: string | null
      monthly_target: number | null; total_target: number; total_actual: number
      achievement_pct: number | null
      months: { month: string; target: number | null; actual: number; achievement_pct: number | null }[]
    }[]
    branches: { branch: string; target_sum: number; actual_sum: number; achievement_pct: number | null; advisor_count: number }[]
    months: string[]
    upload: { id: number; filename: string; uploaded_by_email: string; created_at: string } | null
  }
}

export interface MonthlyTargetMonth {
  month: number
  target: number
  target_bookings?: number
  actual: number
  achievement_pct: number | null
}

export interface MonthlyTargetAdvisor {
  advisor_target_id: number
  name: string
  branch: string | null
  title: string | null
  months: MonthlyTargetMonth[]
  total_target: number
  total_actual: number
  achievement_pct: number | null
  prior_year_actual: number
  prior_year_revenue: number
  prior_year_months: number[]
}

export interface MonthlyTargetsResponse {
  year: number
  advisors: MonthlyTargetAdvisor[]
  company: {
    months: MonthlyTargetMonth[]
    total_target: number
    total_actual: number
    achievement_pct: number | null
  } | null
  methodology?: {
    commission_rate: number
    prior_year: number
    prior_year_bookings: number
    prior_year_commission: number
    note: string
  }
}

export interface AchievementResponse {
  comm_rate?: number
  current_month: {
    month: number
    year: number
    day_of_month: number
    days_in_month: number
    pace_pct: number
    period_months?: number[]
    period_label?: string
    company: { target: number; bookings_target?: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
  } | null
  yearly: {
    year: number
    month_of_year: number
    pace_pct: number
    company: { target: number; bookings_target?: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
  } | null
  advisors: {
    name: string
    monthly: { target: number; bookings_target?: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null }
    yearly: { target: number; bookings_target?: number; actual: number; bookings_actual?: number; commission_actual?: number; achievement_pct: number | null; pace_pct: number }
  }[]
}

export async function fetchMonthlyTargets(year: number, line = 'Travel') {
  const { data } = await api.get(`/api/targets/monthly/${year}`, { params: { line } })
  return data as MonthlyTargetsResponse
}

export async function fetchTargetAchievement(line = 'Travel', advisorName?: string, startDate?: string | null, endDate?: string | null) {
  const params: Record<string, string> = { line }
  if (advisorName) params.advisor_name = advisorName
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const { data } = await api.get('/api/targets/achievement', { params })
  return data as AchievementResponse
}

export async function saveMonthlyTargets(
  year: number,
  updates: {
    advisor_target_id: number;
    months: Record<string, number>;
    title?: string | null;
    branch?: string | null;
    monthly_target?: number | null;
  }[],
  base: 'bookings' | 'commission' = 'commission',
  line: string = 'Travel',
) {
  const { data } = await api.put('/api/admin/targets/monthly', { year, updates, base, line })
  return data as { status: string; count: number }
}

export async function exportMonthlyTargetsExcel(
  year: number,
  line = 'Travel',
  base = 'commission'
): Promise<Blob> {
  const { data } = await api.get(`/api/targets/monthly/${year}/export`, {
    params: { line, base },
    responseType: 'blob',
  })
  return data
}

export async function importMonthlyTargetsExcel(
  year: number,
  file: File,
  line = 'Travel',
  base = 'commission'
) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post(`/api/targets/monthly/${year}/import`, form, {
    params: { line, base },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data as { status: string; advisors_updated: number; targets_updated: number }
}

export interface EstimateAdvisorMonth {
  month: number
  base_bookings: number
  base_commission: number
}

export interface EstimateAdvisor {
  advisor_target_id: number
  name: string
  months: EstimateAdvisorMonth[]
  avg_annual_bookings: number
  avg_annual_commission: number
}

export interface EstimateResponse {
  year: number
  base_years: number[]
  commission_rate: number
  existing_targets: number
  advisors: EstimateAdvisor[]
  error?: string
}

export async function computeEstimates(year: number, line: string, baseYears: number[]) {
  const { data } = await api.post('/api/targets/monthly/estimate', { year, line, base_years: baseYears })
  return data as EstimateResponse
}
