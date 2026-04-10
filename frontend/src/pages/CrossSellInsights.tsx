/**
 * CrossSellInsights — Product Gap Analysis
 *
 * Shows customers who have one product line but are missing another:
 * - Travel customers → sell Insurance
 * - Insurance customers → sell Travel packages
 * Each row shows contact info, spend, and a direct Salesforce link.
 */

import { useEffect, useState, useMemo } from 'react'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchCrossSellInsights,
  type CrossSellInsights as CrossSellData,
  type CrossSellCustomer,
} from '@/lib/api'
import {
  Loader2, Lightbulb, ShieldAlert, Plane,
  DollarSign, Phone, ExternalLink,
  ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function priorityColor(p: string) {
  if (p === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (p === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
}

function ltvBadge(ltv: string) {
  const l = (ltv || '').toUpperCase().charAt(0)
  const colors: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    B: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    D: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    E: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return colors[l] || 'bg-muted text-muted-foreground'
}

function gapBadge(gap: string) {
  if (gap === 'Insurance') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
}

/* ── Summary Card ────────────────────────────────────────────────────────── */

function SummaryCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof ShieldAlert
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-5 flex items-start gap-4">
      <div className={cn('rounded-lg p-2.5', accent || 'bg-primary/10 text-primary')}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Customer Table ──────────────────────────────────────────────────────── */

function CustomerTable({ customers, title, icon: Icon, iconColor }: {
  customers: CrossSellCustomer[]
  title: string
  icon: typeof ShieldAlert
  iconColor: string
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.account_name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [customers, search])

  if (customers.length === 0) return null

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <Icon className={cn('h-5 w-5', iconColor)} />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {customers.length} customers
        </span>
        <div className="ml-auto">
          <input
            type="text"
            placeholder="Search name, city, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Phone</th>
              <th className="text-left px-4 py-3 font-medium">City</th>
              <th className="text-center px-4 py-3 font-medium">LTV</th>
              <th className="text-right px-4 py-3 font-medium">Total Spend</th>
              <th className="text-center px-4 py-3 font-medium">Sell</th>
              <th className="text-center px-4 py-3 font-medium">Priority</th>
              <th className="text-left px-4 py-3 font-medium">Why</th>
              <th className="text-center px-4 py-3 font-medium">SF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={c.account_id || i}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                  {c.account_name || '—'}
                </td>
                <td className="px-4 py-3 text-foreground whitespace-nowrap">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-1.5 text-primary hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {c.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.city || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {c.ltv ? (
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ltvBadge(c.ltv))}>
                      {c.ltv}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  {fmtFull(c.total_spend)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', gapBadge(c.gap))}>
                    {c.gap}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', priorityColor(c.priority))}>
                    {c.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-[280px] truncate" title={c.reason}>
                  {c.reason}
                </td>
                <td className="px-4 py-3 text-center">
                  <a
                    href={c.sf_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                    onClick={e => e.stopPropagation()}
                    title="Open in Salesforce"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && search && (
        <div className="px-5 py-8 text-center text-muted-foreground text-sm">
          No customers matching "{search}"
        </div>
      )}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

type Tab = 'all' | 'needs_insurance' | 'needs_travel'

export default function CrossSellInsights() {
  const { period, startDate, endDate } = useSales()

  const [data, setData] = useState<CrossSellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetchCrossSellInsights(period, startDate, endDate)
      .then(setData)
      .catch(e => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Analyzing product gaps…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        {error || 'No data available'}
      </div>
    )
  }

  const { summary } = data

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All Opportunities', count: summary.needs_insurance_count + summary.needs_travel_count },
    { key: 'needs_insurance', label: 'Sell Insurance', count: summary.needs_insurance_count },
    { key: 'needs_travel', label: 'Sell Travel', count: summary.needs_travel_count },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2">
          <Lightbulb className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cross-Sell Insights</h1>
          <p className="text-sm text-muted-foreground">
            Customers with product gaps — who to call and what to offer
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={ShieldAlert}
          label="Need Insurance"
          value={summary.needs_insurance_count.toLocaleString()}
          sub={`${fmt(summary.needs_insurance_value)} in travel spend`}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <SummaryCard
          icon={Plane}
          label="Need Travel"
          value={summary.needs_travel_count.toLocaleString()}
          sub={`${fmt(summary.needs_travel_value)} in insurance spend`}
          accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <SummaryCard
          icon={ArrowRightLeft}
          label="Have Both Products"
          value={summary.customers_with_both.toLocaleString()}
          sub="Fully cross-sold"
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <SummaryCard
          icon={DollarSign}
          label="Cross-Sell Rate"
          value={`${summary.total_travel_customers + summary.total_insurance_customers > 0
            ? ((summary.customers_with_both / (summary.total_travel_customers + summary.total_insurance_customers - summary.customers_with_both)) * 100).toFixed(1)
            : 0}%`}
          sub={`${(summary.total_travel_customers + summary.total_insurance_customers - summary.customers_with_both).toLocaleString()} unique customers`}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      {/* Tab Selector */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span className="ml-2 text-xs opacity-70">({t.count.toLocaleString()})</span>
          </button>
        ))}
      </div>

      {/* Customer Tables */}
      {(tab === 'all' || tab === 'needs_insurance') && (
        <CustomerTable
          customers={data.needs_insurance}
          title="Travel Customers → Sell Insurance"
          icon={ShieldAlert}
          iconColor="text-blue-500"
        />
      )}

      {(tab === 'all' || tab === 'needs_travel') && (
        <CustomerTable
          customers={data.needs_travel}
          title="Insurance Customers → Sell Travel"
          icon={Plane}
          iconColor="text-purple-500"
        />
      )}
    </div>
  )
}
