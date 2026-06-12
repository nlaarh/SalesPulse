import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, Download, Loader2, AlertCircle, Calendar, RefreshCw, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type ScorecardAgent, type ScorecardResponse,
  fetchInsuranceScorecard, exportInsuranceScorecard,
} from '@/lib/api'

// ── date helpers ──────────────────────────────────────────────────────────

function monthRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return { start, end, label }
}

const MONTH_PRESETS = [0, -1, -2].map(monthRange)

// ── cell helpers ──────────────────────────────────────────────────────────

function Num({ v }: { v: number }) {
  return <>{v ? v.toLocaleString() : ''}</>
}

function AgentRow({ a, idx }: { a: ScorecardAgent; idx: number }) {
  return (
    <tr className={cn('border-b border-border/50', idx % 2 === 1 && 'bg-muted/10')}>
      <td className="border-r border-border px-4 py-2 text-center font-medium text-foreground whitespace-nowrap">{a.name}</td>
      <td className="px-2 py-2 text-center tabular-nums"><Num v={a.activities} /></td>
      <td className="px-2 py-2 text-center tabular-nums"><Num v={a.calls_answered} /></td>
      <td className="border-r border-border px-2 py-2 text-center tabular-nums">
        {a.group === 'branch' ? <Num v={a.walkins} /> : ''}
      </td>
      <td className="px-2 py-2 text-center tabular-nums"><Num v={a.alerted} /></td>
      <td className="border-r border-border px-2 py-2 text-center tabular-nums"><Num v={a.answered} /></td>
      <td className="px-2 py-2 text-center tabular-nums"><Num v={a.audits_scored} /></td>
      <td className="border-r border-border px-2 py-2 text-center tabular-nums"><Num v={a.audits_correct} /></td>
      <td className="px-2 py-2 text-center tabular-nums font-medium"><Num v={a.new_members} /></td>
      <td className="px-2 py-2 text-center tabular-nums"><Num v={a.mbr_points} /></td>
    </tr>
  )
}

// ── the exact "Performance Metric Data Entries" table ─────────────────────

function PerformanceTable({ cc, branch }: { cc: ScorecardAgent[]; branch: ScorecardAgent[] }) {
  return (
    <div className="rounded-2xl border-2 border-foreground/20 bg-card shadow-sm overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Title row */}
            <tr>
              <th colSpan={10}
                  className="border-b-2 border-foreground/20 bg-muted px-4 py-2.5 text-center text-sm font-bold text-foreground">
                Performance Metric Data Entries
              </th>
            </tr>
            {/* Group header row */}
            <tr className="border-b border-border bg-muted/40">
              <th rowSpan={2}
                  className="border-r border-border px-4 py-2 text-center text-sm font-bold text-foreground w-44">
                Employee
              </th>
              <th colSpan={3} className="border-r border-border px-2 py-1.5 text-center text-sm font-bold text-foreground">
                Customers Helped
              </th>
              <th colSpan={2} className="border-r border-border px-2 py-1.5 text-center text-sm font-bold text-foreground">
                Answer Rate
              </th>
              <th colSpan={2} className="border-r border-border px-2 py-1.5 text-center text-sm font-bold text-foreground">
                Quality
              </th>
              <th colSpan={2} className="px-2 py-1.5 text-center text-sm font-bold text-foreground">
                Membership Sales
              </th>
            </tr>
            {/* Column header row */}
            <tr className="border-b-2 border-foreground/20 bg-muted/40">
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Activities</th>
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Calls Answered</th>
              <th className="border-r border-border px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Walk-Ins</th>
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Alerted</th>
              <th className="border-r border-border px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Answered</th>
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Audits Scored</th>
              <th className="border-r border-border px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Audit Correct</th>
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">New Members</th>
              <th className="px-2 py-1.5 text-center text-[12px] font-bold text-foreground whitespace-nowrap">Mbr Points</th>
            </tr>
          </thead>
          <tbody>
            {/* Call Center block */}
            {cc.map((a, i) => <AgentRow key={a.name} a={a} idx={i} />)}
            {/* Separator between CC and Branch — mirrors the spreadsheet's blank divider */}
            {cc.length > 0 && branch.length > 0 && (
              <tr className="border-y-2 border-foreground/20 bg-muted/40">
                <td colSpan={10} className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Branch
                </td>
              </tr>
            )}
            {/* Branch block */}
            {branch.map((a, i) => <AgentRow key={a.name} a={a} idx={i} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────

export default function InsuranceScorecard() {
  const [data, setData]           = useState<ScorecardResponse | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const [startDate, setStartDate] = useState(MONTH_PRESETS[1].start) // default: last month
  const [endDate, setEndDate]     = useState(MONTH_PRESETS[1].end)
  const [activePreset, setActivePreset] = useState<number | null>(1)

  const load = useCallback(async (sd: string, ed: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchInsuranceScorecard(sd, ed)
      setData(res)
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load scorecard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(startDate, endDate) }, [])  // initial load only

  function applyPreset(i: number) {
    setActivePreset(i)
    setStartDate(MONTH_PRESETS[i].start)
    setEndDate(MONTH_PRESETS[i].end)
    load(MONTH_PRESETS[i].start, MONTH_PRESETS[i].end)
  }

  async function handleExport() {
    setExporting(true)
    try { await exportInsuranceScorecard(startDate, endDate) }
    catch (e: any) { setError(e?.message || 'Export failed') }
    finally { setExporting(false) }
  }

  const ccAgents     = data?.agents.filter(a => a.group === 'cc') ?? []
  const branchAgents = data?.agents.filter(a => a.group === 'branch') ?? []
  const sourceErrors = Object.entries(data?.source_errors ?? {})

  return (
    <div className="pb-8">
      {/* header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Insurance Scorecard</h1>
          </div>
          <p className="ml-[52px] text-sm text-muted-foreground">
            Concierge performance — live from Power BI (Epic, TTEC, MEID) and Salesforce
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading || !data}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export CSV
        </button>
      </div>

      {/* date controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {MONTH_PRESETS.map((p, i) => (
          <button key={p.label}
                  onClick={() => applyPreset(i)}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
                    activePreset === i
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  )}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input type="date" value={startDate}
                 onChange={e => { setStartDate(e.target.value); setActivePreset(null) }}
                 className="bg-transparent text-sm text-foreground outline-none" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={endDate}
                 onChange={e => { setEndDate(e.target.value); setActivePreset(null) }}
                 className="bg-transparent text-sm text-foreground outline-none" />
        </div>
        <button onClick={() => load(startDate, endDate)} disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-primary/40 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Run
        </button>
      </div>

      {/* errors */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {sourceErrors.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <p className="font-semibold mb-1">Some sources failed — affected columns show blanks:</p>
          {sourceErrors.map(([k, v]) => <p key={k} className="text-xs">• {k}: {v}</p>)}
        </div>
      )}

      {/* loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Querying live data (Epic via Power BI DirectQuery — may take up to a minute)…
        </div>
      )}

      {/* the exact table */}
      {!loading && data && (
        <>
          <PerformanceTable cc={ccAgents} branch={branchAgents} />

          {/* data source footnotes — link to PBI / Salesforce so numbers can be verified at the source */}
          <div className="rounded-2xl border border-border bg-muted/20 px-5 py-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground text-[13px] mb-1.5">Data Sources — click to verify at the source</p>
            {Object.entries(data.sources).map(([k, v]) => (
              <p key={k} className="flex items-center gap-1.5">
                <span className="font-medium capitalize w-20 shrink-0">{k}</span>
                <a href={v.url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-primary hover:underline">
                  {v.label}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </p>
            ))}
            <p className="pt-1 italic">Period: {data.start_date} → {data.end_date} (inclusive). Spec: memory/sales-analyst.md §16</p>
          </div>
        </>
      )}
    </div>
  )
}
