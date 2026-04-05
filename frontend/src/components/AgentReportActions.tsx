/**
 * AgentReportActions — Email Report + PDF print buttons for the Agent Dashboard.
 *
 * Email: opens an inline popover with an email input; sends via /api/advisor/email.
 * PDF:   opens a print-friendly window and calls window.print().
 */

import { useState, useRef, useEffect } from 'react'
import { Mail, FileText, Loader2, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { emailAgentReport } from '@/lib/api'
import type { AgentProfile } from '@/pages/AgentDashboard'

/* ── PDF HTML builder ──────────────────────────────────────────────────────── */
function buildPrintHtml(p: AgentProfile, startDate: string, endDate: string): string {
  const fmt = (v: number | null | undefined, compact = false) => {
    if (v == null) return '—'
    if (compact && v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
    if (compact && v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
    return `$${v.toLocaleString()}`
  }
  const pct = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(1)}%`
  const s  = p.summary
  const yoy = p.yoy

  const kpiCells = ([
    ['Revenue',    fmt(s.revenue, true),    `${yoy.revenue_pct >= 0 ? '+' : ''}${yoy.revenue_pct.toFixed(1)}% YoY`],
    ['Commission', fmt(s.commission, true), `PY: ${fmt(p.prior.commission, true)}`],
    ['Deals',      String(s.deals),         `${yoy.deals_pct >= 0 ? '+' : ''}${yoy.deals_pct.toFixed(1)}% YoY`],
    ['Win Rate',   pct(s.win_rate),         `Team: ${pct(p.team.win_rate)}`],
    ['Pipeline',   fmt(s.pipeline_value, true), `${s.pipeline_count} deals`],
  ] as [string, string, string][]).map(([k, v, d]) => `
    <td style="padding:12px 6px;text-align:center;background:#f8fafc">
      <div style="font-size:10px;color:#64748b;margin-bottom:2px">${k}</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a">${v}</div>
      <div style="font-size:10px;color:#6366f1">${d}</div>
    </td>`).join('')

  const oppRows = (p.top_opportunities ?? []).slice(0, 8).map(opp => `
    <tr>
      <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9">${(opp.name ?? '').substring(0, 45)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:right">${fmt(opp.amount)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center">${opp.stage ?? '—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;text-align:center">${opp.close_date ?? '—'}</td>
    </tr>`).join('')

  const strengthItems = (p.strengths ?? []).slice(0, 4).map(s => `<li>${s}</li>`).join('')
  const improveItems  = (p.improvements ?? []).slice(0, 4).map(i => `<li>${i}</li>`).join('')

  return `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:720px;color:#1e293b;padding:20px">
  <div style="background:#4f46e5;color:#fff;border-radius:8px;padding:20px;margin-bottom:16px">
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:800">${p.name}</h1>
    <p style="margin:0;opacity:0.8">${p.line} Division &nbsp;·&nbsp; ${startDate} to ${endDate}</p>
  </div>

  ${p.writeup ? `
  <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px;margin-bottom:14px">
    <p style="margin:0 0 4px;font-weight:700;font-size:12px;color:#4338ca;text-transform:uppercase;letter-spacing:1px">Manager's Brief</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#312e81">${p.writeup.replace(/\n/g, '<br>')}</p>
  </div>` : ''}

  <table style="width:100%;border-collapse:separate;border-spacing:3px;margin-bottom:14px">
    <tr>${kpiCells}</tr>
  </table>

  ${oppRows ? `
  <h3 style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Top Opportunities</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
    <tr style="background:#1e293b;color:#fff">
      <th style="padding:6px 8px;text-align:left">Opportunity</th>
      <th style="padding:6px 8px;text-align:right">Amount</th>
      <th style="padding:6px 8px;text-align:center">Stage</th>
      <th style="padding:6px 8px;text-align:center">Close Date</th>
    </tr>
    ${oppRows}
  </table>` : ''}

  ${strengthItems || improveItems ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
    ${strengthItems ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px">
      <p style="margin:0 0 6px;font-size:10px;color:#166534;font-weight:700;text-transform:uppercase">Strengths</p>
      <ul style="margin:0;padding-left:14px;font-size:11px;color:#14532d">${strengthItems}</ul>
    </div>` : ''}
    ${improveItems ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px">
      <p style="margin:0 0 6px;font-size:10px;color:#92400e;font-weight:700;text-transform:uppercase">Areas to Improve</p>
      <ul style="margin:0;padding-left:14px;font-size:11px;color:#78350f">${improveItems}</ul>
    </div>` : ''}
  </div>` : ''}

  <p style="font-size:9px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:8px;margin:0">
    SalesPulse &nbsp;·&nbsp; ${p.line} Division &nbsp;·&nbsp; ${startDate} – ${endDate}
  </p>
</div>`
}

/* ── Props ─────────────────────────────────────────────────────────────────── */
interface Props {
  profile: AgentProfile
  startDate?: string
  endDate?: string
  line?: string
  period?: number
}

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function AgentReportActions({ profile, startDate = '', endDate = '', line = 'Travel', period = 12 }: Props) {
  const [emailOpen, setEmailOpen]     = useState(false)
  const [emailTo, setEmailTo]         = useState('')
  const [sending, setSending]         = useState(false)
  const [sent, setSent]               = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!emailOpen) return
    function onOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEmailOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [emailOpen])

  const handleSend = async () => {
    if (!emailTo || sending) return
    setSending(true)
    setError(null)
    try {
      await emailAgentReport(profile.name, emailTo, line, period, startDate || undefined, endDate || undefined)
      setSent(true)
      setTimeout(() => { setEmailOpen(false); setSent(false); setEmailTo('') }, 2200)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail ?? (err as Error).message ?? 'Failed to send'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  const handlePdf = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head>
      <title>${profile.name} — Performance Report</title>
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 15mm; }
        }
        body { margin: 0; }
      </style>
    </head><body>${buildPrintHtml(profile, startDate, endDate)}</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 350)
  }

  return (
    <div className="flex items-center gap-2">
      {/* ── Email button + popover ── */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => { setEmailOpen(o => !o); setSent(false); setError(null) }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
            emailOpen
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Mail className="h-3.5 w-3.5" />
          Email Report
        </button>

        {emailOpen && (
          <div className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-xl p-3">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-semibold text-foreground">Send to email</p>
              <button onClick={() => setEmailOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {sent ? (
              <div className="flex items-center gap-2 py-2 text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">Report sent!</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailTo}
                    onChange={e => { setEmailTo(e.target.value); setError(null) }}
                    placeholder="recipient@email.com"
                    onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    disabled={!emailTo || sending}
                    onClick={handleSend}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send'}
                  </button>
                </div>
                {error && <p className="mt-1.5 text-[11px] text-rose-500">{error}</p>}
                <p className="mt-2 text-[10px] text-muted-foreground/50">
                  Sends the full {profile.name} scorecard with KPIs, top opportunities, and manager's brief.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── PDF button ── */}
      <button
        onClick={handlePdf}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  )
}
