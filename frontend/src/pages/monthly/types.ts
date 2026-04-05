import { formatCurrency, formatNumber } from '@/lib/utils'
import { TIPS } from '@/components/MetricTip'

/* ── Shared types for Monthly Report tabs ────────────────────────────────── */

export interface MonthData {
  month: string
  leads: number
  opps: number
  invoiced: number
  inv_opp_pct: number
  sales: number
  commission: number
}

export interface AgentReport {
  name: string
  months: MonthData[]
  totals: { leads: number; opps: number; invoiced: number; inv_opp_pct: number; sales: number; commission: number }
}

export type Metric = 'commission' | 'sales' | 'leads' | 'opps' | 'invoiced'
export type SortField = 'name' | 'total' | string

export const METRICS: { key: Metric; label: string; short: string; tip: string }[] = [
  { key: 'commission', label: 'Commission ($)', short: 'Comm', tip: TIPS.monthlyComm },
  { key: 'sales', label: 'Bookings ($)', short: 'Bookings', tip: TIPS.monthlyBookings },
  { key: 'leads', label: 'Leads', short: 'Leads', tip: TIPS.monthlyLeads },
  { key: 'opps', label: 'Opportunities', short: 'Opps', tip: TIPS.monthlyOpps },
  { key: 'invoiced', label: 'Invoiced', short: 'Inv', tip: TIPS.monthlyInvoiced },
]

export function fmtCell(value: number, metric: Metric): string {
  if (metric === 'commission' || metric === 'sales') return formatCurrency(value, true)
  return formatNumber(value)
}
