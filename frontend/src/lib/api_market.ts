// ── Cross-Sell Insights ───────────────────────────────────────────────────────

import { api, withDates } from './api'

export interface CrossSellCustomer {
  account_id: string
  account_name: string
  phone: string
  email: string
  city: string
  ltv: string
  products_owned: string[]
  gap: string
  gap_type: 'needs_insurance' | 'needs_travel'
  total_spend: number
  transaction_count: number
  score: number
  priority: 'high' | 'medium' | 'low'
  reason: string
  sf_link: string
}

export interface CrossSellInsights {
  summary: {
    total_travel_customers: number
    total_insurance_customers: number
    customers_with_both: number
    needs_insurance_count: number
    needs_travel_count: number
    needs_insurance_value: number
    needs_travel_value: number
    total_travel_revenue: number
    total_insurance_revenue: number
  }
  needs_insurance: CrossSellCustomer[]
  needs_travel: CrossSellCustomer[]
  date_range: { start: string; end: string }
}

export async function fetchCrossSellInsights(
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<CrossSellInsights> {
  const { data } = await api.get('/api/cross-sell/insights', {
    params: withDates({ period }, startDate, endDate),
  })
  return data as CrossSellInsights
}

// ── Membership Upgrade Insights ───────────────────────────────────────────────

export interface MembershipUpgradeCustomer {
  account_id: string
  account_name: string
  phone: string
  email: string
  city: string
  ltv: string
  current_tier: string
  upgrade_to: string
  total_spend: number
  transaction_count: number
  score: number
  priority: 'high' | 'medium' | 'low'
  reason: string
  sf_link: string
}

export interface MembershipUpgradeInsights {
  summary: {
    total_upgradeable: number
    upgrade_value: number
    by_tier: Record<string, number>
  }
  customers: MembershipUpgradeCustomer[]
  date_range: { start: string; end: string }
}

export async function fetchMembershipUpgrades(
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<MembershipUpgradeInsights> {
  const { data } = await api.get('/api/cross-sell/membership-upgrades', {
    params: withDates({ period }, startDate, endDate),
  })
  return data as MembershipUpgradeInsights
}

// ── Medicare Eligibility Insights ─────────────────────────────────────────────

export interface MedicareEligibilityCustomer {
  account_id: string
  account_name: string
  phone: string
  email: string
  city: string
  ltv: string
  membership: string
  age: number | null
  birthdate: string | null
  days_until_65: number
  score: number
  priority: 'high' | 'medium' | 'low'
  reason: string
  sf_link: string
}

export interface MedicareEligibilityInsights {
  summary: {
    total_eligible: number
    high_priority_count: number
    medium_priority_count: number
    low_priority_count: number
  }
  customers: MedicareEligibilityCustomer[]
  date_range: { start: string; end: string }
}

export async function fetchMedicareEligibility(
  period = 12,
  startDate?: string | null,
  endDate?: string | null,
): Promise<MedicareEligibilityInsights> {
  const { data } = await api.get('/api/cross-sell/medicare-eligibility', {
    params: withDates({ period }, startDate, endDate),
  })
  return data as MedicareEligibilityInsights
}

// ── Market Pulse ──────────────────────────────────────────────────────────────


export interface MarketPulseAlert {
  type: 'travel_advisory' | 'medicare_enrollment' | 'medicare_turning_65' | 'seasonal' | 'membership'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  summary: string
  action: string
  icon: string
  deadline?: string
  days_remaining?: number
  country_name?: string
  advisory_level?: number
  customer_trips?: number
  destination?: string
}

export interface MarketPulseMetrics {
  international_trips: number
  international_value: number
  medicare_enrolled_period: number
  members_turning_65: number
  expiring_memberships_90d: number
  basic_tier_members: number
  top_destinations: { destination: string; trips: number }[]
}

export interface MarketPulseData {
  alerts: MarketPulseAlert[]
  metrics: MarketPulseMetrics
  advisory_count: number
  date_range: { start: string; end: string }
  generated_at: string
}

export async function fetchMarketPulse(
  period = 6,
  startDate?: string | null,
  endDate?: string | null,
): Promise<MarketPulseData> {
  const { data } = await api.get('/api/market-pulse', {
    params: withDates({ period }, startDate, endDate),
  })
  return data as MarketPulseData
}

export interface ImpactedAdvisor {
  advisor: string
  trips: number
  value: number
  customers: {
    name: string
    account_id: string
    trip: string
    destination: string
    amount: number
    close_date: string
  }[]
}

export interface ImpactedCustomersData {
  advisors: ImpactedAdvisor[]
  total: number
}

export async function fetchImpactedCustomers(
  destination: string,
  period = 6,
  startDate?: string | null,
  endDate?: string | null,
): Promise<ImpactedCustomersData> {
  const { data } = await api.get('/api/market-pulse/impacted-customers', {
    params: withDates({ destination, period }, startDate, endDate),
  })
  return data as ImpactedCustomersData
}
