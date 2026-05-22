import { useEffect, useState } from 'react'
import { ExternalLink, Shield, Plane, Loader2, Users, TrendingUp, UserPlus, Crown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
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

interface NonMemberCustomer {
  account_id: string
  name: string
  city: string
  total_spend: number
  deal_count: number
  sf_link: string
}

interface CrossSellData {
  members_no_insurance: CrossSellMember[]
  members_no_travel: CrossSellMember[]
  members_upgrade: CrossSellMember[]
  non_member_customers: NonMemberCustomer[]
  summary: {
    total_active_members: number
    with_insurance: number
    with_travel: number
    basic_tier: number
  }
}

type Panel = 'insurance' | 'travel' | 'upgrade' | 'new-member'

interface CrossSellTabProps {
  agentName: string
}

/* ── Member row ─────────────────────────────────────────────────────────── */

function MemberRow({ m }: { m: CrossSellMember }) {
  const memUpper = (m.membership || '').toUpperCase()
  const tierCls =
    memUpper === 'PREMIER' ? 'bg-amber-500/15 text-amber-600' :
    memUpper === 'PLUS' ? 'bg-blue-500/15 text-blue-600' :
    'bg-secondary text-muted-foreground'
  const sfUrl = m.sf_link || `https://aaawcny.my.salesforce.com/${m.account_id}`

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
      <div className="min-w-0 flex-1">
        <a
          href={sfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] font-medium hover:text-primary hover:underline transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {m.name}
        </a>
        <span className="text-[11px] text-muted-foreground">
          {m.city || '—'}
          {m.tenure_years != null && ` · ${m.tenure_years}yr member`}
        </span>
      </div>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', tierCls)}>
        {m.membership || 'Basic'}
      </span>
      <a
        href={sfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-primary/40 transition-colors hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

/* ── Non-member customer row ─────────────────────────────────────────────── */

function NonMemberRow({ c }: { c: NonMemberCustomer }) {
  const sfUrl = c.sf_link || `https://aaawcny.my.salesforce.com/${c.account_id}`
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
      <div className="min-w-0 flex-1">
        <a
          href={sfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] font-medium hover:text-primary hover:underline transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {c.name}
        </a>
        <span className="text-[11px] text-muted-foreground">
          {c.city || '—'}{c.deal_count > 0 && ` · ${c.deal_count} deal${c.deal_count !== 1 ? 's' : ''}`}
        </span>
      </div>
      <span className="tabular-nums text-[12px] font-semibold text-foreground/80">
        {formatCurrency(c.total_spend, true)}
      </span>
      <a
        href={sfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-primary/40 transition-colors hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

/* ── Panel tab button ────────────────────────────────────────────────────── */

function PanelBtn({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void
  icon: React.ReactNode; label: string; count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
      <span className={cn(
        'ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
        active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-muted-foreground',
      )}>
        {count}
      </span>
    </button>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */

const MAX_DISPLAY = 50

export default function CrossSellTab({ agentName }: CrossSellTabProps) {
  const [data, setData] = useState<CrossSellData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<Panel>('insurance')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAgentCrossSell(agentName)
      .then((res) => { if (!cancelled) setData(res as CrossSellData) })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail ?? 'Failed to load cross-sell data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [agentName])

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
      <span className="text-[12px]">Loading cross-sell data...</span>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">{error}</div>
  )

  if (!data) return null

  const { summary, members_no_insurance, members_no_travel, members_upgrade, non_member_customers } = data

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
        {(summary.basic_tier ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-semibold">{summary.basic_tier}</span>
            <span className="text-muted-foreground">basic tier</span>
          </span>
        )}
      </div>

      {/* Panel toggle */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-0.5 w-fit">
        <PanelBtn active={activePanel === 'insurance'} onClick={() => setActivePanel('insurance')}
          icon={<Shield className="h-3.5 w-3.5" />} label="Needs Insurance" count={members_no_insurance.length} />
        <PanelBtn active={activePanel === 'travel'} onClick={() => setActivePanel('travel')}
          icon={<Plane className="h-3.5 w-3.5" />} label="Needs Travel" count={members_no_travel.length} />
        <PanelBtn active={activePanel === 'upgrade'} onClick={() => setActivePanel('upgrade')}
          icon={<Crown className="h-3.5 w-3.5" />} label="Upgrade Membership" count={members_upgrade.length} />
        <PanelBtn active={activePanel === 'new-member'} onClick={() => setActivePanel('new-member')}
          icon={<UserPlus className="h-3.5 w-3.5" />} label="New Member" count={non_member_customers.length} />
      </div>

      {/* Panels */}
      {activePanel === 'insurance' && (
        <PanelList
          items={members_no_insurance.slice(0, MAX_DISPLAY)}
          total={members_no_insurance.length}
          emptyMsg="All members have insurance"
          renderRow={(m) => <MemberRow key={(m as CrossSellMember).account_id} m={m as CrossSellMember} />}
        />
      )}
      {activePanel === 'travel' && (
        <PanelList
          items={members_no_travel.slice(0, MAX_DISPLAY)}
          total={members_no_travel.length}
          emptyMsg="All members have travel"
          renderRow={(m) => <MemberRow key={(m as CrossSellMember).account_id} m={m as CrossSellMember} />}
        />
      )}
      {activePanel === 'upgrade' && (
        <div>
          <p className="mb-3 text-[12px] text-muted-foreground">
            Basic members — opportunity to upgrade to <span className="font-semibold text-blue-500">Plus</span> or <span className="font-semibold text-amber-500">Premier</span>.
          </p>
          <PanelList
            items={members_upgrade.slice(0, MAX_DISPLAY)}
            total={members_upgrade.length}
            emptyMsg="No Basic-tier members to upgrade"
            renderRow={(m) => <MemberRow key={(m as CrossSellMember).account_id} m={m as CrossSellMember} />}
          />
        </div>
      )}
      {activePanel === 'new-member' && (
        <div>
          <p className="mb-3 text-[12px] text-muted-foreground">
            Customers who bought insurance or travel from this advisor but are <span className="font-semibold">not yet AAA members</span>.
          </p>
          <PanelList
            items={non_member_customers.slice(0, MAX_DISPLAY)}
            total={non_member_customers.length}
            emptyMsg="No non-member customers found"
            renderRow={(c) => <NonMemberRow key={(c as NonMemberCustomer).account_id} c={c as NonMemberCustomer} />}
          />
        </div>
      )}
    </div>
  )
}

/* ── Shared list wrapper ─────────────────────────────────────────────────── */

function PanelList({ items, total, emptyMsg, renderRow }: {
  items: unknown[]; total: number; emptyMsg: string
  renderRow: (item: unknown) => React.ReactNode
}) {
  if (items.length === 0) return (
    <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">{emptyMsg}</div>
  )
  return (
    <>
      <div className="-mx-6 divide-y divide-border/30">
        {items.map(renderRow)}
      </div>
      {total > MAX_DISPLAY && (
        <p className="mt-3 text-right text-[11px] text-muted-foreground">
          Showing {MAX_DISPLAY} of {total}
        </p>
      )}
    </>
  )
}
