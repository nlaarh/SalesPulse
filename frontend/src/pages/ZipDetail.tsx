/**
 * ZipDetail — Dedicated drill-down page for a single zip code.
 * Shows zip metrics + insurance/travel customer tables with Salesforce links.
 * Navigate back to /territory with browser back or explicit button.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  fetchTerritoryMapData, fetchZipCustomers, fetchZipCensus, fetchZipInsights,
  type TerritoryZip, type ZipCustomer, type ZipCustomersResponse, type ZipCensusData,
  type ZipInsightsResponse,
} from '@/lib/api'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Shield, Plane, Users, ExternalLink,
  Loader2, TrendingUp, MapPin, Home, Car, GraduationCap, BarChart3,
  Sparkles,
} from 'lucide-react'

const fmt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1)}%`
const fmtCurrency = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `$${Math.round(n)}`

export default function ZipDetail() {
  const { zip: zipCode } = useParams<{ zip: string }>()
  const navigate = useNavigate()
  const { period, startDate, endDate } = useSales()

  const [activeTab, setActiveTab] = useState<'insurance' | 'travel' | 'ai'>('insurance')
  const [insData, setInsData] = useState<ZipCustomersResponse | null>(null)
  const [travelData, setTravelData] = useState<ZipCustomersResponse | null>(null)
  const [loadingIns, setLoadingIns] = useState(false)
  const [loadingTravel, setLoadingTravel] = useState(false)

  // Get zip metadata from territory data
  const { data: territoryData } = useQuery({
    queryKey: ['territory-map', period, startDate, endDate],
    queryFn: () => fetchTerritoryMapData(period, startDate, endDate),
    staleTime: 5 * 60_000,
  })

  const zipData: TerritoryZip | undefined = territoryData?.zips.find(
    (z) => z.zip === zipCode
  )

  // Load insurance customers
  useEffect(() => {
    if (!zipCode) return
    setLoadingIns(true)
    fetchZipCustomers(zipCode, 'insurance', period, startDate, endDate)
      .then(setInsData)
      .catch(() => setInsData(null))
      .finally(() => setLoadingIns(false))
  }, [zipCode, period, startDate, endDate])

  // Load travel customers
  useEffect(() => {
    if (!zipCode) return
    setLoadingTravel(true)
    fetchZipCustomers(zipCode, 'travel', period, startDate, endDate)
      .then(setTravelData)
      .catch(() => setTravelData(null))
      .finally(() => setLoadingTravel(false))
  }, [zipCode, period, startDate, endDate])

  // Load census/segment data
  const { data: census } = useQuery<ZipCensusData>({
    queryKey: ['zip-census', zipCode],
    queryFn: () => fetchZipCensus(zipCode!),
    enabled: !!zipCode,
    staleTime: Infinity,
  })

  // Load AI insights (lazy — only when AI tab is active)
  const [aiData, setAiData] = useState<ZipInsightsResponse | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiFetched, setAiFetched] = useState(false)

  useEffect(() => {
    if (activeTab !== 'ai' || !zipCode || aiFetched) return
    setLoadingAi(true)
    fetchZipInsights(zipCode, period, startDate, endDate)
      .then((d) => { setAiData(d); setAiFetched(true) })
      .catch(() => { setAiData(null); setAiFetched(true) })
      .finally(() => setLoadingAi(false))
  }, [activeTab, zipCode, period, startDate, endDate, aiFetched])

  const sfBaseUrl = insData?.sf_base_url || travelData?.sf_base_url || ''
  const currentData = activeTab === 'insurance' ? insData : travelData
  const loading = activeTab === 'insurance' ? loadingIns : loadingTravel
  const customers = currentData?.customers || []

  const year = new Date().getFullYear()

  if (!zipCode) return null

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/territory')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Territory
        </button>
      </div>

      {/* Zip info header */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-transparent to-transparent border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <MapPin className="w-5 h-5 text-primary" />
            <span className="text-2xl font-black font-mono tracking-tight">{zipCode}</span>
            {zipData?.city && <span className="text-lg font-semibold text-foreground/70">{zipData.city}</span>}
            {zipData?.region && (
              <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">{zipData.region}</span>
            )}
            {zipData?.county_name && (
              <span className="text-xs text-muted-foreground">{zipData.county_name} County</span>
            )}
          </div>
          {zipData && (
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span><Users className="w-3 h-3 inline mr-1" />{fmt(zipData.members)} members</span>
              <span><Shield className="w-3 h-3 inline mr-1" />{fmt(zipData.ins_customers_cy)} insurance</span>
              <span><Plane className="w-3 h-3 inline mr-1" />{fmt(zipData.travel_customers_3yr)} travel (3yr)</span>
              {zipData.ins_penetration > 0 && (
                <span>Ins. penetration: <b className="text-foreground">{fmtPct(zipData.ins_penetration)}</b></span>
              )}
              {zipData.travel_penetration > 0 && (
                <span>Travel penetration: <b className="text-foreground">{fmtPct(zipData.travel_penetration)}</b></span>
              )}
            </div>
          )}
        </div>

        {/* Metrics row */}
        {zipData && (
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <Metric label="Population" value={fmt(zipData.population)} />
            <Metric label="Members" value={fmt(zipData.members)} />
            <Metric label={`Ins Revenue ${year}`} value={fmtCurrency(zipData.ins_rev_cy)} color="text-blue-600" />
            <Metric label={`Travel Revenue ${year}`} value={fmtCurrency(zipData.travel_rev_cy)} color="text-emerald-600" />
            <Metric label="Med. Income" value={zipData.median_income > 0 ? fmtCurrency(zipData.median_income) : '—'} />
            <Metric label="Med. Age" value={zipData.median_age > 0 ? `${zipData.median_age} yrs` : '—'} />
          </div>
        )}
      </div>

      {/* Census & Segment Data */}
      {census?.found && <CensusSection census={census} />}

      {/* Tab buttons */}
      <div className="flex gap-2">
        <TabButton
          active={activeTab === 'insurance'}
          onClick={() => setActiveTab('insurance')}
          icon={<Shield className="w-3.5 h-3.5" />}
          label="Insurance Customers"
          count={insData?.count}
          color="blue"
        />
        <TabButton
          active={activeTab === 'travel'}
          onClick={() => setActiveTab('travel')}
          icon={<Plane className="w-3.5 h-3.5" />}
          label="Travel Customers"
          count={travelData?.count}
          color="emerald"
        />
        <TabButton
          active={activeTab === 'ai'}
          onClick={() => setActiveTab('ai')}
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label="AI Insights"
          color="purple"
        />
      </div>

      {/* Customer table (insurance/travel) */}
      {(activeTab === 'insurance' || activeTab === 'travel') && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading {activeTab} customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No {activeTab} customers found in {zipCode}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Member ID</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Plan</th>
                    {activeTab === 'insurance' && (
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Insurance ID</th>
                    )}
                    {activeTab === 'travel' && (
                      <>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Trips</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Last Trip</th>
                      </>
                    )}
                    <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-10">SF</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <CustomerRow
                      key={c.id || i}
                      customer={c}
                      type={activeTab as 'insurance' | 'travel'}
                      sfBaseUrl={sfBaseUrl}
                    />
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-t border-border bg-muted/20 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Showing {customers.length} of {currentData?.count ?? 0} {activeTab} customers in {zipCode}
                {sfBaseUrl && (
                  <span className="ml-auto flex items-center gap-1 text-primary">
                    <ExternalLink className="w-3 h-3" /> Click icon to open in Salesforce
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Insights tab */}
      {activeTab === 'ai' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-gradient-to-r from-purple-500/5 via-transparent to-transparent">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-300">
              <Sparkles className="w-4 h-4" />
              AI Executive Brief — {zipCode}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Strategic growth analysis powered by AI. Based on census demographics + Salesforce performance data.
            </p>
          </div>
          <div className="p-5">
            {loadingAi ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                <span>Analyzing market opportunity…</span>
                <span className="text-[11px]">Combining census data, customer metrics, and growth potential</span>
              </div>
            ) : aiData?.error ? (
              <div className="text-center py-12 text-sm text-red-500">
                {aiData.error === 'AI not configured' 
                  ? 'AI is not configured. Please set your OpenAI API key in Settings.'
                  : `Error: ${aiData.error}`}
              </div>
            ) : aiData?.insights ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownContent content={aiData.insights} />
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No insights available. Click this tab to generate analysis.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={cn('text-sm font-bold tabular-nums', color ?? 'text-foreground')}>{value}</span>
    </div>
  )
}

function TabButton({
  active, onClick, icon, label, count, color,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode
  label: string; count?: number; color: 'blue' | 'emerald' | 'purple'
}) {
  // Active state uses a soft gradient + dark text + ring for emphasis.
  // Avoids solid filled buttons while keeping the label legible.
  const colors = {
    blue: {
      active: 'bg-gradient-to-br from-blue-50 to-blue-100/70 dark:from-blue-900/40 dark:to-blue-900/10 border-blue-400/70 dark:border-blue-500/60 text-blue-900 dark:text-blue-50 ring-1 ring-blue-300/60 dark:ring-blue-700/50 shadow-sm',
      idle: 'border-border text-foreground hover:bg-blue-50/60 dark:hover:bg-blue-900/20 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300',
      badgeActive: 'bg-blue-600 text-white dark:bg-blue-400 dark:text-blue-950',
      badgeIdle: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
    emerald: {
      active: 'bg-gradient-to-br from-emerald-50 to-emerald-100/70 dark:from-emerald-900/40 dark:to-emerald-900/10 border-emerald-400/70 dark:border-emerald-500/60 text-emerald-900 dark:text-emerald-50 ring-1 ring-emerald-300/60 dark:ring-emerald-700/50 shadow-sm',
      idle: 'border-border text-foreground hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-300',
      badgeActive: 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950',
      badgeIdle: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    purple: {
      active: 'bg-gradient-to-br from-purple-50 to-purple-100/70 dark:from-purple-900/40 dark:to-purple-900/10 border-purple-400/70 dark:border-purple-500/60 text-purple-900 dark:text-purple-50 ring-1 ring-purple-300/60 dark:ring-purple-700/50 shadow-sm',
      idle: 'border-border text-foreground hover:bg-purple-50/60 dark:hover:bg-purple-900/20 hover:border-purple-300 hover:text-purple-700 dark:hover:text-purple-300',
      badgeActive: 'bg-purple-600 text-white dark:bg-purple-400 dark:text-purple-950',
      badgeIdle: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    },
  }
  const base = colors[color]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-xs rounded-lg border transition-all duration-150',
        active ? cn(base.active, 'font-semibold') : cn(base.idle, 'font-medium')
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={cn(
          'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums',
          active ? base.badgeActive : base.badgeIdle,
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

function CustomerRow({
  customer: c, type, sfBaseUrl,
}: {
  customer: ZipCustomer; type: 'insurance' | 'travel'; sfBaseUrl: string
}) {
  const sfLink = sfBaseUrl && c.id ? `${sfBaseUrl}/${c.id}` : ''

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 group">
      <td className="px-4 py-2.5 font-medium">{c.name}</td>
      <td className="px-4 py-2.5 text-muted-foreground">{c.email || '—'}</td>
      <td className="px-4 py-2.5 font-mono text-muted-foreground">{c.member_id || '—'}</td>
      <td className="px-4 py-2.5">{c.plan || '—'}</td>
      {type === 'insurance' && (
        <td className="px-4 py-2.5 font-mono">{c.insurance_id || '—'}</td>
      )}
      {type === 'travel' && (
        <>
          <td className="px-4 py-2.5 text-right font-medium text-emerald-600">
            {fmtCurrency(c.total_rev || 0)}
          </td>
          <td className="px-4 py-2.5 text-right">{c.trip_count || 0}</td>
          <td className="px-4 py-2.5 text-muted-foreground">{c.last_trip || '—'}</td>
        </>
      )}
      <td className="px-3 py-2.5 text-center">
        {sfLink ? (
          <a
            href={sfLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-primary/10 text-primary opacity-60 group-hover:opacity-100 transition-opacity"
            title="Open in Salesforce"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </td>
    </tr>
  )
}

function CensusSection({ census }: { census: ZipCensusData }) {
  const totalAdults = census.adults_18plus || 1
  const ageGroups = [
    { label: '16-18', value: census.age_16_18 || 0, color: 'bg-blue-400' },
    { label: '18-24', value: census.age_18_24 || 0, color: 'bg-blue-500' },
    { label: '25-34', value: census.age_25_34 || 0, color: 'bg-indigo-500' },
    { label: '35-44', value: census.age_35_44 || 0, color: 'bg-violet-500' },
    { label: '45-54', value: census.age_45_54 || 0, color: 'bg-purple-500' },
    { label: '55-64', value: census.age_55_64 || 0, color: 'bg-pink-500' },
    { label: '65+', value: census.age_65_plus || 0, color: 'bg-rose-500' },
  ]
  const maxAge = Math.max(...ageGroups.map(g => g.value))

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Census & Segment Profile
        </h3>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Housing & Location */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5" /> Housing & Location
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatBox label="Housing Type" value={census.housing_type || '—'} />
            <StatBox label="Location Type" value={census.location_type || '—'} />
            <StatBox label="Owner-Occupied" value={fmt(census.owner_occupied || 0)} />
            <StatBox label="Renter-Occupied" value={fmt(census.renter_occupied || 0)} />
            <StatBox label="Untapped Homes" value={fmt(census.untapped_homes || 0)} highlight />
            <StatBox label="Med. Home Value" value={`$${fmt(census.median_home_value || 0)}`} />
          </div>
        </div>

        {/* Vehicles */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5" /> Vehicles & Education
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatBox label="Registered Vehicles" value={fmt(census.registered_vehicles || 0)} />
            <StatBox label="Vehicles 3+ Yrs" value={fmt(census.vehicles_3plus_yrs || 0)} highlight />
            <StatBox label="Population" value={fmt(census.population || 0)} />
            <StatBox label="Adults 18+" value={fmt(census.adults_18plus || 0)} />
            <StatBox label="Median Income" value={`$${fmt(census.median_income || 0)}`} />
            <StatBox label="Coverage" value={census.coverage || '—'} />
          </div>
        </div>

        {/* Age Distribution */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Age Distribution
          </h4>
          <div className="space-y-1.5">
            {ageGroups.map((g) => (
              <div key={g.label} className="flex items-center gap-2 text-xs">
                <span className="w-10 text-right text-muted-foreground font-mono">{g.label}</span>
                <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                  <div
                    className={cn('h-full rounded', g.color)}
                    style={{ width: `${maxAge > 0 ? (g.value / maxAge) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono tabular-nums">
                  {fmt(g.value)} <span className="text-muted-foreground">({Math.round(g.value / totalAdults * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('px-2.5 py-2 rounded-lg', highlight ? 'bg-primary/10' : 'bg-muted/30')}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={cn('text-xs font-bold mt-0.5', highlight ? 'text-primary' : 'text-foreground')}>{value}</div>
    </div>
  )
}

/** Simple markdown-to-JSX renderer for AI output. Handles headers, bold, lists, paragraphs. */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-sm">
          {listItems.map((li, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatInline(li) }} />)}
        </ul>
      )
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('### ')) {
      flushList()
      elements.push(<h4 key={i} className="text-sm font-bold mt-4 mb-1 text-foreground">{line.slice(4)}</h4>)
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(<h3 key={i} className="text-base font-bold mt-5 mb-2 text-foreground">{line.slice(3)}</h3>)
    } else if (line.startsWith('# ')) {
      flushList()
      elements.push(<h2 key={i} className="text-lg font-bold mt-5 mb-2 text-foreground">{line.slice(2)}</h2>)
    } else if (/^[-*•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const text = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '')
      listItems.push(text)
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      elements.push(<p key={i} className="text-sm text-foreground/90 my-1.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />)
    }
  }
  flushList()

  return <>{elements}</>
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">$1</code>')
}

