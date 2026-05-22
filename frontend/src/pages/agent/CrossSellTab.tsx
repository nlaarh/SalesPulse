/**
 * CrossSellTab — Agent-specific cross-sell opportunities.
 *
 * Shows members associated with this advisor who have product gaps:
 *   • Needs Insurance: has travel but no insurance
 *   • Needs Travel: has insurance but no travel
 */

import { useEffect, useState } from 'react'
import { ExternalLink, Shield, Plane, Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchAgentCrossSell } from '@/lib/api'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface CrossSellMember {
  account_id: string
  name: string
  email: string
  phone: string
  city: string
  membership: string
  tenure_years: number | null
  has_insurance: boolean
  has_travel: boolean
  sf_link: string
}

interface CrossSellData {
  members_no_insurance: CrossSellMember[]
  members_no_travel: CrossSellMember[]
  summary: {
    total_active_members: number
    with_insurance: number
    with_travel: number
  }
}

interface CrossSellTabProps {
  agentName: string
}

/* ── Member row ─────────────────────────────────────────────────────────── */

function MemberRow({ m }: { m: CrossSellMember }) {
  const memUpper = (m.membership || '').toUpperCase()
  const tierCls =
    memUpper === 'PREMIER'
      ? 'bg-amber-500/15 text-amber-600'
      : memUpper === 'PLUS'
      ? 'bg-blue-500/15 text-blue-600'
      : 'bg-secondary text-muted-foreground'

  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/20 transition-colors">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{m.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {m.city || '—'}
          {m.tenure_years != null && ` · ${m.tenure_years}yr member`}
        </span>
      </div>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', tierCls)}>
        {m.membership || 'Basic'}
      </span>
      <a
        href={m.sf_link || `https://aaawcny.my.salesforce.com/${m.account_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-primary/50 transition-colors hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */

const MAX_DISPLAY = 50

export default function CrossSellTab({ agentName }: CrossSellTabProps) {
  const [data, setData] = useState<CrossSellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<'insurance' | 'travel'>('insurance')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAgentCrossSell(agentName)
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.response?.data?.detail ?? 'Failed to load cross-sell data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [agentName])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
        <span className="text-[12px]">Loading cross-sell data...</span>
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

  if (!data) return null

  const { summary, members_no_insurance, members_no_travel } = data
  const noIns = members_no_insurance.slice(0, MAX_DISPLAY)
  const noTrv = members_no_travel.slice(0, MAX_DISPLAY)

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold">{summary.total_active_members.toLocaleString()}</span>
          <span className="text-muted-foreground">active members</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-semibold">{summary.with_insurance.toLocaleString()}</span>
          <span className="text-muted-foreground">have insurance</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
          <Plane className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-semibold">{summary.with_travel.toLocaleString()}</span>
          <span className="text-muted-foreground">have travel</span>
        </span>
      </div>

      {/* Panel toggle */}
      <div className="flex gap-1 rounded-lg border border-border bg-background p-0.5 w-fit">
        <button
          onClick={() => setActivePanel('insurance')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
            activePanel === 'insurance'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Shield className="h-3.5 w-3.5" />
          Needs Insurance
          <span className={cn(
            'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
            activePanel === 'insurance' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary',
          )}>
            {members_no_insurance.length}
          </span>
        </button>
        <button
          onClick={() => setActivePanel('travel')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
            activePanel === 'travel'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Plane className="h-3.5 w-3.5" />
          Needs Travel
          <span className={cn(
            'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
            activePanel === 'travel' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary',
          )}>
            {members_no_travel.length}
          </span>
        </button>
      </div>

      {/* Member list */}
      {activePanel === 'insurance' && (
        <div>
          {noIns.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">
              No members need insurance follow-up
            </div>
          ) : (
            <>
              <div className="-mx-6 divide-y divide-border/30">
                {noIns.map((m) => <MemberRow key={m.account_id} m={m} />)}
              </div>
              {members_no_insurance.length > MAX_DISPLAY && (
                <p className="mt-3 text-right text-[11px] text-muted-foreground">
                  Showing {MAX_DISPLAY} of {members_no_insurance.length}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {activePanel === 'travel' && (
        <div>
          {noTrv.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">
              No members need travel follow-up
            </div>
          ) : (
            <>
              <div className="-mx-6 divide-y divide-border/30">
                {noTrv.map((m) => <MemberRow key={m.account_id} m={m} />)}
              </div>
              {members_no_travel.length > MAX_DISPLAY && (
                <p className="mt-3 text-right text-[11px] text-muted-foreground">
                  Showing {MAX_DISPLAY} of {members_no_travel.length}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
