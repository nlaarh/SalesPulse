import { api } from './api'

export interface GoalFocusOpportunity {
  rank: number
  id: string
  name: string
  amount: number
  goal_value: number
  expected_value: number
  stage: string
  probability: number
  forecast_category: string
  close_date: string
  last_activity: string
  push_count: number
  owner: string
  score: number
  priority_score: number
  reasons: string[]
  next_action: string
}

export interface GoalFocusResponse {
  line: string
  metric: 'commission' | 'bookings'
  target: number
  actual: number
  gap: number
  coverage_amount: number
  coverage_pct: number
  expected_value: number
  available_count: number
  opportunities: GoalFocusOpportunity[]
  month_start: string
  month_end: string
  message?: string
}

export async function fetchGoalFocusOpportunities(line: string, metric: 'commission' | 'bookings') {
  const { data } = await api.get('/api/sales/opportunities/goal-focus', {
    params: { line, metric, limit: 8 },
    timeout: 30000,
  })
  return data as GoalFocusResponse
}
