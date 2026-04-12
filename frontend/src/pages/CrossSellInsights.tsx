/**
 * CrossSellInsights — Product Gap Analysis
 *
 * Shows customers who have one product line but are missing another,
 * with smart reasons (age, membership, LTV, spend) and pagination.
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
  ArrowRightLeft, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Constants ──────────────────────────────────────────────────────────── */

const PAGE_SIZE = 25

/* ── Formatters ──────────────────────────────────────────────────────────── */

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
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

/* ── Customer Table with Pagination ──────────────────────────────────────── */

function CustomerTable({ customers, title, icon: Icon, iconColor }: {
  customers: CrossSellCustomer[]
  title: string
  icon: typeof ShieldAlert
  iconColor: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.account_name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [customers, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (customers.length === 0) return null

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <Icon className={cn('h-5 w-5', iconColor)} />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {filtered.length} customers
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Phone</th>
              <th className="text-left px-4 py-3 font-medium">City</th>
              <th className="text-center px-4 py-3 font-medium">LTV</th>
              <th className="text-right px-4 py-3 font-medium">Spend</th>
              <th className="text-center px-4 py-3 font-medium">Sell</th>
              <th className="text-center px-4 py-3 font-medium">Priority</th>
              <th className="text-left px-4 py-3 font-medium" style={{ minWidth: 280 }}>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((c, i) => (
              <tr
                key={c.account_id || i}
                className={cn(
                  'border-b border-border/50 transition-colors hover:bg-muted/20',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/5',
                )}
              >
                {/* Customer name + SF link */}
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {c.account_name || '—'}
                    {c.sf_link && (
                      <a
                        href={c.sf_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary/60 hover:text-primary transition-colors"
                        title="Open in Salesforce"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>

                {/* Phone */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-1.5 text-foreground/70 hover:text-primary transition-colors"
                    >
                      <Phone className="h-3 w-3" />
                      <span className="text-xs">{c.phone}</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>

                {/* City */}
                <td className="px-4 py-3 text-foreground/70 whitespace-nowrap text-xs">{c.city || '—'}</td>

                {/* LTV — soft muted badges */}
                <td className="px-4 py-3 text-center">
                  {c.ltv ? (
                    <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', {
                      'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400': c.ltv.startsWith('A'),
                      'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400': c.ltv.startsWith('B'),
                      'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400': c.ltv.startsWith('C'),
                      'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400': c.ltv.startsWith('D'),
                      'bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400': c.ltv.startsWith('E'),
                    })}>
                      {c.ltv}
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>

                {/* Spend */}
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground/80 text-xs">
                  {fmtFull(c.total_spend)}
                </td>

                {/* Gap — subtle outline badges */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-medium border', {
                    'border-blue-200 text-blue-700 bg-blue-50/50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-900/10': c.gap === 'Insurance',
                    'border-violet-200 text-violet-700 bg-violet-50/50 dark:border-violet-800 dark:text-violet-400 dark:bg-violet-900/10': c.gap === 'Travel',
                  })}>
                    {c.gap}
                  </span>
                </td>

                {/* Priority — soft color dots */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className="flex items-center justify-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full', {
                      'bg-rose-500': c.priority === 'high',
                      'bg-amber-400': c.priority === 'medium',
                      'bg-emerald-400': c.priority === 'low',
                    })} />
                    <span className={cn('text-xs font-medium capitalize', {
                      'text-rose-600 dark:text-rose-400': c.priority === 'high',
                      'text-amber-600 dark:text-amber-400': c.priority === 'medium',
                      'text-emerald-600 dark:text-emerald-400': c.priority === 'low',
                    })}>
                      {c.priority}
                    </span>
                  </span>
                </td>

                {/* Reason — 2 lines, no truncation */}
                <td className="px-4 py-3">
                  <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2" style={{ minWidth: 260 }}>
                    {c.reason}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              // Show pages around current
              let pageNum: number
              if (totalPages <= 7) {
                pageNum = i
              } else if (page < 3) {
                pageNum = i
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i
              } else {
                pageNum = page - 3 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    'w-8 h-8 rounded-md text-xs font-medium transition-colors',
                    page === pageNum
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2">
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
          accent="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
        />
        <SummaryCard
          icon={Plane}
          label="Need Travel"
          value={summary.needs_travel_count.toLocaleString()}
          sub={`${fmt(summary.needs_travel_value)} in insurance spend`}
          accent="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
        />
        <SummaryCard
          icon={ArrowRightLeft}
          label="Have Both Products"
          value={summary.customers_with_both.toLocaleString()}
          sub="Fully cross-sold"
          accent="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
        />
        <SummaryCard
          icon={DollarSign}
          label="Cross-Sell Rate"
          value={`${summary.total_travel_customers + summary.total_insurance_customers > 0
            ? ((summary.customers_with_both / (summary.total_travel_customers + summary.total_insurance_customers - summary.customers_with_both)) * 100).toFixed(1)
            : 0}%`}
          sub={`${(summary.total_travel_customers + summary.total_insurance_customers - summary.customers_with_both).toLocaleString()} unique customers`}
          accent="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
        />
      </div>

      {/* Tab Selector */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
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
            <span className="ml-2 text-xs opacity-60">({t.count.toLocaleString()})</span>
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
          iconColor="text-violet-500"
        />
      )}
    </div>
  )
}
