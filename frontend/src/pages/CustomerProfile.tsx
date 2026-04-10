/**
 * CustomerProfile — 360° view of a member.
 * Shows: member card, product radar, last 30 transactions, AI upsell panel.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  ArrowLeft, User, Phone, Mail, MapPin, Shield,
  Car, CreditCard, Loader2,
  AlertCircle, Clock, ExternalLink, HelpCircle, Printer,
} from 'lucide-react'
import axios from 'axios'
import { cn } from '@/lib/utils'
import { fmtDate, fmt$ } from '@/lib/formatters'
import { printFromDom } from '@/lib/printWindow'
import EmailPopover from '@/components/EmailPopover'
import { emailCustomerProfile } from '@/lib/api'
import Product360Visual from '@/components/Product360Visual'
import ActivityTimeline from '@/components/ActivityTimeline'
import UpsellPanel from '@/components/UpsellPanel'

const api = axios.create({ baseURL: '' })
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('si-auth-token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

import type { Transaction, Lead } from '@/components/ActivityTimeline'
import type { Product360 } from '@/components/Product360Visual'

/* ── Types ──────────────────────────────────────────────────────────────── */
interface Account {
  id: string; name: string; email: string | null; phone: string | null
  birthdate: string | null; member_id: string | null
  member_status: string | null; member_status_label: string | null
  member_since: string | null; coverage: string | null
  membership_expiry: string | null; insurance_customer_id: string | null
  insurance_since: string | null; total_premiums: number | null
  region: string | null; mpi: number | null; ltv: string | null
  address: { street: string | null; city: string | null; state: string | null; zip: string | null }
  ers_calls_made: number | null; ers_calls_available: number | null
  sf_url: string | null
}

interface Membership {
  id: string; name: string; level: string | null; member_number: string | null
  status: string | null; purchase_date: string | null; expiry_date: string | null; price: number | null
  sf_url: string | null
}

interface Vehicle { id: string; name: string; status: string | null; vin: string | null; description: string | null }

interface Advisor {
  name: string; deal_count: number; total_revenue: number; last_interaction: string
}

interface Profile {
  account: Account
  memberships: Membership[]
  vehicles: Vehicle[]
  product_360: Product360
  transactions: Transaction[]
  opportunities: Record<string, Transaction[]>
  leads: Lead[]
  top_advisors?: Advisor[]
}

/* ── Product config ─────────────────────────────────────────────────────── */

function StatusBadge({ status, label }: { status: string | null; label: string | null }) {
  const isActive = status === 'A'
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
      isActive ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
               : 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-emerald-500' : 'bg-rose-500')} />
      {label || status || 'Unknown'}
    </span>
  )
}

/* ── LTV Tier badge with popover explanation ────────────────────────────── */
const LTV_TIERS: Record<string, { label: string; color: string }> = {
  A: { label: 'Highest Value',  color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  B: { label: 'High Value',     color: 'text-blue-600   bg-blue-500/10   border-blue-500/20'   },
  C: { label: 'Mid Value',      color: 'text-amber-600  bg-amber-500/10  border-amber-500/20'  },
  D: { label: 'Lower Value',    color: 'text-orange-600 bg-orange-500/10 border-orange-500/20' },
  E: { label: 'Lowest Value',   color: 'text-red-600    bg-red-500/10    border-red-500/20'    },
}

function LtvBadge({ tier }: { tier: string }) {
  const [open, setOpen] = useState(false)
  const base = tier.replace('*N', '')
  const isNew = tier.endsWith('*N')
  const info = LTV_TIERS[base] ?? { label: 'Unknown', color: 'text-muted-foreground bg-muted/30 border-border' }
  return (
    <span className="relative inline-flex items-center gap-1">
      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', info.color)}>
        LTV Tier: {tier}{isNew ? '' : ''}
      </span>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="What is LTV Tier?">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg text-left">
          <button onClick={() => setOpen(false)} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs">✕</button>
          <p className="text-[12px] font-semibold text-foreground mb-1">Lifetime Value (LTV) Tier</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            A letter grade automatically calculated by Salesforce representing this customer's total lifetime value to AAA.
          </p>
          <div className="space-y-1">
            {Object.entries(LTV_TIERS).map(([k, v]) => (
              <div key={k} className={cn('flex items-center gap-2 rounded px-2 py-0.5 text-[11px]', k === base ? 'ring-1 ring-current font-semibold' : '', v.color)}>
                <span className="font-bold w-4">{k}</span>
                <span>{v.label}</span>
                {k === base && isNew && <span className="ml-auto opacity-70">*N = New segment</span>}
                {k === base && !isNew && <span className="ml-auto">← This customer</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2">Source: Salesforce Account.LTV__c</p>
        </div>
      )}
    </span>
  )
}



/* ── Main page ──────────────────────────────────────────────────────────── */
export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.get(`/api/customers/${id}`)
      .then(r => {
        if (r.data.error) setError(r.data.error)
        else setProfile(r.data)
      })
      .catch(() => setError('Failed to load customer profile'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading profile…
    </div>
  )

  if (error || !profile) return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <p className="text-rose-500">{error || 'Customer not found'}</p>
    </div>
  )

  const { account: acct, memberships, vehicles, product_360, transactions, leads = [], top_advisors = [] } = profile
  const activeMembership = memberships.find(m => m.status === 'A') || memberships[0]

  return (
    <div id="customer-print-root" className="mx-auto max-w-5xl space-y-5 px-4 py-6 print:px-0 print:py-0 print:space-y-4">
      {/* Back + actions row */}
      <div data-no-print className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => printFromDom('customer-print-root', `Customer 360 — ${acct.name}`)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
            <Printer className="h-3.5 w-3.5" /> PDF / Print
          </button>
          <EmailPopover
            description={`Customer 360: ${acct.name}`}
            defaultEmail={user?.email ?? ''}
            onSend={async (to) => { await emailCustomerProfile(id!, to) }}
          />
        </div>
      </div>

      {/* Member header card */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-foreground">{acct.name}</h1>
              <StatusBadge status={acct.member_status} label={acct.member_status_label} />
              {acct.sf_url && (
                <a href={acct.sf_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-500 hover:bg-blue-500/20 transition-colors"
                  title="Open in Salesforce">
                  <ExternalLink className="h-3 w-3" /> View in SF
                </a>
              )}
              {acct.ltv && <LtvBadge tier={acct.ltv} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {acct.member_id && (
                <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> #{acct.member_id}</span>
              )}
              {acct.email && (
                <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {acct.email}</span>
              )}
              {acct.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {acct.phone}</span>
              )}
              {(acct.address.city || acct.address.state) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[acct.address.city, acct.address.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
          {/* Key stats */}
          <div className="flex gap-4 shrink-0">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Since</p>
              <p className="text-[14px] font-bold text-foreground">{acct.member_since ? new Date(acct.member_since).getFullYear() : '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">MPI</p>
              <p className="text-[14px] font-bold text-foreground">{acct.mpi ?? '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Region</p>
              <p className="text-[14px] font-bold text-foreground">{acct.region || '—'}</p>
            </div>
          </div>
        </div>

        {/* Membership + vehicles strip */}
        {(activeMembership || vehicles.length > 0) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-3">
            {activeMembership && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                <CreditCard className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-[11px] font-bold text-blue-600">{activeMembership.level || 'Membership'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Expires {fmtDate(activeMembership.expiry_date)}
                  </p>
                </div>
              </div>
            )}
            {acct.insurance_customer_id && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-[11px] font-bold text-emerald-600">Insurance</p>
                  <p className="text-[10px] text-muted-foreground">
                    {acct.total_premiums ? fmt$(acct.total_premiums) + '/yr' : `#${acct.insurance_customer_id}`}
                  </p>
                </div>
              </div>
            )}
            {acct.ers_calls_made != null && (
              <div className="flex items-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2">
                <AlertCircle className="h-4 w-4 text-cyan-500" />
                <div>
                  <p className="text-[11px] font-bold text-cyan-600">ERS Calls</p>
                  <p className="text-[10px] text-muted-foreground">
                    {acct.ers_calls_made} used / {acct.ers_calls_available ?? '?'} avail
                  </p>
                </div>
              </div>
            )}
            {vehicles.slice(0, 2).map(v => (
              <div key={v.id} className="flex items-center gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
                <Car className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-[11px] font-bold text-orange-600">{v.name}</p>
                  {v.vin && <p className="text-[10px] text-muted-foreground font-mono">{v.vin.slice(-8)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product 360 + AI side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Product360Visual p360={product_360} />
        <div className="space-y-3">
          {/* Membership history */}
          {memberships.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-3">Membership History</p>
              <div className="space-y-2">
                {memberships.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full',
                        m.status === 'A' ? 'bg-emerald-500' : m.status === 'L' ? 'bg-amber-500' : 'bg-rose-500')} />
                      {m.sf_url ? (
                        <a href={m.sf_url} target="_blank" rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline flex items-center gap-1">
                          {m.level || 'Basic'} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-medium text-foreground">{m.level || 'Basic'}</span>
                      )}
                      <span className="text-muted-foreground/50 font-mono text-[10px]">#{m.member_number}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      {m.price && <span className="font-medium text-foreground">{fmt$(m.price)}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDate(m.expiry_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Total Travel</p>
              <p className="text-[18px] font-bold text-foreground">
                {fmt$(profile.opportunities['Travel']?.reduce((s, o) => s + (o.amount || 0), 0) ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">{profile.opportunities['Travel']?.length ?? 0} bookings</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Total Insurance</p>
              <p className="text-[18px] font-bold text-foreground">
                {fmt$(profile.opportunities['Insurance']?.reduce((s, o) => s + (o.amount || 0), 0) ?? null)}
              </p>
              <p className="text-[11px] text-muted-foreground">{profile.opportunities['Insurance']?.length ?? 0} policies</p>
            </div>
          </div>
        </div>
      </div>

      {/* Serving Advisors */}
      {top_advisors.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-3">Serving Advisors</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {top_advisors.map((adv, i) => (
              <div key={adv.name} className={cn(
                'flex items-center gap-3 rounded-lg border p-3',
                i === 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20',
              )}>
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}>
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{adv.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {adv.deal_count} deal{adv.deal_count !== 1 ? 's' : ''} · {fmt$(adv.total_revenue)} · Last: {fmtDate(adv.last_interaction)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions */}
      <ActivityTimeline transactions={transactions} leads={leads} />

      {/* AI Upsell */}
      {id && <UpsellPanel accountId={id} />}
    </div>
  )
}
