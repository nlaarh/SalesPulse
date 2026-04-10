/**
 * CrossSellTab — Per-advisor "Who to Call" list.
 *
 * Shows uninsured travel trips for this advisor's customers,
 * ranked by value × recency.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchAdvisorCrossSell,
  type AdvisorCrossSell,
} from '@/lib/api'
import { Loader2, ShieldAlert, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function daysAgoLabel(d: number) {
  if (d <= 0) return 'Today'
  if (d === 1) return '1 day ago'
  if (d <= 7) return `${d} days ago`
  if (d <= 30) return `${Math.ceil(d / 7)} weeks ago`
  return `${Math.ceil(d / 30)} months ago`
}

interface CrossSellTabProps {
  agentName: string
}

export default function CrossSellTab({ agentName }: CrossSellTabProps) {
  const { period, startDate, endDate } = useSales()
  const navigate = useNavigate()

  const [data, setData] = useState<AdvisorCrossSell | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!agentName) return
    setLoading(true)
    setError('')
    fetchAdvisorCrossSell(agentName, period, startDate, endDate)
      .then(setData)
      .catch(e => setError(e?.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [agentName, period, startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Analyzing cross-sell gaps…</span>
      </div>
    )
  }

  if (error) {
    return <div className="text-center py-10 text-destructive text-sm">{error}</div>
  }

  if (!data || data.opportunities.length === 0) {
    return (
      <div className="text-center py-16">
        <ShieldAlert className="h-10 w-10 mx-auto text-emerald-500 mb-3" />
        <p className="text-foreground font-medium">Great coverage!</p>
        <p className="text-sm text-muted-foreground mt-1">
          All recent trips have matching insurance purchases.
        </p>
      </div>
    )
  }

  const { summary } = data

  return (
    <div className="space-y-4">
      {/* Mini summary */}
      <div className="flex flex-wrap gap-4 px-1">
        <div className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          <span className="text-muted-foreground">Uninsured:</span>
          <span className="font-semibold text-foreground">{summary.total_uninsured} trips</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Value at risk:</span>
          <span className="font-semibold text-foreground">{fmt(summary.value_at_risk)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Coverage:</span>
          <span className="font-semibold text-foreground">{summary.coverage_rate.toFixed(1)}%</span>
        </div>
      </div>

      {/* Opportunities list */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">Customer</th>
              <th className="text-left px-4 py-2.5 font-medium">Trip</th>
              <th className="text-right px-4 py-2.5 font-medium">Value</th>
              <th className="text-center px-4 py-2.5 font-medium">Priority</th>
              <th className="text-right px-4 py-2.5 font-medium">Booked</th>
            </tr>
          </thead>
          <tbody>
            {data.opportunities.map((o, i) => (
              <tr
                key={o.opportunity_id || i}
                className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => o.account_id && navigate(`/customer/${o.account_id}`)}
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-foreground">{o.account_name || '—'}</div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[200px]">
                  {o.trip_name}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtFull(o.amount)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', priorityColor(o.priority))}>
                    {o.priority}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                  {daysAgoLabel(o.days_ago)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div className="text-center pt-2">
        <button
          onClick={() => navigate('/insights')}
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          View all cross-sell insights <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
