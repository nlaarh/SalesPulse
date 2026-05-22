/**
 * Growth Intelligence API — Path to 120M dashboard data.
 */
import { api } from './api'

export interface GrowthTotals {
  zips: number
  population: number
  adults_18p: number
  active_members: number
  ins_customers: number
  auto_customers: number
  home_customers: number
  travel_customers: number
  travel_revenue: number
  battery_customers: number
  ers_calls: number
  registered_vehicles: number
  owner_units: number
  mem_pen: number | null
  ins_xsell: number | null
  auto_share: number | null
  home_pen: number | null
  travel_eng: number | null
  opp_total: number
  opp_membership: number
  opp_auto: number
  opp_home: number
  opp_travel: number
}

export interface Waterfall {
  current: number
  cross_sell_opp: number
  acquisition_opp: number
  travel_growth: number
  target: number
}

export interface ScorecardResponse {
  totals: GrowthTotals
  quadrants: Record<string, number>
  waterfall: Waterfall
}

export interface ZipRow {
  zip: string
  city: string
  county: string
  region: string
  segment: string
  quadrant: string
  population: number
  adults_18p: number
  active_members: number
  ins_customers: number
  auto_customers: number
  home_customers: number
  travel_customers: number
  travel_revenue: number
  mem_pen: number | null
  ins_xsell: number | null
  auto_share: number | null
  home_pen: number | null
  travel_eng: number | null
  friction: number
  opp_total: number
  opp_membership: number
  opp_auto: number
  opp_home: number
  opp_travel: number
}

export interface ZipTableResponse {
  rows: ZipRow[]
  total: number
}

export interface TrendsResponse {
  membership_trend: Record<string, string>[]
  insurance_retention: Record<string, string>[]
  competitors: Record<string, string>[]
}

export interface ProductSummary {
  total_opportunity: number
  top_zips: {
    zip: string
    city: string
    county: string
    opportunity: number
    penetration: number | null
    segment: string
  }[]
}

export async function fetchScorecard(): Promise<ScorecardResponse> {
  const { data } = await api.get('/api/growth/scorecard')
  return data
}

export async function fetchZipTable(params?: {
  quadrant?: string
  segment?: string
  county?: string
  limit?: number
  sort?: string
}): Promise<ZipTableResponse> {
  const { data } = await api.get('/api/growth/zip-table', { params })
  return data
}

export async function fetchTrends(): Promise<TrendsResponse> {
  const { data } = await api.get('/api/growth/trends')
  return data
}

export async function fetchProducts(): Promise<Record<string, ProductSummary>> {
  const { data } = await api.get('/api/growth/products')
  return data
}

// ── Canonical counts — single source of truth used across /growth-plan ──

export interface CanonicalCountsResponse {
  as_of: string
  source: string
  counts: {
    members: number
    auto_customers: number
    home_customers: number
    travel_customers: number
  }
  total_insurance: number
}

export async function fetchCanonicalCounts(): Promise<CanonicalCountsResponse> {
  const { data } = await api.get('/api/growth/data/canonical-counts')
  return data
}

// ── Coverage tiers (Premier / Plus / Basic) — "customers by segment" ──

export interface CoverageTierRow {
  tier: string
  count: number
  pct_of_total: number
}

export interface CoverageTiersResponse {
  level: 'tier'
  as_of: string
  rows: CoverageTierRow[]
  totals: { count: number }
  count: number
}

export async function fetchCoverageTiers(): Promise<CoverageTiersResponse> {
  const { data } = await api.get('/api/growth/data/coverage-tiers')
  return data
}
