/**
 * TopCustomersTab — ranked list of this advisor's highest-spend customers.
 */

import { useEffect, useState } from 'react'
import { ExternalLink, Crown, Shield, Plane, Loader2 } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { fmtDate } from '@/lib/formatters'
import { fetchAgentTopCustomers } from '@/lib/api'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Customer {
  account_id: string
  name: string
  total_spend: number
  deal_count: number
  last_close: string
  membership: string
  member_status: string
  has_insurance: boolean
  has_travel: boolean
  sf_link: string
}

interface TopCustomersTabProps {
  agentName: string
  line: string
  period: number
  startDate?: string | null
  endDate?: string | null
}

/* ── Membership badge ───────────────────────────────────────────────────── */

function MembershipBadge({ tier }: { tier: string }) {
  const upper = (tier || '').toUpperCase()
  const cls =
    upper === 'PREMIER'
      ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
      : upper === 'PLUS'
      ? 'bg-blue-500/15 text-blue-600 border border-blue-500/20'
      : 'bg-secondary text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', cls)}>
      {upper === 'PREMIER' && <Crown className="h-2.5 w-2.5" />}
      {tier || 'Basic'}
    </span>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function TopCustomersTab({
  agentName, line, period, startDate, endDate,
}: TopCustomersTabProps) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAgentTopCustomers(agentName, line, period, startDate, endDate)
      .then((res) => {
        if (cancelled) return
        setCustomers(res.customers ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.response?.data?.detail ?? 'Failed to load top customers')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [agentName, line, period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
        <span className="text-[12px]">Loading top customers...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
        {error}
      </div>
    )
  }

  if (customers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
        No customer data available for this period
      </div>
    )
  }

  return (
    <div>
      {/* Header row */}
      <div className="mb-2 grid grid-cols-[2rem_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <span className="text-center">#</span>
        <span>Customer</span>
        <span className="text-right">Spend</span>
        <span className="text-center">Deals</span>
        <span>Last Close</span>
        <span className="text-center">Products</span>
        <span />
      </div>

      {/* Customer rows */}
      <div className="-mx-6 divide-y divide-border/30">
        {customers.map((c, idx) => (
          <div
            key={c.account_id}
            className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-6 py-2.5 hover:bg-secondary/20 transition-colors"
          >
            {/* Rank */}
            <span className={cn(
              'text-center text-[12px] font-bold tabular-nums',
              idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-700' : 'text-muted-foreground/50',
            )}>
              {idx + 1}
            </span>

            {/* Name + membership tier */}
            <div className="min-w-0">
              <a
                href={c.sf_link || `https://aaawcny.my.salesforce.com/${c.account_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[13px] font-medium hover:text-primary hover:underline transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {c.name}
              </a>
              <MembershipBadge tier={c.membership} />
            </div>

            {/* Total spend */}
            <span className="text-right text-[13px] font-semibold tabular-nums">
              {formatCurrency(c.total_spend, true)}
            </span>

            {/* Deal count */}
            <span className="text-center text-[12px] tabular-nums text-muted-foreground">
              {c.deal_count}
            </span>

            {/* Last close */}
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {fmtDate(c.last_close)}
            </span>

            {/* Product badges */}
            <div className="flex items-center gap-1.5">
              <Shield className={cn('h-3.5 w-3.5', c.has_insurance ? 'text-emerald-500' : 'text-muted-foreground/25')} />
              <Plane className={cn('h-3.5 w-3.5', c.has_travel ? 'text-emerald-500' : 'text-muted-foreground/25')} />
            </div>

            {/* SF link */}
            <a
              href={c.sf_link || `https://aaawcny.my.salesforce.com/${c.account_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary/50 transition-colors hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>

      <p className="mt-3 text-right text-[11px] text-muted-foreground">
        Showing {customers.length} customer{customers.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
