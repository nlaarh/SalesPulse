import { useEffect, useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import {
  fetchLeadsVolume,
  fetchLeadsTimeToConvert, fetchLeadsSourceEffectiveness,
  fetchAgentCloseSpeed,
} from '@/lib/api'
import { formatCurrency, formatNumber, formatPct, cn } from '@/lib/utils'
import { useChartColors, tooltipStyle } from '@/lib/chart-theme'
import KPICard from '@/components/KPICard'
import { Tip, TIPS } from '@/components/MetricTip'
import {
  Megaphone, Target, Clock, Zap, Loader2,
  BarChart3, Table2, Sparkles,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts'

type Tab = 'charts' | 'details' | 'summary'

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: 'charts', label: 'Charts', icon: BarChart3 },
  { key: 'details', label: 'Details', icon: Table2 },
  { key: 'summary', label: 'Executive Summary', icon: Sparkles },
]

export default function LeadFunnel() {
  const { line, period, viewMode, startDate, endDate } = useSales()
  const c = useChartColors()
  const [volume, setVolume] = useState<any>(null)
  const [timeToConvert, setTimeToConvert] = useState<any>(null)
  const [sourceEff, setSourceEff] = useState<any>(null)
  const [closeSpeed, setCloseSpeed] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('charts')

  const periodLabel = viewMode === 'custom' && startDate && endDate
    ? `${startDate} → ${endDate}`
    : viewMode === 'month' ? 'Last month'
    : viewMode === 'quarter' ? 'Last 3 months'
    : 'Last 12 months'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchLeadsVolume(line, period, startDate, endDate),
      fetchLeadsTimeToConvert(line, period, startDate, endDate),
      fetchLeadsSourceEffectiveness(line, period, startDate, endDate),
      fetchAgentCloseSpeed(line, period, startDate, endDate),
    ]).then(([v, t, s, cs]) => {
      if (cancelled) return
      setVolume(v); setTimeToConvert(t); setSourceEff(s); setCloseSpeed(cs)
    }).catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [line, period, startDate, endDate])

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
  }

  const totalLeads = volume?.total ?? 0
  const totalConverted = volume?.converted ?? 0
  const convRate = totalLeads > 0 ? (totalConverted / totalLeads * 100) : 0
  const expiredRate = volume?.expired_rate ?? 0

  return (
    <div className="space-y-3">
      {/* Header + Tabs */}
      <div className="animate-enter flex items-end justify-between">
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">{line} Division &middot; {periodLabel}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Lead Conversion Funnel</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all duration-200',
                  tab === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3 w-3" />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'charts' && (
        <ChartsTab
          totalLeads={totalLeads} totalConverted={totalConverted} convRate={convRate}
          expiredRate={expiredRate} volume={volume} timeToConvert={timeToConvert}
          closeSpeed={closeSpeed} c={c}
        />
      )}
      {tab === 'details' && (
        <DetailsTab sourceEff={sourceEff} timeToConvert={timeToConvert} c={c} />
      )}
      {tab === 'summary' && (
        <SummaryTab
          totalLeads={totalLeads} totalConverted={totalConverted} convRate={convRate}
          expiredRate={expiredRate} timeToConvert={timeToConvert} sourceEff={sourceEff} line={line}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   CHARTS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ChartsTab({ totalLeads, totalConverted, convRate, expiredRate, volume, timeToConvert, closeSpeed, c }: {
  totalLeads: number; totalConverted: number; convRate: number; expiredRate: number
  volume: any; timeToConvert: any; closeSpeed: any; c: ReturnType<typeof useChartColors>
}) {
  const agents: { name: string; avg_days: number; median_days: number; deals: number }[] = closeSpeed?.agents ?? []
  // Show top 15, truncate long names
  const agentData = agents.slice(0, 15).map(a => ({
    ...a,
    label: a.name.length > 20 ? a.name.slice(0, 19) + '\u2026' : a.name,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard title="Total Leads" value={formatNumber(totalLeads)} icon={<Megaphone className="h-4 w-4" />} className="stagger-1" tip={TIPS.totalLeads} />
        <KPICard title="Converted" value={formatNumber(totalConverted)} subtitle={`${formatPct(convRate)} conversion`} icon={<Target className="h-4 w-4" />} className="stagger-2" tip={TIPS.converted} />
        <KPICard title="Avg Days to Convert" value={`${timeToConvert?.avg_days ?? '—'}`} icon={<Clock className="h-4 w-4" />} className="stagger-3" tip={TIPS.avgDaysToConvert} />
        <KPICard title="Expired Rate" value={formatPct(expiredRate)} icon={<Zap className="h-4 w-4" />} className="stagger-4" tip={TIPS.expiredRate} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads by Status */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Leads by Status<Tip text={TIPS.leadsByStatus} /></h2>
          </div>
          <div className="p-5">
            {volume?.by_status?.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={volume.by_status} layout="vertical">
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis type="category" dataKey="status" width={140} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle(c)} />
                  <Bar dataKey="count" fill={c.primary} radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>}
          </div>
        </div>

        {/* Time to Convert */}
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Time to Convert Distribution<Tip text={TIPS.timeToConvert} /></h2>
          </div>
          <div className="p-5">
            {timeToConvert?.buckets?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeToConvert.buckets}>
                  <CartesianGrid strokeDasharray="none" stroke={c.grid} vertical={false} />
                  <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle(c)} />
                  <Bar dataKey="count" fill={c.secondary} radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">No data</div>}
          </div>
        </div>
      </div>

      {/* Agent Close Speed */}
      {agentData.length > 0 && (
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Agent Close Speed</h2>
            <span className="text-[11px] text-muted-foreground">Avg days from opportunity creation to close (Won/Invoice)</span>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={Math.max(280, agentData.length * 32)}>
              <BarChart data={agentData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }}
                  label={{ value: 'Days', position: 'insideBottomRight', offset: -5, fill: c.tick, fontSize: 10 }} />
                <YAxis type="category" dataKey="label" width={150} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle(c)}
                  formatter={(v: unknown, name: unknown) => {
                    if ((name as string) === 'avg_days') return [`${Number(v).toFixed(0)} days`, 'Avg']
                    return [`${Number(v).toFixed(0)} days`, 'Median']
                  }}
                  labelFormatter={(label: unknown) => {
                    const agent = agentData.find(a => a.label === (label as string))
                    return agent ? `${agent.name} (${agent.deals} deals)` : (label as string)
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="avg_days" fill={c.tertiary} radius={[0, 6, 6, 0]} barSize={16} fillOpacity={0.8} name="avg_days" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   DETAILS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function DetailsTab({ sourceEff, timeToConvert, c }: { sourceEff: any; timeToConvert: any; c: ReturnType<typeof useChartColors> }) {
  return (
    <div className="space-y-6">
      {/* Source Effectiveness Table */}
      <div className="card-premium animate-enter overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold tracking-tight">Source Effectiveness<Tip text={TIPS.sourceEffectiveness} /></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['Source', 'Leads', 'Conv %', 'Avg Opp $'].map(h => (
                  <th key={h} className={cn('px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60', h === 'Source' ? 'text-left' : 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sourceEff?.sources ?? []).slice(0, 20).map((s: any) => (
                <tr key={s.source} className="border-b border-border/30 transition-colors duration-150 hover:bg-secondary/50">
                  <td className="px-6 py-3 text-[13px] font-medium">{s.source || '(blank)'}</td>
                  <td className="tabular-nums px-6 py-3 text-right text-[13px] text-muted-foreground">{formatNumber(s.total)}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={cn('tabular-nums text-[13px] font-medium', s.conversion_rate >= 15 ? 'text-emerald-500' : s.conversion_rate >= 5 ? 'text-foreground' : 'text-muted-foreground')}>
                      {formatPct(s.conversion_rate)}
                    </span>
                  </td>
                  <td className="tabular-nums px-6 py-3 text-right text-[13px] text-muted-foreground">{formatCurrency(s.avg_opp_value ?? 0, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time to Convert — by source */}
      {timeToConvert?.by_source?.length > 0 && (
        <div className="card-premium animate-enter">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-sm font-semibold tracking-tight">Avg Days to Convert by Source</h2>
          </div>
          <div className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={timeToConvert.by_source.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="none" stroke={c.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <YAxis type="category" dataKey="source" width={120} axisLine={false} tickLine={false} tick={{ fill: c.tick, fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [`${Number(v).toFixed(0)} days`, 'Avg']} />
                <Bar dataKey="avg_days" fill={c.purple} radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   EXECUTIVE SUMMARY TAB
   ════════════════════════════════════════════════════════════════════════════ */

function SummaryTab({ totalLeads, totalConverted, convRate, expiredRate, timeToConvert, sourceEff, line }: {
  totalLeads: number; totalConverted: number; convRate: number; expiredRate: number
  timeToConvert: any; sourceEff: any; line: string
}) {
  const avgDays = timeToConvert?.avg_days ?? 0
  const sources = sourceEff?.sources ?? []
  const topSource = sources[0]
  const bestConvSource = [...sources].filter((s: any) => (s.total ?? 0) >= 10).sort((a: any, b: any) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0))[0]
  const worstConvSource = [...sources].filter((s: any) => (s.total ?? 0) >= 10).sort((a: any, b: any) => (a.conversion_rate ?? 0) - (b.conversion_rate ?? 0))[0]

  // Expired leads = wasted opportunity
  const expiredCount = Math.round(totalLeads * (expiredRate / 100))
  const potentialFromExpired = bestConvSource ? Math.round(expiredCount * ((bestConvSource.conversion_rate ?? 0) / 100)) : 0

  // Source diversity: how concentrated is lead gen
  const topSourcePct = topSource && totalLeads > 0 ? ((topSource.total ?? 0) / totalLeads * 100) : 0

  // Fast converters
  const fastBuckets = timeToConvert?.buckets?.filter((b: any) => {
    const label = (b.range || '').toLowerCase()
    return label.includes('0-') || label.includes('1-') || label === '<7' || label === '0-7' || label === '0-14'
  }) ?? []
  const fastCount = fastBuckets.reduce((s: number, b: any) => s + (b.count ?? 0), 0)
  const fastPct = totalConverted > 0 ? (fastCount / totalConverted * 100) : 0

  // VP-level narrative — full paragraphs
  const para1 = `The ${line} Division generated ${formatNumber(totalLeads)} leads this period, converting ${formatNumber(totalConverted)} into opportunities — a ${formatPct(convRate)} conversion rate. ${avgDays > 0 ? `The average lead takes ${avgDays} days from creation to conversion${fastPct > 0 ? `, though ${fastPct.toFixed(0)}% of successful conversions happen within the first two weeks, underscoring the importance of fast initial follow-up` : ''}.` : ''}`

  const para2 = expiredRate > 20
    ? `The most significant issue in the funnel is lead expiration: ${formatPct(expiredRate)} of all leads (${formatNumber(expiredCount)}) expired without ever being converted. ${potentialFromExpired > 0 ? `At our best-source conversion rates, that represents approximately ${formatNumber(potentialFromExpired)} missed opportunities — real revenue left on the table.` : 'This represents a substantial leakage point in the funnel.'} This points to either a follow-up speed problem (leads going stale before first contact) or a routing problem (leads reaching unavailable advisors).`
    : expiredRate > 10
    ? `Lead expiration at ${formatPct(expiredRate)} (${formatNumber(expiredCount)} leads) is above the healthy threshold. While some expiration is normal, reducing this by even a few percentage points would meaningfully increase the pool of convertible opportunities.`
    : 'Lead follow-up discipline is solid — expiration rates are within healthy bounds, indicating the team is engaging prospects promptly.'

  const para3 = bestConvSource
    ? `Source analysis reveals a wide conversion gap: ${bestConvSource.source || '(unknown)'} converts at ${formatPct(bestConvSource.conversion_rate)}, ${worstConvSource && worstConvSource.source !== bestConvSource.source ? `while ${worstConvSource.source || '(unknown)'} converts at just ${formatPct(worstConvSource.conversion_rate)}` : 'significantly outperforming other channels'}. ${topSourcePct > 50 ? `However, ${topSource?.source || 'our top source'} drives ${topSourcePct.toFixed(0)}% of all lead volume — heavy reliance on a single channel creates vulnerability if that source underperforms. Diversifying lead generation across 2-3 additional high-converting channels should be a strategic priority.` : `Lead volume is reasonably distributed across ${sources.length} sources, providing good channel diversity.`}`
    : null

  const narrative = [para1, para2, para3].filter(Boolean).join('\n\n')

  const convHealth: 'strong' | 'moderate' | 'weak' = convRate >= 15 ? 'strong' : convRate >= 8 ? 'moderate' : 'weak'
  const leakHealth: 'strong' | 'moderate' | 'weak' = expiredRate < 10 ? 'strong' : expiredRate < 20 ? 'moderate' : 'weak'
  const speedHealth: 'strong' | 'moderate' | 'weak' = avgDays > 0 ? (avgDays <= 14 ? 'strong' : avgDays <= 30 ? 'moderate' : 'weak') : 'moderate'
  const sourceHealth: 'strong' | 'moderate' | 'weak' = topSourcePct < 40 ? 'strong' : topSourcePct < 60 ? 'moderate' : 'weak'

  const healthCards = [
    { label: 'Conversion Rate', value: formatPct(convRate), health: convHealth, detail: `${formatNumber(totalConverted)} of ${formatNumber(totalLeads)}`, icon: Target },
    { label: 'Funnel Leakage', value: formatPct(expiredRate), health: leakHealth, detail: `${formatNumber(expiredCount)} leads expired`, icon: Zap },
    { label: 'Speed to Convert', value: avgDays > 0 ? `${avgDays} days` : '—', health: speedHealth, detail: fastPct > 0 ? `${fastPct.toFixed(0)}% convert in <14d` : 'Avg time to close', icon: Clock },
    { label: 'Source Diversity', value: `${sources.length} sources`, health: sourceHealth, detail: `Top source: ${topSourcePct.toFixed(0)}% of leads`, icon: Megaphone },
  ]

  const actions: { priority: 'high' | 'medium' | 'low'; label: string; action: string }[] = []
  if (expiredRate > 20) actions.push({ priority: 'high', label: `${formatNumber(expiredCount)} Leads Expiring`, action: `${formatPct(expiredRate)} of leads expire before conversion. Establish a 24-hour first-contact SLA and audit whether lead routing is reaching available advisors.` })
  if (convRate < 8) actions.push({ priority: 'high', label: `${formatPct(convRate)} Conversion Rate`, action: `Conversion is well below healthy benchmarks. Investigate: are leads low quality (source problem) or are they not being worked (follow-up problem)? Compare conversion rates by source to isolate the issue.` })
  if (avgDays > 30) actions.push({ priority: 'medium', label: `${avgDays}-Day Conversion Cycle`, action: `Leads take over a month to convert on average. Map the qualification steps and identify where deals stall. Fast-moving leads close — slow ones expire.` })
  if (topSourcePct > 50) actions.push({ priority: 'medium', label: 'Source Dependency', action: `${topSource?.source || 'Top source'} generates ${topSourcePct.toFixed(0)}% of all leads. If this channel underperforms, lead flow drops significantly. Diversify by investing in 2-3 additional channels.` })
  if (worstConvSource && (worstConvSource.conversion_rate ?? 0) < 5 && (worstConvSource.total ?? 0) >= 20) actions.push({ priority: 'medium', label: 'Low-Quality Source', action: `${worstConvSource.source || '(unknown)'} generates ${formatNumber(worstConvSource.total)} leads but converts at only ${formatPct(worstConvSource.conversion_rate)}. Evaluate whether marketing spend on this channel is justified.` })
  if (convRate >= 15 && expiredRate < 15) actions.push({ priority: 'low', label: 'Healthy Funnel', action: `Conversion rate and lead follow-up are both solid. Focus on increasing volume from top-converting sources and testing new channels.` })

  return (
    <>
      <div className="animate-enter card-premium p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
          <div>
            <h3 className="text-[13px] font-semibold">Executive Briefing</h3>
            <p className="text-[10px] text-muted-foreground">{line} Division · Lead Funnel Analysis</p>
          </div>
        </div>
        <div className="space-y-3">
          {narrative.split('\n\n').map((para, i) => (
            <p key={i} className="text-[13px] leading-7 text-foreground/85">{para}</p>
          ))}
        </div>
      </div>

      <div className="animate-enter stagger-1 grid grid-cols-4 gap-3">
        {healthCards.map((card) => {
          const Icon = card.icon
          const statusColor = card.health === 'strong' ? 'text-emerald-500' : card.health === 'moderate' ? 'text-amber-500' : 'text-rose-500'
          const statusBg = card.health === 'strong' ? 'bg-emerald-500/10' : card.health === 'moderate' ? 'bg-amber-500/10' : 'bg-rose-500/10'
          const statusLabel = card.health === 'strong' ? 'Strong' : card.health === 'moderate' ? 'Moderate' : 'Needs Work'
          return (
            <div key={card.label} className="card-premium relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="mb-2 flex items-center gap-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', statusBg)}><Icon className={cn('h-3.5 w-3.5', statusColor)} /></div>
                <span className="text-[11px] font-medium text-muted-foreground">{card.label}</span>
              </div>
              <p className="tabular-nums text-[22px] font-bold leading-none tracking-tight">{card.value}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBg, statusColor)}>{statusLabel}</span>
                <span className="text-[10px] text-muted-foreground">{card.detail}</span>
              </div>
            </div>
          )
        })}
      </div>

      {actions.length > 0 && (
        <div className="animate-enter stagger-2 card-premium p-6">
          <h3 className="mb-4 text-[13px] font-semibold">Recommended Actions</h3>
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i} className={cn('rounded-lg border-l-[3px] px-4 py-3', a.priority === 'high' ? 'border-l-rose-500 bg-rose-500/5' : a.priority === 'medium' ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-emerald-500 bg-emerald-500/5')}>
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase', a.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : a.priority === 'medium' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500')}>
                    {a.priority === 'high' ? 'Action Needed' : a.priority === 'medium' ? 'Review' : 'Positive'}
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">{a.label}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/80">{a.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
