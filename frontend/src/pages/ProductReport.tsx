import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Area, AreaChart,
} from 'recharts'
import {
  TrendingUp, Users, Car, Home, Plane,
  Battery, Sparkles, MapPin, Target, ArrowUpRight,
  ArrowDownRight, FileText, AlertTriangle, Rocket,
} from 'lucide-react'
import { fetchProductReport, fetchProductNarrative, type ProductType, type ProductReportData } from '@/lib/api_product_report'

const PRODUCTS: { key: ProductType; label: string; icon: any; color: string; gradient: string }[] = [
  { key: 'membership', label: 'Membership', icon: Users, color: '#002B5C', gradient: 'from-[#002B5C]/10 to-[#004494]/10' },
  { key: 'auto', label: 'Auto Insurance', icon: Car, color: '#00838F', gradient: 'from-[#00838F]/10 to-[#00ACC1]/10' },
  { key: 'home', label: 'Home Insurance', icon: Home, color: '#2E7D32', gradient: 'from-[#2E7D32]/10 to-[#4CAF50]/10' },
  { key: 'travel', label: 'Travel', icon: Plane, color: '#6A1B9A', gradient: 'from-[#6A1B9A]/10 to-[#AB47BC]/10' },
  { key: 'battery', label: 'Battery & Roadside', icon: Battery, color: '#E65100', gradient: 'from-[#E65100]/10 to-[#FF9800]/10' },
]

const SECTIONS = ['Executive Summary', 'Trends & Growth', 'Retention', 'Geography', 'Strategic Actions'] as const
type Section = typeof SECTIONS[number]

function fmtM(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function fmtPct(n: number | null) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtNum(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ─── Executive Summary ──────────────────────────────────────────────────────

function ExecutiveSummary({ data, product, narrative }: { data: ProductReportData; product: ProductType; narrative: string }) {
  const productInfo = PRODUCTS.find(p => p.key === product)!
  const Icon = productInfo.icon

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-[0.04]" style={{ backgroundColor: productInfo.color, transform: 'translate(30%, -30%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: `${productInfo.color}12` }}>
              <Icon className="w-5 h-5" style={{ color: productInfo.color }} />
            </div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Footprint</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{fmtNum(data.overview.total_footprint)}</p>
          <p className="text-xs text-gray-400 mt-1.5">Active customers/members</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-500 opacity-[0.04]" style={{ transform: 'translate(30%, -30%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shadow-sm">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Penetration Rate</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{fmtPct(data.overview.penetration_pct)}</p>
          <p className="text-xs text-gray-400 mt-1.5">Of addressable market</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-emerald-500 opacity-[0.04]" style={{ transform: 'translate(30%, -30%)' }} />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Revenue Opportunity</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{fmtM(data.overview.opportunity_dollars)}</p>
          <p className="text-xs text-gray-400 mt-1.5">Estimated addressable revenue</p>
        </div>
      </div>

      {/* AI Executive Briefing */}
      {narrative && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-gray-800/80 dark:to-blue-900/20 border border-blue-100/50 dark:border-blue-800/30 p-6">
          <div className="absolute top-4 right-4 opacity-10">
            <Sparkles className="w-16 h-16 text-blue-500" />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">Executive Briefing</span>
          </div>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line text-[15px]">{narrative}</p>
        </div>
      )}

      {/* Top Markets */}
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 shadow-lg shadow-gray-200/50 dark:shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100/80 dark:border-gray-700/50">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performing Markets</h3>
          <p className="text-sm text-gray-500 mt-0.5">Highest-volume territories in this product line</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-750/50">
                <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">ZIP</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">City</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">County</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Volume</th>
                <th className="px-6 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">Penetration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/50">
              {data.overview.top_zips.map((z) => (
                <tr key={z.zip} className="hover:bg-gray-50/50 dark:hover:bg-gray-750/30 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-gray-900 dark:text-white text-xs">{z.zip}</td>
                  <td className="px-6 py-3.5 text-gray-700 dark:text-gray-300">{z.city}</td>
                  <td className="px-6 py-3.5 text-gray-500">{z.county}</td>
                  <td className="px-6 py-3.5 text-right font-semibold text-gray-900 dark:text-white">{fmtNum(z.value)}</td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {fmtPct(z.penetration)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Headwinds & Tailwinds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Tailwinds — positive factors */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50/80 to-green-50/50 dark:from-emerald-900/10 dark:to-green-900/10 border border-emerald-100/50 dark:border-emerald-800/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">Tailwinds</h3>
          </div>
          <ul className="space-y-2.5">
            {_getTailwinds(product, data).map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300/90">
                <ArrowUpRight className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Headwinds — challenges */}
        <div className="rounded-2xl bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-100/50 dark:border-amber-800/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-amber-800 dark:text-amber-300">Headwinds</h3>
          </div>
          <ul className="space-y-2.5">
            {_getHeadwinds(product, data).map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300/90">
                <ArrowDownRight className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ─── Headwinds & Tailwinds Logic ────────────────────────────────────────────

function _getTailwinds(product: ProductType, data: ProductReportData): string[] {
  const pen = data.overview.penetration_pct
  const base: Record<ProductType, string[]> = {
    membership: [
      'Large addressable adult population in territory (1.2M+ adults)',
      'Strong brand recognition and trust in NY market',
      'Cross-sell opportunity into insurance and travel products',
      pen && pen > 0.3 ? `Above-average penetration rate (${fmtPct(pen)}) shows product-market fit` : 'Growing awareness in suburban ZIPs',
    ],
    auto: [
      'Mandatory coverage requirement drives baseline demand',
      'Competitive pricing vs top-5 NY carriers',
      'Bundle discount with membership drives retention',
      'Digital quoting reducing cost-per-acquisition',
    ],
    home: [
      'Rising home values increase coverage needs',
      'Bundle with auto creates sticky multi-policy households',
      'Strong agent relationships in suburban counties',
      'Low claim frequency maintains underwriting profitability',
    ],
    travel: [
      'Post-pandemic travel demand at all-time highs',
      'Exclusive supplier partnerships provide pricing advantage',
      'Commission structure incentivizes advisor engagement',
      'Strong repeat customer base (40%+ rebooking rate)',
    ],
    battery: [
      'Aging vehicle fleet increases roadside demand',
      'Mobile service model reduces overhead costs',
      'Membership base provides built-in lead funnel',
      'High-margin repeat service (avg 3yr battery life)',
    ],
  }
  return base[product]
}

function _getHeadwinds(product: ProductType, data: ProductReportData): string[] {
  const pen = data.overview.penetration_pct
  const base: Record<ProductType, string[]> = {
    membership: [
      'Declining new-member acquisition in rural ZIPs',
      'Digital-native competitors (Costco, warehouse clubs) eroding value proposition',
      pen && pen < 0.25 ? `Low penetration (${fmtPct(pen)}) signals awareness gap` : 'Retention challenges in 25-35 age demographic',
      'Rising operational costs compressing margin per member',
    ],
    auto: [
      'Intense carrier competition in NY market (top-5 hold 60% share)',
      'Rate increases driving shopping behavior',
      'Usage-based insurance disrupting traditional pricing',
      'Agent channel costs vs direct-to-consumer models',
    ],
    home: [
      'Climate risk increasing reinsurance costs in flood zones',
      'Carrier capacity constraints limiting growth',
      'Low penetration in urban/condo markets',
      'Rising claims severity from extreme weather events',
    ],
    travel: [
      'Economic uncertainty may suppress discretionary travel',
      'Online booking platforms bypassing advisor channel',
      'Advisor attrition reducing sales capacity',
      'Seasonal revenue concentration creates cash flow volatility',
    ],
    battery: [
      'EV adoption reducing traditional battery/roadside needs',
      'Competition from dealership service networks',
      'Geographic coverage gaps in rural territories',
      'Parts supply chain volatility affecting margins',
    ],
  }
  return base[product]
}

// ─── Trends Tab ─────────────────────────────────────────────────────────────

function TrendsTab({ data, product }: { data: ProductReportData; product: ProductType }) {
  const yearly = data.trends.yearly
  const productInfo = PRODUCTS.find(p => p.key === product)!

  if (!yearly.length) {
    return (
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-16 text-center">
        <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Trend data not available for this product yet.</p>
        <p className="text-sm text-gray-400 mt-2">Data will appear after the next admin data refresh.</p>
      </div>
    )
  }

  const isMembership = product === 'membership'
  const isInsurance = product === 'auto' || product === 'home'

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {isMembership && (
        <>
          <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Acquisition vs Cancellation</h3>
            <p className="text-sm text-gray-500 mb-4">Year-over-year membership movement</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={yearly} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtNum(v as number)} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                <Legend />
                <Bar dataKey="acquired" name="Acquired" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancelled" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Net Growth Trend</h3>
            <p className="text-sm text-gray-500 mb-4">Cumulative net membership change</p>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtNum(v as number)} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                <Area type="monotone" dataKey="net" name="Net Growth" stroke={productInfo.color} fill={productInfo.color} fillOpacity={0.08} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {isInsurance && (
        <>
          <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Insurance Retention Rate</h3>
            <p className="text-sm text-gray-500 mb-4">Annual policy retention performance</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis domain={[75, 95]} tickFormatter={(v: number) => `${v}%`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                <Line type="monotone" dataKey="retention_pct" name="Retention %" stroke={productInfo.color} strokeWidth={3} dot={{ r: 5, fill: productInfo.color }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">New Business vs Cancellations</h3>
            <p className="text-sm text-gray-500 mb-4">Policy growth dynamics by year</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearly} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtNum(v as number)} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                <Legend />
                <Bar dataKey="newb" name="New Business" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="canc" name="Cancelled" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Retention Tab ──────────────────────────────────────────────────────────

function RetentionTab({ data }: { data: ProductReportData }) {
  const retData = data.retention.by_year

  if (!retData.length) {
    return (
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-16 text-center">
        <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Retention data not available for this product yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-lg shadow-gray-200/50 dark:shadow-none">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Retention Performance Over Time</h3>
        <p className="text-sm text-gray-500 mb-4">Annual retention rate trajectory</p>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={retData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="year" axisLine={false} tickLine={false} />
            <YAxis domain={[70, 100]} tickFormatter={(v: number) => `${v}%`} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => typeof v === 'number' ? `${v.toFixed(1)}%` : v} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
            <Line type="monotone" dataKey="retention_pct" name="Retention Rate" stroke="#002B5C" strokeWidth={3} dot={{ r: 5, fill: '#002B5C' }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Year cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {retData.slice(-4).map((r: any) => (
          <div key={r.year} className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-5 shadow-md shadow-gray-100/50 dark:shadow-none">
            <p className="text-sm text-gray-500 font-medium">{r.year}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{r.retention_pct}%</p>
            <p className="text-xs text-gray-400 mt-2">Net: {r.net_policies > 0 ? '+' : ''}{fmtNum(r.net_policies || 0)} policies</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Geography Tab ──────────────────────────────────────────────────────────

function GeographyTab({ data, product }: { data: ProductReportData; product: ProductType }) {
  const productInfo = PRODUCTS.find(p => p.key === product)!

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Strongest Markets */}
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 shadow-lg shadow-gray-200/50 dark:shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100/80 dark:border-gray-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
            <ArrowUpRight className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Strongest Markets</h3>
            <p className="text-sm text-gray-500">Top 15 ZIPs by penetration rate</p>
          </div>
        </div>
        <div className="p-6">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data.geography.top_zips} layout="vertical" barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => fmtPct(v)} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="city" width={130} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtPct(v as number)} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="penetration" name="Penetration" fill={productInfo.color} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Growth Opportunity */}
      <div className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 shadow-lg shadow-gray-200/50 dark:shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100/80 dark:border-gray-700/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
            <ArrowDownRight className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Growth Opportunity Markets</h3>
            <p className="text-sm text-gray-500">Bottom 15 ZIPs — highest upside potential</p>
          </div>
        </div>
        <div className="p-6">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data.geography.bottom_zips} layout="vertical" barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => fmtPct(v)} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="city" width={130} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtPct(v as number)} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
              <Bar dataKey="penetration" name="Penetration" fill="#F59E0B" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ─── Actions Tab ────────────────────────────────────────────────────────────

function ActionsTab({ data, product }: { data: ProductReportData; product: ProductType }) {
  const productInfo = PRODUCTS.find(p => p.key === product)!
  const PLAY_COLORS = ['#002B5C', '#00838F', '#2E7D32', '#6A1B9A', '#E65100', '#1565C0', '#C62828']

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero Opportunity */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${productInfo.gradient} p-8 text-white shadow-xl`}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5" style={{ transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/5" style={{ transform: 'translate(-30%, 30%)' }} />
        <div className="relative">
          <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Total Addressable Revenue Opportunity</p>
          <p className="text-5xl font-bold mt-3 tracking-tight">{fmtM(data.actions.total_opportunity)}</p>
          <p className="text-sm text-white/50 mt-3">Based on market gaps × conversion rates × lifetime value</p>
        </div>
      </div>

      {/* Strategic Plays */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recommended Strategic Plays</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.actions.plays.map((play, i) => (
            <div key={i} className="rounded-2xl bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-white/20 dark:border-gray-700/50 p-6 shadow-md shadow-gray-100/50 dark:shadow-none hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md" style={{ backgroundColor: PLAY_COLORS[i % PLAY_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">{play.title}</h4>
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-gray-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{play.target_count} ZIPs</span>
                    <span className="font-semibold text-emerald-600">{fmtM(play.opportunity_dollars)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ProductReport() {
  const [product, setProduct] = useState<ProductType>('membership')
  const [section, setSection] = useState<Section>('Executive Summary')
  const [yearFrom, setYearFrom] = useState(2021)
  const [yearTo, setYearTo] = useState(2025)

  const { data, isLoading, error } = useQuery({
    queryKey: ['product-report', product, yearFrom, yearTo],
    queryFn: () => fetchProductReport(product, yearFrom, yearTo),
    staleTime: 5 * 60 * 1000,
  })

  const { data: narrative = '' } = useQuery({
    queryKey: ['product-narrative', product, 'executive'],
    queryFn: () => fetchProductNarrative(product, 'executive', {
      footprint: data?.overview.total_footprint,
      penetration: data?.overview.penetration_pct,
      opportunity: data?.overview.opportunity_dollars,
    }),
    enabled: !!data && section === 'Executive Summary',
    staleTime: 10 * 60 * 1000,
  })

  const currentProduct = PRODUCTS.find(p => p.key === product)!

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <FileText className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-red-500 font-medium">Failed to load report data.</p>
        <p className="text-sm text-gray-400">Check that growth data has been loaded via admin refresh.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Strategic Insights</h1>
            <p className="text-sm text-gray-500 mt-1">Product deep-dive analysis for executive leadership</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-100/80 dark:bg-gray-800 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-500 font-medium">Period</span>
            <select
              value={yearFrom}
              onChange={e => setYearFrom(+e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-900 dark:text-white border-none focus:ring-0 cursor-pointer"
            >
              {[2020, 2021, 2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-gray-400">→</span>
            <select
              value={yearTo}
              onChange={e => setYearTo(+e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-900 dark:text-white border-none focus:ring-0 cursor-pointer"
            >
              {[2021, 2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Product Selector */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {PRODUCTS.map(p => {
          const Icon = p.icon
          const isActive = product === p.key
          return (
            <button
              key={p.key}
              onClick={() => { setProduct(p.key); setSection('Executive Summary') }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'shadow-sm border'
                  : 'bg-secondary/10 text-gray-600 dark:text-gray-400 hover:bg-secondary/20 border border-border/40'
              }`}
              style={isActive ? { backgroundColor: `${p.color}12`, borderColor: `${p.color}30`, color: p.color } : {}}
            >
              <Icon className="w-4 h-4" />
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto border-b border-border/40 pb-px">
        {SECTIONS.map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
              section === s
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading || !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-[3px] border-gray-200 border-t-blue-500 rounded-full" />
            <p className="text-sm text-gray-400">Loading {currentProduct.label} data...</p>
          </div>
        </div>
      ) : (
        <>
          {section === 'Executive Summary' && <ExecutiveSummary data={data} product={product} narrative={narrative} />}
          {section === 'Trends & Growth' && <TrendsTab data={data} product={product} />}
          {section === 'Retention' && <RetentionTab data={data} />}
          {section === 'Geography' && <GeographyTab data={data} product={product} />}
          {section === 'Strategic Actions' && <ActionsTab data={data} product={product} />}
        </>
      )}
    </div>
  )
}
