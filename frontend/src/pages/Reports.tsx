import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Clock, ExternalLink, Trash2,
  Calendar, ChevronDown, Loader2, CheckCircle2, AlertCircle,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type ReportEntry,
  fetchReports, generateReport, pollReportStatus, openReportHtml, deleteReport,
} from '@/lib/api'

const N1 = '#0B2545'
const T1 = '#00857C'

// ── preset quick picks ────────────────────────────────────────────────────

function subtractMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}
function today(): string { return new Date().toISOString().split('T')[0] }

const PRESETS = [
  { label: '1 Year',  months: 12 },
  { label: '2 Years', months: 24 },
  { label: '3 Years', months: 36 },
]

// ── helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtGenerated(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'generating')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 border border-amber-200">
        <Loader2 className="h-3 w-3 animate-spin" /> Generating…
      </span>
    )
  if (status === 'ready')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 border border-red-200">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  )
}

// ── main page ─────────────────────────────────────────────────────────────

export default function Reports() {
  const [reports, setReports]           = useState<ReportEntry[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  // date-range state
  const [preset, setPreset]             = useState<number | null>(24)   // months, null = custom
  const [startDate, setStartDate]       = useState(subtractMonths(24))
  const [endDate, setEndDate]           = useState(today())
  const [showCustom, setShowCustom]     = useState(false)

  // generation state
  const [genStatus, setGenStatus]       = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [genError, setGenError]         = useState<string | null>(null)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null)

  // opening
  const [opening, setOpening]           = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const data = await fetchReports()
      setReports(data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  // ── preset selection ──
  function applyPreset(months: number) {
    setPreset(months)
    setStartDate(subtractMonths(months))
    setEndDate(today())
    setShowCustom(false)
  }

  function handleCustomToggle() {
    setPreset(null)
    setShowCustom(true)
  }

  // ── generation ──
  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleGenerate() {
    if (genStatus === 'generating') return
    setGenStatus('generating')
    setGenError(null)
    try {
      const res = await generateReport(startDate, endDate)
      setCurrentJobId(res.report_id)
      if (res.status === 'ready') {
        setGenStatus('ready')
        loadReports()
        return
      }
      // Poll until done
      stopPoll()
      pollRef.current = setInterval(async () => {
        try {
          const poll = await pollReportStatus(res.report_id)
          if (poll.status === 'ready') {
            stopPoll()
            setGenStatus('ready')
            loadReports()
          }
        } catch (e: any) {
          stopPoll()
          setGenStatus('error')
          setGenError(e?.response?.data?.detail || 'Generation failed')
        }
      }, 2500)
    } catch (e: any) {
      setGenStatus('error')
      setGenError(e?.response?.data?.detail || 'Generation failed')
    }
  }

  useEffect(() => () => stopPoll(), [])

  async function handleOpen(id: string) {
    setOpening(id)
    try { await openReportHtml(id) }
    catch { /* silently fail — browser may block popup */ }
    finally { setOpening(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this report from the saved list?')) return
    setDeleting(id)
    try {
      await deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
    } catch {
      /* ignore */
    } finally {
      setDeleting(null) }
  }

  const isGeneratingThis = (id: string) => genStatus === 'generating' && currentJobId === id

  return (
    <div className="pb-8">
      {/* ── Page header ── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Reports</h1>
          </div>
          <p className="ml-[52px] text-sm text-muted-foreground">
            Board &amp; executive presentations generated from live Power BI data
          </p>
        </div>
      </div>

      {/* ── Report card: Insurance Scorecard ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden mb-8">
        <div className="flex items-center gap-4 px-6 py-5"
             style={{ background: `linear-gradient(135deg, ${N1} 0%, #1B3A6B 60%, ${T1} 100%)` }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white leading-tight">Insurance Concierge Scorecard</h2>
            <p className="mt-0.5 text-[13px] text-white/70">
              Performance Metric Data Entries · Live Epic, TTEC, MEID &amp; Salesforce · Any date range · CSV export
            </p>
          </div>
          <a href="/reports/insurance-scorecard"
             className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/25 transition-colors">
            <ExternalLink className="h-4 w-4" />
            Open Scorecard
          </a>
        </div>
      </div>

      {/* ── Report card: Travel Board Analysis ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden mb-8">
        {/* Card header */}
        <div className="flex items-center gap-4 border-b border-border px-6 py-5"
             style={{ background: `linear-gradient(135deg, ${N1} 0%, #1B3A6B 60%, ${T1} 100%)` }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white leading-tight">
              AAA WCNY Travel Customer Analysis
            </h2>
            <p className="mt-0.5 text-[13px] text-white/70">
              Board &amp; Executive Presentation · PwC/Accenture Style · Live Power BI Data
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
            Production Ready
          </div>
        </div>

        {/* Card body */}
        <div className="px-6 py-5">

          {/* Date range picker */}
          <div className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Select Time Period
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESETS.map(p => (
                <button
                  key={p.months}
                  onClick={() => applyPreset(p.months)}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-[13px] font-semibold transition-all',
                    preset === p.months
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={handleCustomToggle}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-all',
                  showCustom
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Custom
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showCustom && 'rotate-180')} />
              </button>
            </div>

            {/* Custom date inputs */}
            {showCustom && (
              <div className="mt-3 flex items-center gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="mt-5 text-muted-foreground">→</div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={today()}
                    onChange={e => setEndDate(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Selected range summary */}
            <div className="mt-2 text-[12px] text-muted-foreground">
              Period: <span className="font-semibold text-foreground">
                {fmtDate(startDate)} – {fmtDate(endDate)}
              </span>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={genStatus === 'generating'}
              className={cn(
                'flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all shadow-sm',
                genStatus === 'generating'
                  ? 'cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]',
              )}
            >
              {genStatus === 'generating' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating Report…</>
              ) : (
                <><FileText className="h-4 w-4" /> Generate Report</>
              )}
            </button>

            {genStatus === 'generating' && (
              <span className="text-[12px] text-amber-600 font-medium animate-pulse">
                Querying Power BI (5 parallel queries) · charts compiling · ~20–40 sec…
              </span>
            )}
            {genStatus === 'ready' && (
              <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Report ready — see below ↓
              </span>
            )}
            {genStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-[12px] text-red-600 font-semibold">
                <AlertCircle className="h-4 w-4" /> {genError || 'Generation failed'}
              </span>
            )}
          </div>

          {genStatus === 'generating' && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-[12px] text-amber-700">
              <strong>What's happening:</strong> pulling Commission, Customer Types, Products, Destinations, and Monthly data
              from Power BI in parallel → rendering 7 charts → assembling board-quality HTML.
              The report will appear in the table below when ready.
            </div>
          )}
        </div>
      </div>

      {/* ── Saved Reports table ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Saved Reports</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Click Open to view in a new browser tab. Each period is cached — re-generating the same dates overwrites the previous version.
            </p>
          </div>
          <button
            onClick={loadReports}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm gap-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <FileText className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="font-semibold text-foreground">No reports yet</p>
              <p className="text-sm mt-1">Use the panel above to generate your first report.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Report</th>
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Period</th>
                  <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Generated</th>
                  <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Size</th>
                  <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reports.map((r, i) => (
                  <tr key={r.id} className={cn('transition-colors hover:bg-muted/30', i === 0 && 'bg-emerald-50/30')}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">Travel Board Analysis</div>
                          <div className="text-[11px] text-muted-foreground/70">{r.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-foreground">{r.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>{fmtGenerated(r.generated_at)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right text-muted-foreground">
                      {r.file_size_kb ? `${r.file_size_kb} KB` : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <StatusBadge status={isGeneratingThis(r.id) ? 'generating' : 'ready'} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpen(r.id)}
                          disabled={opening === r.id}
                          title="Open report in new tab"
                          className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                        >
                          {opening === r.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <ExternalLink className="h-3.5 w-3.5" />}
                          Open
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          title="Delete report"
                          className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          {deleting === r.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── What's included ── */}
      <div className="mt-6 rounded-xl border border-border bg-muted/30 px-5 py-4">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          What's in every Travel Board Report
        </h4>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12.5px] text-muted-foreground">
          {[
            ['Executive Summary', 'Board letter + 4 key findings + 2019–2026 revenue arc'],
            ['Geographic Origin', 'County-level map + top 15 counties + top 10 ZIPs + income bands'],
            ['Destination Analysis', 'All regions ranked + product mix + destination × product margin table'],
            ['Customer Demographics', 'Member age distribution + customer type revenue split + monthly seasonality'],
            ['Strategic Opportunities', '6 ranked growth vectors with current state, target, and executable actions'],
          ].map(([title, desc]) => (
            <div key={title} className="flex items-start gap-2">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <div><span className="font-semibold text-foreground">{title}:</span> {desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
