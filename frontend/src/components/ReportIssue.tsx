/**
 * ReportIssue — floating bug button + report modal.
 * Auto-detects current page, pre-fills user info from auth context.
 * Submits to POST /api/issues → creates GitHub Issue + triggers AI triage bot.
 */

import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Bug, X, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { submitIssue } from '@/lib/api'

/* ── Page label map ─────────────────────────────────────────────────────── */
const PAGE_LABELS: Record<string, string> = {
  '/dashboard':     'Sales Dashboard',
  '/monthly':       'Monthly Report',
  '/pipeline':      'Pipeline & Forecast',
  '/opportunities': 'Top Opportunities',
  '/leads':         'Lead Funnel',
  '/travel':        'Travel Destinations',
  '/settings':      'Settings',
  '/help':          'Help & Documentation',
  '/issues':        'Issues',
}

function getPageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  if (path.startsWith('/agent/')) return `Agent Profile — ${decodeURIComponent(path.split('/agent/')[1] ?? '')}`
  return path
}

/* ── Severity options ───────────────────────────────────────────────────── */
const SEVERITIES = [
  { key: 'low',    label: 'Low',    cls: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' },
  { key: 'medium', label: 'Medium', cls: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  { key: 'high',   label: 'High',   cls: 'bg-rose-500/20 text-rose-500 border-rose-500/30' },
] as const

type Severity = (typeof SEVERITIES)[number]['key']

/* ── Component ──────────────────────────────────────────────────────────── */
export default function ReportIssue() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [open, setOpen]             = useState(false)
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [description, setDesc]      = useState('')
  const [severity, setSeverity]     = useState<Severity>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]         = useState<{ num: number; url: string } | null>(null)
  const [error, setError]           = useState<string | null>(null)

  // Pre-fill from auth context + localStorage
  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setEmail(user.email || localStorage.getItem('sp_reporter_email') || '')
    } else {
      setName(localStorage.getItem('sp_reporter_name') || '')
      setEmail(localStorage.getItem('sp_reporter_email') || '')
    }
  }, [user])

  // Auto-close success after 3s
  useEffect(() => {
    if (result) {
      const t = setTimeout(() => { setResult(null); setOpen(false) }, 3000)
      return () => clearTimeout(t)
    }
  }, [result])

  const reset = () => {
    setDesc(''); setSeverity('medium'); setError(null); setResult(null)
  }

  const handleOpen = () => { reset(); setOpen(true) }
  const handleClose = () => { if (!submitting) { setOpen(false); reset() } }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (name.trim())  localStorage.setItem('sp_reporter_name', name.trim())
      if (email.trim()) localStorage.setItem('sp_reporter_email', email.trim())
      const res = await submitIssue({
        description: description.trim(),
        severity,
        page: pathname,
        reporter: name.trim() || 'Anonymous',
        email: email.trim() || '',
      })
      setResult({ num: res.issue_number, url: res.url })
      setDesc('')
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={handleOpen}
        title="Report a bug"
        className="fixed bottom-6 left-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-all duration-200 hover:scale-105 hover:bg-secondary active:scale-95"
      >
        <Bug className="h-4.5 w-4.5 text-muted-foreground" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

          {/* Card */}
          <div className="relative w-full max-w-md rounded-xl border border-border bg-popover shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Report an Issue</h2>
              </div>
              <button onClick={handleClose}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {result ? (
              /* Success state */
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                <p className="text-sm font-semibold text-foreground">Issue submitted — thank you!</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Our AI bot will review it shortly.
                </p>
                {result.url && (
                  <a href={result.url} target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline">
                    View #{result.num} on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
                {/* Current page (auto) */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Page
                  </p>
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground/70">
                    {getPageLabel(pathname)}
                  </div>
                </div>

                {/* Name + Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Your Name
                    </label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Name"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Email
                    </label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    What happened? <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Describe what looks wrong, what you expected, or what confused you…"
                    rows={4}
                    required
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                </div>

                {/* Severity */}
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Severity
                  </p>
                  <div className="flex gap-2">
                    {SEVERITIES.map(s => (
                      <button key={s.key} type="button" onClick={() => setSeverity(s.key)}
                        className={cn(
                          'flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all',
                          severity === s.key ? s.cls : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                        )}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-xs text-rose-500">{error}</p>}

                <button type="submit" disabled={submitting || !description.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                  {submitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                    : 'Submit Issue'}
                </button>

                <p className="text-center text-[10px] text-muted-foreground/40">
                  Submitted as a GitHub Issue · AI bot triages within seconds
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
