import { useEffect, useState } from 'react'
import { ExternalLink, Crown, Shield, Plane, Loader2, ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'
import { fetchAgentTopCustomers } from '@/lib/api'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Deal {
  id: string
  name: string
  amount: number
  commission: number
  close_date: string
  stage: string
  sf_link: string
}

interface Customer {
  account_id: string
  name: string
  phone: string
  email: string
  city: string
  total_spend: number
  revenue_share: number
  deal_count: number
  last_close: string
  membership: string
  tenure_years: number | null
  member_status: string
  has_insurance: boolean
  has_travel: boolean
  sf_link: string
  deals: Deal[]
}

interface TopCustomersTabProps {
  agentName: string
  line: string
  period: number
  startDate?: string | null
  endDate?: string | null
}

const PAGE_SIZE = 25

/* ── Membership badge ───────────────────────────────────────────────────── */

function MembershipBadge({ tier }: { tier: string }) {
  const upper = (tier || '').toUpperCase()
  const cls =
    upper === 'PREMIER' ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20' :
    upper === 'PLUS' ? 'bg-blue-500/15 text-blue-600 border border-blue-500/20' :
    upper.includes('RV') ? 'bg-purple-500/15 text-purple-600 border border-purple-500/20' :
    'bg-secondary text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', cls)}>
      {upper === 'PREMIER' && <Crown className="h-2.5 w-2.5" />}
      {tier || 'Basic'}
    </span>
  )
}

/* ── Revenue bar ──────────────────────────────────────────────────────────── */

function RevenueBar({ pct, rank }: { pct: number; rank: number }) {
  const color = rank === 0 ? 'bg-amber-500' : rank === 1 ? 'bg-slate-500' : rank === 2 ? 'bg-amber-700/70' : 'bg-primary/40'
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(1)}%</span>
    </div>
  )
}

/* ── Deal drill-down row ──────────────────────────────────────────────────── */

function DrillDown({ deals, isInsurance }: { deals: Deal[]; isInsurance: boolean }) {
  if (deals.length === 0) return (
    <div className="px-6 pb-3 pt-1 text-[11px] text-muted-foreground">No deals found in this period</div>
  )
  return (
    <div className="border-t border-border/30 bg-secondary/10">
      <div className="px-6 pt-2 pb-1 grid grid-cols-[1fr_auto_auto_auto_1.5rem] gap-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <span>Deal Name</span>
        <span className="text-right">Amount</span>
        {!isInsurance && <span className="text-right">Commission</span>}
        <span>Close Date</span>
        <span />
      </div>
      {deals.map((d) => (
        <div key={d.id} className="px-6 py-1.5 grid grid-cols-[1fr_auto_auto_auto_1.5rem] gap-3 items-center hover:bg-secondary/20 transition-colors">
          <span className="truncate text-[12px] text-foreground/80">{d.name}</span>
          <span className="text-right text-[12px] font-semibold tabular-nums">{formatCurrency(d.amount, true)}</span>
          {!isInsurance && (
            <span className="text-right text-[11px] tabular-nums text-emerald-600">
              {d.commission > 0 ? formatCurrency(d.commission, true) : '—'}
            </span>
          )}
          <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDate(d.close_date)}</span>
          <a href={d.sf_link} target="_blank" rel="noopener noreferrer"
            className="text-primary/40 hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      ))}
    </div>
  )
}

/* ── Customer row ─────────────────────────────────────────────────────────── */

function CustomerRow({ c, rank, expanded, onToggle, isInsurance }: {
  c: Customer; rank: number; expanded: boolean; onToggle: () => void; isInsurance: boolean
}) {
  const sfUrl = c.sf_link || `https://aaawcny.my.salesforce.com/${c.account_id}`
  const rankColor = rank === 0 ? 'text-amber-500' : rank === 1 ? 'text-slate-500' : rank === 2 ? 'text-amber-700' : 'text-muted-foreground/40'

  return (
    <>
      <div
        className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto_auto_1.5rem] items-center gap-3 px-6 py-2.5 cursor-pointer hover:bg-secondary/20 transition-colors select-none"
        onClick={onToggle}
      >
        {/* Rank */}
        <span className={cn('text-center text-[12px] font-bold tabular-nums', rankColor)}>
          {rank + 1}
        </span>

        {/* Name, phone, city */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <a href={sfUrl} target="_blank" rel="noopener noreferrer"
              className="truncate text-[13px] font-medium hover:text-primary hover:underline transition-colors"
              onClick={(e) => e.stopPropagation()}>
              {c.name}
            </a>
            {rank === 0 && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">
                Top
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {c.phone && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Phone className="h-2.5 w-2.5" />
                {c.phone}
              </span>
            )}
            {c.city && <span className="text-[11px] text-muted-foreground">{c.city}</span>}
            {c.tenure_years != null && (
              <span className="text-[11px] text-muted-foreground">{c.tenure_years}yr member</span>
            )}
          </div>
          <div className="mt-0.5">
            <MembershipBadge tier={c.membership} />
          </div>
        </div>

        {/* Total spend */}
        <div className="text-right">
          <span className="text-[13px] font-semibold tabular-nums">{formatCurrency(c.total_spend, true)}</span>
          <div className="mt-1">
            <RevenueBar pct={c.revenue_share} rank={rank} />
          </div>
        </div>

        {/* Deal count */}
        <span className="text-center text-[12px] tabular-nums text-muted-foreground">
          {c.deal_count} deal{c.deal_count !== 1 ? 's' : ''}
        </span>

        {/* Last close */}
        <span className="text-[12px] tabular-nums text-muted-foreground whitespace-nowrap">
          {fmtDate(c.last_close)}
        </span>

        {/* Product icons */}
        <div className="flex items-center gap-1.5">
          <Shield className={cn('h-3.5 w-3.5', c.has_insurance ? 'text-emerald-500' : 'text-muted-foreground/20')} />
          <Plane className={cn('h-3.5 w-3.5', c.has_travel ? 'text-emerald-500' : 'text-muted-foreground/20')} />
        </div>

        {/* Expand / SF */}
        <div className="flex items-center justify-end">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-primary/60" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>
      </div>

      {expanded && <DrillDown deals={c.deals} isInsurance={isInsurance} />}
    </>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function TopCustomersTab({
  agentName, line, period, startDate, endDate,
}: TopCustomersTabProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const isInsurance = line.toLowerCase() === 'insurance'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setExpandedId(null)
    setPage(0)
    fetchAgentTopCustomers(agentName, line, period, startDate, endDate)
      .then((res) => {
        if (cancelled) return
        setCustomers((res as any).customers ?? [])
        setTotalRevenue((res as any).total_revenue ?? 0)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.response?.data?.detail ?? 'Failed to load top customers')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [agentName, line, period, startDate, endDate])

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
      <span className="text-[12px]">Loading top customers...</span>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">{error}</div>
  )

  if (customers.length === 0) return (
    <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
      No customer data available for this period
    </div>
  )

  const totalPages = Math.ceil(customers.length / PAGE_SIZE)
  const pageItems = customers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px]">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{customers.length}</span> customers
        </span>
        <span className="text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{formatCurrency(totalRevenue, true)}</span>
        </span>
        {customers[0] && (
          <span className="text-muted-foreground">
            Top contributor: <span className="font-semibold text-amber-600">{customers[0].name}</span>
            {' '}({customers[0].revenue_share}% of revenue)
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/60">Click any row to expand deals</span>
      </div>

      {/* Column headers */}
      <div className="mb-1 grid grid-cols-[2rem_1fr_auto_auto_auto_auto_1.5rem] gap-3 px-6 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
        <span className="text-center">#</span>
        <span>Customer · Phone · Location</span>
        <span className="text-right">Revenue / Share</span>
        <span className="text-center">Deals</span>
        <span>Last Close</span>
        <span className="text-center">Products</span>
        <span />
      </div>

      {/* Rows */}
      <div className="-mx-6 divide-y divide-border/20">
        {pageItems.map((c, i) => {
          const globalRank = page * PAGE_SIZE + i
          return (
            <CustomerRow
              key={c.account_id}
              c={c}
              rank={globalRank}
              expanded={expandedId === c.account_id}
              onToggle={() => setExpandedId(expandedId === c.account_id ? null : c.account_id)}
              isInsurance={isInsurance}
            />
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, customers.length)} of {customers.length}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => { setPage(i); setExpandedId(null) }}
                className={cn(
                  'h-7 min-w-7 rounded-md px-2 text-[12px] font-medium transition-colors',
                  i === page ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
