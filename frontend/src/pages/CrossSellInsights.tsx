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
  fetchMedicareEligibility,
  fetchMembershipUpgrades,
  type CrossSellInsights as CrossSellData,
  type CrossSellCustomer,
  type MedicareEligibilityCustomer,
  type MedicareEligibilityInsights,
  type MembershipUpgradeCustomer,
  type MembershipUpgradeInsights,
} from '@/lib/api'
import {
  Loader2, Lightbulb, ShieldAlert, Plane,
  DollarSign, Phone, ExternalLink,
  ArrowRightLeft, ChevronLeft, ChevronRight,
  Cake, UserPlus, TrendingUp,
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

/* ── Generic Sortable Header ────────────────────────────────────────────── */

function SortHeader<T extends string>({
  field,
  label,
  sortField,
  sortAsc,
  onSort,
  className,
  style,
}: {
  field: T
  label: string
  sortField: T
  sortAsc: boolean
  onSort: (field: T) => void
  className?: string
  style?: React.CSSProperties
}) {
  const active = sortField === field
  const isRight = className?.includes('text-right')
  const isCenter = className?.includes('text-center')

  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        'px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/40 transition-colors',
        className
      )}
      style={style}
    >
      <div className={cn(
        'flex items-center gap-1',
        isRight && 'justify-end',
        isCenter && 'justify-center'
      )}>
        <span>{label}</span>
        <span className="text-[10px] opacity-70">
          {active ? (sortAsc ? '▲' : '▼') : '↕'}
        </span>
      </div>
    </th>
  )
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
    <div className="rounded-xl bg-card border border-border p-4 flex flex-col items-center justify-center text-center gap-1.5">
      <div className={cn('rounded-lg p-2.5', accent || 'bg-primary/10 text-primary')}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-muted-foreground leading-snug">{label}</p>
      <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground leading-snug">{sub}</p>}
    </div>
  )
}

/* ── Customer Table with Pagination & Sorting ────────────────────────────── */

type CustSortField = 'name' | 'phone' | 'city' | 'ltv' | 'spend' | 'sell' | 'priority' | 'reason'

function CustomerTable({ customers, title, icon: Icon, iconColor }: {
  customers: CrossSellCustomer[]
  title: string
  icon: typeof ShieldAlert
  iconColor: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<CustSortField>('spend')
  const [sortAsc, setSortAsc] = useState(false)

  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const handleSort = (field: CustSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.account_name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [customers, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'name') {
        valA = a.account_name || ''
        valB = b.account_name || ''
      } else if (sortField === 'phone') {
        valA = a.phone || ''
        valB = b.phone || ''
      } else if (sortField === 'city') {
        valA = a.city || ''
        valB = b.city || ''
      } else if (sortField === 'ltv') {
        valA = a.ltv || ''
        valB = b.ltv || ''
      } else if (sortField === 'spend') {
        valA = a.total_spend || 0
        valB = b.total_spend || 0
      } else if (sortField === 'sell') {
        valA = a.gap || ''
        valB = b.gap || ''
      } else if (sortField === 'priority') {
        const priorityWeight = { high: 3, medium: 2, low: 1 }
        valA = priorityWeight[a.priority] || 0
        valB = priorityWeight[b.priority] || 0
      } else if (sortField === 'reason') {
        valA = a.reason || ''
        valB = b.reason || ''
      }

      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortField, sortAsc])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
              <SortHeader field="name" label="Customer" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="phone" label="Phone" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="city" label="City" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="ltv" label="LTV" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="spend" label="Spend" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-right" />
              <SortHeader field="sell" label="Sell" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="priority" label="Priority" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="reason" label="Recommendation" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" style={{ minWidth: 280 }} />
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

                {/* LTV */}
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

                {/* Gap */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  <span className={cn('inline-block px-2 py-0.5 rounded text-xs font-medium border', {
                    'border-blue-200 text-blue-700 bg-blue-50/50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-900/10': c.gap === 'Insurance',
                    'border-violet-200 text-violet-700 bg-violet-50/50 dark:border-violet-800 dark:text-violet-400 dark:bg-violet-900/10': c.gap === 'Travel',
                  })}>
                    {c.gap}
                  </span>
                </td>

                {/* Priority */}
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

                {/* Reason */}
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

/* ── Medicare Table with Pagination & Sorting ────────────────────────────── */

type MedSortField = 'name' | 'phone' | 'city' | 'ltv' | 'membership' | 'age' | 'days_until_65' | 'priority' | 'reason'

function MedicareTable({ customers, title, icon: Icon, iconColor }: {
  customers: MedicareEligibilityCustomer[]
  title: string
  icon: typeof ShieldAlert
  iconColor: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<MedSortField>('days_until_65')
  const [sortAsc, setSortAsc] = useState(true)

  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const handleSort = (field: MedSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.account_name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [customers, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'name') {
        valA = a.account_name || ''
        valB = b.account_name || ''
      } else if (sortField === 'phone') {
        valA = a.phone || ''
        valB = b.phone || ''
      } else if (sortField === 'city') {
        valA = a.city || ''
        valB = b.city || ''
      } else if (sortField === 'ltv') {
        valA = a.ltv || ''
        valB = b.ltv || ''
      } else if (sortField === 'membership') {
        valA = a.membership || ''
        valB = b.membership || ''
      } else if (sortField === 'age') {
        valA = a.age || 0
        valB = b.age || 0
      } else if (sortField === 'days_until_65') {
        valA = a.days_until_65 || 0
        valB = b.days_until_65 || 0
      } else if (sortField === 'priority') {
        const priorityWeight = { high: 3, medium: 2, low: 1 }
        valA = priorityWeight[a.priority] || 0
        valB = priorityWeight[b.priority] || 0
      } else if (sortField === 'reason') {
        valA = a.reason || ''
        valB = b.reason || ''
      }

      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortField, sortAsc])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
              <SortHeader field="name" label="Customer" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="phone" label="Phone" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="city" label="City" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="ltv" label="LTV" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="membership" label="Membership" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="age" label="Age" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="days_until_65" label="Turning 65" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="priority" label="Priority" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="reason" label="Recommendation" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" style={{ minWidth: 280 }} />
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

                {/* LTV */}
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

                {/* Membership */}
                <td className="px-4 py-3 text-center whitespace-nowrap text-xs font-medium text-foreground/80">
                  {c.membership || '—'}
                </td>

                {/* Age / Birthday */}
                <td className="px-4 py-3 text-center whitespace-nowrap text-xs text-foreground/70">
                  {c.age ? `Age ${c.age}` : '—'} {c.birthdate ? `(${c.birthdate})` : ''}
                </td>

                {/* Turning 65 Countdown */}
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {c.days_until_65 > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900">
                      In {c.days_until_65} days
                    </span>
                  ) : c.days_until_65 === 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse dark:bg-emerald-955/20 dark:text-emerald-400 dark:border-emerald-900">
                      Today! 🎉
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800">
                      {Math.abs(c.days_until_65)}d ago
                    </span>
                  )}
                </td>

                {/* Priority */}
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

                {/* Reason */}
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

/* ── Membership Table with Pagination & Sorting ──────────────────────────── */

type MemSortField = 'name' | 'phone' | 'city' | 'ltv' | 'spend' | 'current_tier' | 'upgrade_to' | 'priority' | 'reason'

function MembershipTable({ customers, title, icon: Icon, iconColor }: {
  customers: MembershipUpgradeCustomer[]
  title: string
  icon: typeof ShieldAlert
  iconColor: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sortField, setSortField] = useState<MemSortField>('spend')
  const [sortAsc, setSortAsc] = useState(false)

  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const handleSort = (field: MemSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.account_name.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    )
  }, [customers, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let valA: any = ''
      let valB: any = ''

      if (sortField === 'name') {
        valA = a.account_name || ''
        valB = b.account_name || ''
      } else if (sortField === 'phone') {
        valA = a.phone || ''
        valB = b.phone || ''
      } else if (sortField === 'city') {
        valA = a.city || ''
        valB = b.city || ''
      } else if (sortField === 'ltv') {
        valA = a.ltv || ''
        valB = b.ltv || ''
      } else if (sortField === 'spend') {
        valA = a.total_spend || 0
        valB = b.total_spend || 0
      } else if (sortField === 'current_tier') {
        valA = a.current_tier || ''
        valB = b.current_tier || ''
      } else if (sortField === 'upgrade_to') {
        valA = a.upgrade_to || ''
        valB = b.upgrade_to || ''
      } else if (sortField === 'priority') {
        const priorityWeight = { high: 3, medium: 2, low: 1 }
        valA = priorityWeight[a.priority] || 0
        valB = priorityWeight[b.priority] || 0
      } else if (sortField === 'reason') {
        valA = a.reason || ''
        valB = b.reason || ''
      }

      if (valA < valB) return sortAsc ? -1 : 1
      if (valA > valB) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortField, sortAsc])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
              <SortHeader field="name" label="Customer" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="phone" label="Phone" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="city" label="City" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" />
              <SortHeader field="ltv" label="LTV" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="spend" label="Spend" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-right" />
              <SortHeader field="current_tier" label="Current Tier" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="upgrade_to" label="Target Tier" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="priority" label="Priority" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-center" />
              <SortHeader field="reason" label="Recommendation" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} className="text-left" style={{ minWidth: 280 }} />
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

                {/* LTV */}
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

                {/* Current Tier */}
                <td className="px-4 py-3 text-center whitespace-nowrap text-xs font-medium text-foreground/80">
                  <span className={cn('px-2 py-0.5 rounded border', {
                    'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400': c.current_tier === 'Non-Member',
                    'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/20 dark:text-zinc-400': c.current_tier === 'Classic' || c.current_tier === 'Basic',
                    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400': c.current_tier === 'Plus',
                  })}>
                    {c.current_tier || '—'}
                  </span>
                </td>

                {/* Target Tier */}
                <td className="px-4 py-3 text-center whitespace-nowrap text-xs font-semibold text-primary">
                  <span className={cn('px-2 py-0.5 rounded border bg-primary/5 border-primary/20 text-primary')}>
                    {c.upgrade_to || '—'}
                  </span>
                </td>

                {/* Priority */}
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

                {/* Reason */}
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

type Tab = 'all' | 'needs_insurance' | 'needs_travel' | 'medicare' | 'membership_upgrades' | 'needs_membership'

export default function CrossSellInsights() {
  const { period, startDate, endDate } = useSales()

  const [data, setData] = useState<CrossSellData | null>(null)
  const [medicareData, setMedicareData] = useState<MedicareEligibilityInsights | null>(null)
  const [upgradesData, setUpgradesData] = useState<MembershipUpgradeInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      fetchCrossSellInsights(period, startDate, endDate),
      fetchMedicareEligibility(period, startDate, endDate),
      fetchMembershipUpgrades(period, startDate, endDate)
    ])
      .then(([cs, med, upg]) => {
        setData(cs)
        setMedicareData(med)
        setUpgradesData(upg)
      })
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
  const medSummary = medicareData?.summary
  const upgSummary = upgradesData?.summary

  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: 'all',
      label: 'All Opportunities',
      count:
        summary.needs_insurance_count +
        summary.needs_travel_count +
        (medSummary?.total_eligible ?? 0) +
        (upgSummary?.total_upgradeable ?? 0) +
        (upgSummary?.total_needs_membership ?? 0),
    },
    { key: 'needs_insurance', label: 'Sell Insurance', count: summary.needs_insurance_count },
    { key: 'needs_travel', label: 'Sell Travel', count: summary.needs_travel_count },
    { key: 'needs_membership', label: 'New Membership', count: upgSummary?.total_needs_membership ?? 0 },
    { key: 'membership_upgrades', label: 'Membership Upgrade', count: upgSummary?.total_upgradeable ?? 0 },
    { key: 'medicare', label: 'Medicare Eligibility', count: medSummary?.total_eligible ?? 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2">
          <Lightbulb className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cross-Sell Opportunities</h1>
          <p className="text-sm text-muted-foreground">
            Customers with product gaps — who to call and what to offer
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
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
          icon={Cake}
          label="Medicare Turning 65"
          value={(medSummary?.total_eligible ?? 0).toLocaleString()}
          sub={`${medSummary?.high_priority_count ?? 0} high priority`}
          accent="bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Membership Upgrades"
          value={(upgSummary?.total_upgradeable ?? 0).toLocaleString()}
          sub={`${fmt(upgSummary?.upgrade_value ?? 0)} spend to capture`}
          accent="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
        />
        <SummaryCard
          icon={UserPlus}
          label="Need Membership"
          value={(upgSummary?.total_needs_membership ?? 0).toLocaleString()}
          sub={`${fmt(upgSummary?.needs_membership_value ?? 0)} active spend`}
          accent="bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400"
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
      <div className="flex flex-wrap gap-1 bg-muted/30 rounded-lg p-1 w-fit">
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

      {(tab === 'all' || tab === 'needs_membership') && upgradesData && (
        <MembershipTable
          customers={upgradesData.needs_membership}
          title="Active Non-Members → Pitch Membership Enrollment"
          icon={UserPlus}
          iconColor="text-cyan-500"
        />
      )}

      {(tab === 'all' || tab === 'membership_upgrades') && upgradesData && (
        <MembershipTable
          customers={upgradesData.upgrades}
          title="Basic / Plus / Classic Members → Pitch Membership Upgrades"
          icon={TrendingUp}
          iconColor="text-indigo-500"
        />
      )}

      {(tab === 'all' || tab === 'medicare') && medicareData && (
        <MedicareTable
          customers={medicareData.customers}
          title="Medicare Eligible (Turning 65) → Route to Medicare Team"
          icon={Cake}
          iconColor="text-pink-500"
        />
      )}
    </div>
  )
}
