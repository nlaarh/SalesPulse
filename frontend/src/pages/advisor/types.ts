/**
 * Shared types for the Advisor Dashboard tabs.
 *
 * These types are local to the advisor page family.
 * Cross-page types live in @/lib/types.
 */

import type { useChartColors } from '@/lib/chart-theme'

export interface Summary {
  bookings: number; bookings_prev: number; bookings_yoy_pct: number
  commission: number; commission_prev: number; commission_yoy_pct: number
  revenue: number; revenue_prev: number; revenue_yoy_pct: number
  deals: number; win_rate: number; avg_deal_size: number
  pipeline_value: number; pipeline_count: number
  /** Period-matched deals YoY (may not be present on all responses) */
  deals_yoy_pct?: number
}

export interface Advisor {
  rank: number; name: string
  bookings: number; commission: number; revenue: number
  deals: number; win_rate: number; avg_deal_size: number
  pipeline_value: number; pipeline_count: number
}

export interface YoYData {
  months: { month: number; label: string; current_revenue: number; prior_revenue: number; current_deals: number; prior_deals: number }[]
  current_year: number; prior_year: number
  current_total: number; prior_total: number; yoy_pct: number
  ytd_current_total: number; ytd_prior_total: number; ytd_yoy_pct: number
  ytd_current_deals: number; ytd_prior_deals: number; ytd_months: number
}

export interface CloseSpeed {
  avg_days: number
  median_days: number
  agents: { name: string; avg_days: number; median_days: number; deals: number }[]
}

export type ChartColors = ReturnType<typeof useChartColors>
