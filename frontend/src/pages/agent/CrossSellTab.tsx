import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Shield, Plane, Loader2, Users, TrendingUp, UserPlus, Crown, Phone } from 'lucide-react'
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
type MemberSort = 'name' | 'city' | 'membership' | 'tenure_years'
type NonMemberSort = 'name' | 'city' | 'deal_count' | 'total_spend'

interface CrossSellTabProps {
  agentName: string
}

/* ── Sort header ────────────────────────────────────────────────────────── */

function Th<T extends string>({
  field, label, sortField, sortAsc, onSort, right = false,
}: {
  field: T; label: string; sortField: T; sortAsc: boolean
  onSort: (f: T) => void; right?: boolean
}) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        'cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 hover:text-muted-foreground transition-colors',
        right ? 'text-right' : 'text-left',
      )}
    >
      {label}{' '}
      <span className="opacity-60 text-[9px]">{active ? (sortAsc ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}

/* ── Tier badge ─────────────────────────────────────────────────────────── */

function TierBadge({ tier }: { tier: string }) {
  const t = (tier || '').toUpperCase()
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', {
      'bg-amber-500/15 text-amber-600': t === 'PREMIER',
      'bg-blue-500/15 text-blue-600': t === 'PLUS',
      'bg-secondary text-muted-foreground': t !== 'PREMIER' && t !== 'PLUS',
    })}>
      {tier || 'Basic'}
    </span>
  )
}

/* ── Member sortable table ──────────────────────────────────────────────── */

function MemberTable({ members, emptyMsg }: { members: CrossSellMember[]; emptyMsg: string }) {
  const [sortField, setSortField] = useState<MemberSort>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [search, setSearch] = useState('')

  const handleSort = (f: MemberSort) => {
    if (sortField === f) { setSortAsc(a => !a); return }
    setSortField(f)
    setSortAsc(true)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.city || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q),
    )
  }, [members, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      let va: any = sortField === 'tenure_years' ? (a.tenure_years ?? -1) : (a[sortField] ?? '')
      let vb: any = sortField === 'tenure_years' ? (b.tenure_years ?? -1) : (b[sortField] ?? '')
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortField, sortAsc])

  if (members.length === 0) {
    return <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">{emptyMsg}</div>
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-secondary/20">
        <span className="text-[11px] text-muted-foreground">{filtered.length} customers</span>
        <input
          type="text"
          placeholder="Search name, city, phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-2.5 py-1 text-[12px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 w-48"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/10">
              <Th field="name" label="Customer" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
              <Th field="city" label="City" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60 text-left whitespace-nowrap">Phone</th>
              <Th field="membership" label="Tier" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
              <Th field="tenure_years" label="Tenure" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} right />
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const sfUrl = m.sf_link || `https://aaawcny.my.salesforce.com/${m.account_id}`
              return (
                <tr key={m.account_id} className={cn(
                  'border-b border-border/30 transition-colors hover:bg-secondary/20',
                  i % 2 === 0 ? '' : 'bg-muted/5',
                )}>
                  <td className="px-3 py-2.5 max-w-[180px]">
                    <a href={sfUrl} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-[12px] font-medium hover:text-primary transition-colors">
                      {m.name}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{m.city || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {m.phone ? (
                      <a href={`tel:${m.phone}`}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
                        <Phone className="h-3 w-3" />{m.phone}
                      </a>
                    ) : <span className="text-muted-foreground/40 text-[11px]">—</span>}
                  </td>
                  <td className="px-3 py-2.5"><TierBadge tier={m.membership} /></td>
                  <td className="px-3 py-2.5 text-right text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {m.tenure_years != null ? `${m.tenure_years}yr` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <a href={sfUrl} target="_blank" rel="noopener noreferrer"
                      className="text-primary/40 hover:text-primary transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && search && (
        <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No results for "{search}"</div>
      )}
    </div>
  )
}

/* ── Non-member sortable table ──────────────────────────────────────────── */

function NonMemberTable({ customers }: { customers: NonMemberCustomer[] }) {
  const [sortField, setSortField] = useState<NonMemberSort>('total_spend')
  const [sortAsc, setSortAsc] = useState(false)
  const [search, setSearch] = useState('')

  const handleSort = (f: NonMemberSort) => {
    if (sortField === f) { setSortAsc(a => !a); return }
    setSortField(f)
    setSortAsc(f === 'name' || f === 'city')
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q),
    )
  }, [customers, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    list.sort((a, b) => {
      const va: any = a[sortField] ?? ''
      const vb: any = b[sortField] ?? ''
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return list
  }, [filtered, sortField, sortAsc])

  if (customers.length === 0) {
    return <div className="flex items-center justify-center py-10 text-[12px] text-muted-foreground">No non-member customers found</div>
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-secondary/20">
        <span className="text-[11px] text-muted-foreground">{filtered.length} customers</span>
        <input
          type="text"
          placeholder="Search name or city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-2.5 py-1 text-[12px] rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 w-48"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/10">
              <Th field="name" label="Customer" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
              <Th field="city" label="City" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
              <Th field="deal_count" label="Deals" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} right />
              <Th field="total_spend" label="Total Spend" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} right />
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const sfUrl = c.sf_link || `https://aaawcny.my.salesforce.com/${c.account_id}`
              return (
                <tr key={c.account_id} className={cn(
                  'border-b border-border/30 transition-colors hover:bg-secondary/20',
                  i % 2 === 0 ? '' : 'bg-muted/5',
                )}>
                  <td className="px-3 py-2.5 max-w-[180px]">
                    <a href={sfUrl} target="_blank" rel="noopener noreferrer"
                      className="block truncate text-[12px] font-medium hover:text-primary transition-colors">
                      {c.name}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">{c.city || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">{c.deal_count}</td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-foreground/80">
                    {formatCurrency(c.total_spend, true)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <a href={sfUrl} target="_blank" rel="noopener noreferrer"
                      className="text-primary/40 hover:text-primary transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && search && (
        <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No results for "{search}"</div>
      )}
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
        <MemberTable members={members_no_insurance} emptyMsg="All members have insurance" />
      )}
      {activePanel === 'travel' && (
        <MemberTable members={members_no_travel} emptyMsg="All members have travel" />
      )}
      {activePanel === 'upgrade' && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Basic members — opportunity to upgrade to <span className="font-semibold text-blue-500">Plus</span> or <span className="font-semibold text-amber-500">Premier</span>.
          </p>
          <MemberTable members={members_upgrade} emptyMsg="No Basic-tier members to upgrade" />
        </div>
      )}
      {activePanel === 'new-member' && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">
            Customers who bought insurance or travel from this advisor but are <span className="font-semibold">not yet AAA members</span>.
          </p>
          <NonMemberTable customers={non_member_customers} />
        </div>
      )}
    </div>
  )
}
