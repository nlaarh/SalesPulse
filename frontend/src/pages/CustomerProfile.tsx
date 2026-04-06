/**
 * CustomerProfile — 360° view of a member.
 * Shows: member card, product radar, last 30 transactions, AI upsell panel.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, User, Phone, Mail, MapPin, Shield,
  Car, CreditCard, Plane, Heart, Loader2, Sparkles,
  TrendingUp, AlertCircle, CheckCircle2, Clock, ExternalLink, HelpCircle, Printer,
} from 'lucide-react'
import axios from 'axios'
import { cn } from '@/lib/utils'
import Markdown from '@/components/Markdown'
import EmailPopover from '@/components/EmailPopover'
import { emailCustomerProfile } from '@/lib/api'

const api = axios.create({ baseURL: '' })
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('si-auth-token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

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
}

interface Vehicle { id: string; name: string; status: string | null; vin: string | null; description: string | null }

interface Transaction {
  id: string; name: string; stage: string; amount: number | null
  commission: number | null; close_date: string | null; created_date: string
  record_type: string; destination: string | null; trip_id: string | null; owner: string | null
  sf_url: string | null
}

interface Product360 {
  membership: boolean; travel: boolean; insurance: boolean; medicare: boolean
  membership_services: boolean; financial: boolean; driver: boolean; ers: boolean
}

interface Profile {
  account: Account
  memberships: Membership[]
  vehicles: Vehicle[]
  product_360: Product360
  transactions: Transaction[]
  opportunities: Record<string, Transaction[]>
}

/* ── Product config ─────────────────────────────────────────────────────── */
const PRODUCTS = [
  { key: 'membership',          label: 'Membership',    icon: CreditCard, color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  { key: 'travel',              label: 'Travel',        icon: Plane,      color: 'text-indigo-500',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30' },
  { key: 'insurance',           label: 'Insurance',     icon: Shield,     color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'medicare',            label: 'Medicare',      icon: Heart,      color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  { key: 'membership_services', label: 'Mbr Services',  icon: User,       color: 'text-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30' },
  { key: 'financial',           label: 'Financial',     icon: TrendingUp, color: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  { key: 'driver',              label: 'Driver Pgm',    icon: Car,        color: 'text-orange-500',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  { key: 'ers',                 label: 'ERS',           icon: AlertCircle,color: 'text-cyan-500',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30' },
]

const STAGE_COLORS: Record<string, string> = {
  'Closed Won': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Invoice':    'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Closed Lost':'bg-rose-500/10 text-rose-500 border-rose-500/20',
  'Dead':       'bg-rose-500/10 text-rose-500 border-rose-500/20',
}

const RT_COLORS: Record<string, string> = {
  'Travel':              'bg-indigo-500/10 text-indigo-500',
  'Insurance':           'bg-emerald-500/10 text-emerald-600',
  'Medicare':            'bg-rose-500/10 text-rose-500',
  'Membership Services': 'bg-violet-500/10 text-violet-500',
  'Financial Services':  'bg-amber-500/10 text-amber-600',
  'Driver Programs':     'bg-orange-500/10 text-orange-500',
}

function fmt$(n: number | null) { return n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—' }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' }

/* ── Member status badge ────────────────────────────────────────────────── */
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


function Product360Visual({ p360 }: { p360: Product360 }) {
  const total = PRODUCTS.length
  const owned = PRODUCTS.filter(p => p360[p.key as keyof Product360]).length

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Product 360</p>
        <span className="text-[12px] font-semibold text-primary">{owned}/{total} products</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PRODUCTS.map(p => {
          const has = p360[p.key as keyof Product360]
          const Icon = p.icon
          return (
            <div key={p.key}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                has ? `${p.bg} ${p.border}` : 'bg-muted/20 border-border opacity-40',
              )}>
              <div className={cn('rounded-lg p-1.5', has ? p.bg : 'bg-muted/30')}>
                <Icon className={cn('h-4 w-4', has ? p.color : 'text-muted-foreground/40')} />
              </div>
              <span className={cn('text-[10px] font-medium text-center leading-tight',
                has ? 'text-foreground' : 'text-muted-foreground/40')}>
                {p.label}
              </span>
              {has
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                : <span className="h-3 w-3 rounded-full border border-dashed border-muted-foreground/30" />}
            </div>
          )
        })}
      </div>
      {/* Coverage bar */}
      <div className="mt-4">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-muted-foreground/50">Product Coverage</span>
          <span className="text-[10px] text-muted-foreground/50">{Math.round((owned / total) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(owned / total) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

/* ── Transactions table ─────────────────────────────────────────────────── */
function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Last 30 Transactions</p>
        <span className="text-[11px] text-muted-foreground/50">{transactions.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Date</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Type</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Name</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Amount</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Stage</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 hidden sm:table-cell">Advisor</th>
              <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">SF</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground/50">No transactions found</td></tr>
            )}
            {transactions.map((t, i) => (
              <tr key={t.id} className={cn(
                'border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors',
                i % 2 === 0 ? 'bg-background/60' : 'bg-muted/10',
              )}>
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{t.created_date || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', RT_COLORS[t.record_type] ?? 'bg-muted/30 text-muted-foreground')}>
                    {t.record_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 max-w-[200px]">
                  <Link to={`/opportunity/${t.id}`} className="text-foreground hover:text-primary transition-colors truncate block">
                    {t.destination ? `${t.destination}` : t.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-foreground whitespace-nowrap">{fmt$(t.amount)}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    STAGE_COLORS[t.stage] ?? 'bg-muted/20 text-muted-foreground border-border')}>
                    {t.stage}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{t.owner || '—'}</td>
                <td className="px-2 py-2.5 text-center">
                  {t.sf_url && (
                    <a href={t.sf_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                      title="Open in Salesforce">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── AI Upsell panel ────────────────────────────────────────────────────── */
function UpsellPanel({ accountId }: { accountId: string }) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.post(`/api/customers/${accountId}/upsell`)
      if (data.error) { setError(data.error); return }
      setAnalysis(data.analysis)
      setGenerated(true)
    } catch {
      setError('Failed to generate upsell analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">AI Upsell Analysis</p>
        </div>
        {!generated && (
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        )}
        {generated && (
          <button onClick={generate} disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {!generated && !loading && (
          <p className="text-[13px] text-muted-foreground/60 text-center py-4">
            Click <strong>Analyze</strong> to get AI-powered upsell recommendations for this member.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Analyzing member profile…</span>
          </div>
        )}
        {error && <p className="text-[13px] text-rose-500">{error}</p>}
        {analysis && <Markdown>{analysis}</Markdown>}
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────── */
/* ── Email modal ─────────────────────────────────────────────────────────── */
export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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

  const { account: acct, memberships, vehicles, product_360, transactions } = profile
  const activeMembership = memberships.find(m => m.status === 'A') || memberships[0]

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 print:px-0 print:py-0 print:space-y-4">
      {/* Back + actions row */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
            <Printer className="h-3.5 w-3.5" /> PDF / Print
          </button>
          <EmailPopover
            description={`Customer 360: ${acct.name}`}
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
                      <span className="font-medium text-foreground">{m.level || 'Basic'}</span>
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

      {/* Transactions */}
      <TransactionsTable transactions={transactions} />

      {/* AI Upsell */}
      {id && <UpsellPanel accountId={id} />}
    </div>
  )
}
