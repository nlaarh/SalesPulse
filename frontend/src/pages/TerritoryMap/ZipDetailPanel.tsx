import { useState } from 'react'
import { X, Shield, Plane, Users, TrendingUp, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TerritoryZip, ZipCustomer } from '@/lib/api'
import { fetchZipCustomers } from '@/lib/api'
import { useSales } from '@/contexts/SalesContext'
import { fmt, fmtPct, fmtCurrency } from './utils'

function MetricCard({
  label, value, sub, valueClass, icon,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {icon}{label}
      </span>
      <span className={cn('text-sm font-bold leading-tight tabular-nums', valueClass ?? 'text-foreground')}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground leading-tight">{sub}</span>}
    </div>
  )
}

function SectionHeader({ label, icon, colorClass }: { label: string; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-2', colorClass)}>
      {icon} {label}
    </div>
  )
}

export function ZipDetailPanel({
  zip, year, onClose,
}: {
  zip: TerritoryZip
  year: number
  onClose: () => void
}) {
  const { period, startDate, endDate } = useSales()
  const [drillType, setDrillType] = useState<'insurance' | 'travel' | null>(null)
  const [customers, setCustomers] = useState<ZipCustomer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [customerCount, setCustomerCount] = useState(0)

  const totalRevCy = zip.ins_rev_cy + zip.travel_rev_cy
  const totalRevPy = (zip.ins_rev_py ?? 0) + (zip.travel_rev_py ?? 0)
  const revYoY = totalRevPy > 0 ? ((totalRevCy - totalRevPy) / totalRevPy * 100) : null

  const collegePct = (zip.college_educated > 0 && zip.pop_18plus > 0)
    ? Math.round(zip.college_educated / zip.pop_18plus * 1000) / 10
    : 0

  const insPenColor = zip.ins_penetration >= 15
    ? 'text-emerald-500' : zip.ins_penetration >= 5
    ? 'text-green-500' : zip.ins_penetration >= 2
    ? 'text-yellow-500' : 'text-red-500'

  const trvPenColor = zip.travel_penetration >= 15
    ? 'text-emerald-500' : zip.travel_penetration >= 5
    ? 'text-green-500' : zip.travel_penetration >= 2
    ? 'text-yellow-500' : 'text-red-500'

  const yoyColor = (cy: number, py: number) => cy >= py ? 'text-emerald-500' : 'text-red-500'
  const yoyLabel = (cy: number, py: number) =>
    py > 0 ? `${cy >= py ? '▲' : '▼'} ${Math.abs((cy - py) / py * 100).toFixed(1)}% YoY` : undefined

  const handleDrill = async (type: 'insurance' | 'travel') => {
    if (drillType === type) {
      setDrillType(null)
      setCustomers([])
      return
    }
    setDrillType(type)
    setLoadingCustomers(true)
    try {
      const res = await fetchZipCustomers(zip.zip, type, period, startDate, endDate)
      setCustomers(res.customers)
      setCustomerCount(res.count)
    } catch {
      setCustomers([])
      setCustomerCount(0)
    } finally {
      setLoadingCustomers(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary/5 via-transparent to-transparent border-b border-border">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-2xl font-black font-mono tracking-tight text-foreground">{zip.zip}</span>
              {zip.city && <span className="text-base font-semibold text-foreground/70">{zip.city}</span>}
              <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">{zip.region}</span>
              {zip.county_name && <span className="text-xs text-muted-foreground">{zip.county_name} County</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drill-down · {year} · {fmt(zip.members)} members
              {zip.market_share > 0 && <span className="ml-1 text-orange-500 font-medium">· {fmtPct(zip.market_share)} market share</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Demographics */}
        {zip.population > 0 && (
          <div>
            <SectionHeader label="Demographics" icon={<Users className="w-3.5 h-3.5" />} colorClass="text-slate-500 dark:text-slate-400" />
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Population" value={fmt(zip.population)} />
              <MetricCard label="Adults 18+" value={fmt(zip.pop_18plus)} />
              {zip.median_income > 0 && <MetricCard label="Med. Income" value={fmtCurrency(zip.median_income)} />}
              {zip.median_age > 0 && <MetricCard label="Med. Age" value={`${zip.median_age} yrs`} />}
              {zip.housing_units > 0 && <MetricCard label="Housing Units" value={fmt(zip.housing_units)} />}
              {collegePct > 0 && <MetricCard label="College Edu." value={`${collegePct}%`} sub="of adults 18+" />}
            </div>
          </div>
        )}

        {/* Insurance */}
        <div>
          <SectionHeader label="Insurance" icon={<Shield className="w-3.5 h-3.5" />} colorClass="text-blue-500 dark:text-blue-400" />
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Customers" value={fmt(zip.ins_customers_cy)} />
            <MetricCard label="Penetration" value={fmtPct(zip.ins_penetration)} valueClass={insPenColor} />
            <MetricCard
              label={`Revenue ${year}`}
              value={fmtCurrency(zip.ins_rev_cy)}
              sub={zip.ins_rev_py > 0 ? yoyLabel(zip.ins_rev_cy, zip.ins_rev_py) : undefined}
              valueClass={zip.ins_rev_py > 0 ? yoyColor(zip.ins_rev_cy, zip.ins_rev_py) : undefined}
            />
            {zip.ins_rev_py > 0 && (
              <MetricCard label="Prior Year" value={fmtCurrency(zip.ins_rev_py)} valueClass="text-muted-foreground" />
            )}
            <MetricCard label="% of Org" value={fmtPct(zip.ins_pct_of_total)} valueClass="text-muted-foreground" />
          </div>
          <button
            onClick={() => handleDrill('insurance')}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
              drillType === 'insurance'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'border-border hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            )}
          >
            <Shield className="w-3.5 h-3.5" />
            {drillType === 'insurance' ? 'Hide' : 'View'} Insurance Customers
            {drillType === 'insurance' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Travel */}
        <div>
          <SectionHeader label="Travel" icon={<Plane className="w-3.5 h-3.5" />} colorClass="text-emerald-500 dark:text-emerald-400" />
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Customers (3yr)" value={fmt(zip.travel_customers_3yr)} />
            <MetricCard label="Penetration" value={fmtPct(zip.travel_penetration)} valueClass={trvPenColor} />
            <MetricCard
              label={`Revenue ${year}`}
              value={fmtCurrency(zip.travel_rev_cy)}
              sub={zip.travel_rev_py > 0 ? yoyLabel(zip.travel_rev_cy, zip.travel_rev_py) : undefined}
              valueClass={zip.travel_rev_py > 0 ? yoyColor(zip.travel_rev_cy, zip.travel_rev_py) : undefined}
            />
            {zip.travel_rev_py > 0 && (
              <MetricCard label="Prior Year" value={fmtCurrency(zip.travel_rev_py)} valueClass="text-muted-foreground" />
            )}
            <MetricCard label="% of Org" value={fmtPct(zip.travel_pct_of_total)} valueClass="text-muted-foreground" />
          </div>
          <button
            onClick={() => handleDrill('travel')}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
              drillType === 'travel'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'border-border hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
            )}
          >
            <Plane className="w-3.5 h-3.5" />
            {drillType === 'travel' ? 'Hide' : 'View'} Travel Customers
            {drillType === 'travel' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── Customer Drill-down Table ── */}
      {drillType && (
        <div className="border-t border-border">
          {loadingCustomers ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading {drillType} customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No {drillType} customers found in {zip.zip}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Member ID</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Plan</th>
                    {drillType === 'insurance' && (
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Insurance ID</th>
                    )}
                    {drillType === 'travel' && (
                      <>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Trips</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Trip</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={c.id || i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.email || '—'}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{c.member_id || '—'}</td>
                      <td className="px-4 py-2">{c.plan || '—'}</td>
                      {drillType === 'insurance' && (
                        <td className="px-4 py-2 font-mono">{c.insurance_id || '—'}</td>
                      )}
                      {drillType === 'travel' && (
                        <>
                          <td className="px-4 py-2 text-right font-medium text-emerald-600">{fmtCurrency(c.total_rev || 0)}</td>
                          <td className="px-4 py-2 text-right">{c.trip_count || 0}</td>
                          <td className="px-4 py-2 text-muted-foreground">{c.last_trip || '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
                Showing {customers.length} of {customerCount} {drillType} customers in {zip.zip}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer bar ── */}
      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Total {year} Revenue:</span>
          <span className="font-bold text-foreground">{fmtCurrency(totalRevCy)}</span>
        </div>
        {revYoY !== null && (
          <span className={cn('font-semibold', revYoY >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {revYoY >= 0 ? '▲' : '▼'} {Math.abs(revYoY).toFixed(1)}% vs prior year
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          Rev / member: <b className="text-foreground">{fmtCurrency(zip.members > 0 ? totalRevCy / zip.members : 0)}</b>
        </span>
      </div>
    </div>
  )
}
