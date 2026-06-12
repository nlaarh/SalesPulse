import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Calendar, ChevronDown, Loader2, CheckCircle2,
  AlertCircle, Trash2, ExternalLink, BarChart2, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type ReportEntry,
  fetchReports, generateReport, pollReportStatus, openReportHtml, deleteReport,
} from '@/lib/api'

function subtractMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}
function today(): string { return new Date().toISOString().split('T')[0] }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtGenerated(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const PRESETS = [
  { label: '1 Year',  months: 12 },
  { label: '2 Years', months: 24 },
  { label: '3 Years', months: 36 },
]

const AVAILABLE_REPORTS = [
  {
    id: 'board-analysis',
    title: 'AAA WCNY Travel Customer Analysis',
    description: 'Board & Executive Presentation · PwC/Accenture Style · Live Salesforce Data',
    icon: BarChart2,
  },
]

export default function ReportsTravel() {
  const [reports, setReports]           = useState<ReportEntry[]>([])
  const [loading, setLoading]           = useState(true)
  const [listError, setListError]       = useState<string | null>(null)

  const [showModal, setShowModal]       = useState(false)
  const [preset, setPreset]             = useState<number | null>(24)
  const [startDate, setStartDate]       = useState(subtractMonths(24))
  const [endDate, setEndDate]           = useState(today())
  const [showCustom, setShowCustom]     = useState(false)

  const [genStatus, setGenStatus]       = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [genError, setGenError]         = useState<string | null>(null)
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null)
  const [opening, setOpening]           = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const data = await fetchReports()
      setReports(data)
    } catch (e: any) {
      setListError(e?.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadReports() }, [loadReports])

  function openModal() {
    setShowModal(true)
    setGenStatus('idle')
    setGenError(null)
    setPreset(24)
    setStartDate(subtractMonths(24))
    setEndDate(today())
    setShowCustom(false)
  }

  function applyPreset(months: number) {
    setPreset(months)
    setStartDate(subtractMonths(months))
    setEndDate(today())
    setShowCustom(false)
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleGenerate() {
    if (genStatus === 'generating') return
    setGenStatus('generating')
    setGenError(null)
    try {
      const res = await generateReport(startDate, endDate)
      if (res.status === 'ready') {
        setGenStatus('ready')
        loadReports()
        return
      }
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
    try { await openReportHtml(id) } catch { /* ignore */ }
    finally { setOpening(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this report?')) return
    setDeleting(id)
    try {
      await deleteReport(id)
      setReports(prev => prev.filter(r => r.id !== id))
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Travel Reports</h1>
          </div>
          <p className="ml-[52px] text-sm text-muted-foreground">
            Board &amp; executive presentations for AAA WCNY Travel division
          </p>
        </div>
      </div>

      {/* Generate modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Generate Travel Report</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">AAA WCNY Travel Customer Analysis</p>
              </div>
              <button onClick={() => { setShowModal(false); stopPoll() }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary transition-colors text-lg leading-none">✕</button>
            </div>

            <div className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time Period</div>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESETS.map(p => (
                  <button key={p.months} onClick={() => applyPreset(p.months)}
                    className={cn(
                      'rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition-all',
                      preset === p.months
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}>
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => { setPreset(null); setShowCustom(v => !v) }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition-all',
                    showCustom
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}>
                  <Calendar className="h-3.5 w-3.5" />
                  Custom
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showCustom && 'rotate-180')} />
                </button>
              </div>

              {showCustom && (
                <div className="mt-3 flex items-center gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Start</label>
                    <input type="date" value={startDate} max={endDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none" />
                  </div>
                  <div className="mt-5 text-muted-foreground">→</div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">End</label>
                    <input type="date" value={endDate} min={startDate} max={today()}
                      onChange={e => setEndDate(e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none" />
                  </div>
                </div>
              )}
              <p className="mt-2 text-[12px] text-muted-foreground">
                Period: <span className="font-semibold text-foreground">{fmtDate(startDate)} – {fmtDate(endDate)}</span>
              </p>
            </div>

            {genStatus === 'generating' && (
              <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-[12px] text-amber-700">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating report…
                </div>
                Querying Salesforce in parallel → building charts → assembling HTML. ~20–40 sec.
              </div>
            )}
            {genStatus === 'ready' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 text-[12px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Report generated — see the table below.
              </div>
            )}
            {genStatus === 'error' && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-[12px] font-semibold text-red-600">
                <AlertCircle className="h-4 w-4" /> {genError || 'Generation failed'}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowModal(false); stopPoll() }}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-secondary transition-colors">
                {genStatus === 'ready' ? 'Close' : 'Cancel'}
              </button>
              {genStatus !== 'ready' && (
                <button onClick={handleGenerate} disabled={genStatus === 'generating'}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-bold transition-all',
                    genStatus === 'generating'
                      ? 'cursor-not-allowed bg-muted text-muted-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}>
                  {genStatus === 'generating'
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                    : <><FileText className="h-4 w-4" /> Generate</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Available reports */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden mb-6">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-bold text-foreground">Available Reports</h2>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Report</th>
              <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
              <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {AVAILABLE_REPORTS.map(r => {
              const Icon = r.icon
              return (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-semibold text-foreground">{r.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{r.description}</td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={openModal}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Generate
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Generated reports */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Generated Reports</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">Previously generated reports · click Open to view</p>
          </div>
          <button onClick={loadReports}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-secondary transition-colors">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : listError ? (
          <div className="flex items-center justify-center py-12 text-red-500 text-sm gap-2">
            <AlertCircle className="h-4 w-4" /> {listError}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <FileText className="h-9 w-9 opacity-25" />
            <div className="text-center">
              <p className="font-semibold text-foreground">No reports yet</p>
              <p className="text-sm mt-1">Click <strong>New Report</strong> to generate your first one.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Report</th>
                <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Period</th>
                <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Generated</th>
                <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.map((r, i) => (
                <tr key={r.id} className={cn('transition-colors hover:bg-muted/30', i % 2 !== 0 && 'bg-muted/10')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="font-semibold text-foreground">{r.label || 'Travel Customer Analysis'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{fmtGenerated(r.generated_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => handleOpen(r.id)} disabled={opening === r.id}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-40">
                        {opening === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                        Open
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                        className="rounded-lg p-1.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40">
                        {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
