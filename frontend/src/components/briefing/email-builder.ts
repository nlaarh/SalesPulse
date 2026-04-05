import { formatCurrency, formatPct } from '@/lib/utils'
import type { AgentProfile, FocusArea } from './types'

/* ── HTML escape ──────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ── HTML email builder (rich text, addressed to the advisor) ─────────────── */

export function buildAdvisorEmailHtml(
  p: AgentProfile,
  pts: FocusArea[],
  date: string,
): string {
  const s = p.summary
  const yoy = p.yoy
  const firstName = p.name.split(/[,\s]+/)[0]

  const yoyColor = (v: number) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#64748b'
  const fmtYoy = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

  const cellStyle = 'padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;'
  const headerStyle = `${cellStyle}background:#f8fafc;font-weight:600;color:#475569;text-align:left;`
  const numStyle = `${cellStyle}text-align:right;font-variant-numeric:tabular-nums;`

  const priorityColor: Record<string, string> = { high: '#dc2626', medium: '#d97706', low: '#16a34a' }
  const priorityLabel: Record<string, string> = { high: 'ACTION NEEDED', medium: 'REVIEW', low: 'POSITIVE' }
  const priorityBg: Record<string, string> = { high: '#fef2f2', medium: '#fffbeb', low: '#f0fdf4' }
  const priorityBorder: Record<string, string> = { high: '#fecaca', medium: '#fde68a', low: '#bbf7d0' }

  let html = `<div style="font-family:Segoe UI,Calibri,Arial,sans-serif;color:#1e293b;max-width:680px;">`

  // Greeting
  html += `<p style="font-size:14px;margin:0 0 12px;">Hi ${esc(firstName)},</p>`
  html += `<p style="font-size:14px;margin:0 0 20px;color:#475569;">Here's a summary of your performance for the <b>${esc(p.line)}</b> division as of ${esc(date)}.</p>`

  // Numbers table
  html += `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin:0 0 8px;border-bottom:2px solid #1e293b;padding-bottom:4px;">Your Numbers</h3>`
  html += `<table style="border-collapse:collapse;width:100%;margin-bottom:20px;">`
  html += `<tr><th style="${headerStyle}">Metric</th><th style="${headerStyle}text-align:right;">Value</th><th style="${headerStyle}text-align:right;">YoY / Benchmark</th></tr>`
  html += `<tr><td style="${cellStyle}">Revenue</td><td style="${numStyle}font-weight:600;">${esc(formatCurrency(s.revenue, true))}</td><td style="${numStyle}color:${yoyColor(yoy.revenue_pct)};font-weight:600;">${fmtYoy(yoy.revenue_pct)}</td></tr>`
  html += `<tr><td style="${cellStyle}">Deals Won</td><td style="${numStyle}">${s.deals}</td><td style="${numStyle}color:${yoyColor(yoy.deals_pct)};">${fmtYoy(yoy.deals_pct)}</td></tr>`
  html += `<tr><td style="${cellStyle}">Win Rate</td><td style="${numStyle}">${esc(formatPct(s.win_rate))}</td><td style="${numStyle}color:#64748b;">Team: ${esc(formatPct(p.team.win_rate))}</td></tr>`
  html += `<tr><td style="${cellStyle}">Avg Deal</td><td style="${numStyle}">${esc(formatCurrency(s.avg_deal, true))}</td><td style="${numStyle}color:#64748b;">Team: ${esc(formatCurrency(p.team.avg_deal, true))}</td></tr>`
  html += `<tr><td style="${cellStyle}">Pipeline</td><td style="${numStyle}">${esc(formatCurrency(s.pipeline_value, true))}</td><td style="${numStyle}color:${s.coverage >= 2 ? '#16a34a' : '#d97706'};">${s.coverage >= 2 ? 'Healthy' : 'Needs more deals'}</td></tr>`
  html += `</table>`

  // Focus Areas
  if (pts.length > 0) {
    html += `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin:0 0 8px;border-bottom:2px solid #1e293b;padding-bottom:4px;">Focus Areas</h3>`
    pts.forEach((pt, i) => {
      html += `<div style="margin-bottom:12px;padding:10px 14px;border-left:4px solid ${priorityBorder[pt.priority]};background:${priorityBg[pt.priority]};border-radius:4px;">`
      html += `<div style="margin-bottom:4px;"><span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${priorityColor[pt.priority]};">${priorityLabel[pt.priority]}</span></div>`
      html += `<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px;">${i + 1}. ${esc(pt.title)}</div>`
      html += `<div style="font-size:13px;color:#475569;white-space:pre-line;margin-bottom:6px;">${esc(pt.detail)}</div>`
      html += `<div style="font-size:13px;font-weight:500;color:#1e293b;">${esc(pt.action)}</div>`
      html += `</div>`
    })
  }

  // Top Opportunities table
  if (p.top_opportunities.length > 0) {
    html += `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin:16px 0 8px;border-bottom:2px solid #1e293b;padding-bottom:4px;">Your Top Opportunities</h3>`
    html += `<table style="border-collapse:collapse;width:100%;margin-bottom:20px;">`
    html += `<tr><th style="${headerStyle}">Opportunity</th><th style="${headerStyle}text-align:right;">Value</th><th style="${headerStyle}">Stage</th><th style="${headerStyle}">Signal</th></tr>`
    p.top_opportunities.slice(0, 5).forEach(o => {
      html += `<tr>`
      html += `<td style="${cellStyle}font-weight:500;">${esc(o.name)}</td>`
      html += `<td style="${numStyle}font-weight:600;">${esc(formatCurrency(o.amount, true))}</td>`
      html += `<td style="${cellStyle}">${esc(o.stage)}</td>`
      html += `<td style="${cellStyle}color:#64748b;font-size:12px;">${esc(o.reasons[0] || '—')}</td>`
      html += `</tr>`
    })
    html += `</table>`
  }

  // Overdue Tasks — grouped by urgency
  const overdue = p.tasks.open_tasks.filter(t => t.overdue)
  if (overdue.length > 0) {
    const atRisk = overdue.filter(t => (t.opp_amount || 0) >= 3000)
    const stale = overdue.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) >= 30)
    const recent = overdue.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) < 30)

    html += `<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin:0 0 8px;border-bottom:2px solid #1e293b;padding-bottom:4px;">Overdue Tasks (${overdue.length})</h3>`

    const addGroup = (label: string, color: string, action: string, tasks: typeof overdue) => {
      if (tasks.length === 0) return
      html += `<div style="margin-bottom:16px;">`
      html += `<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:2px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle;"></span>${label} (${tasks.length})</div>`
      html += `<div style="font-size:12px;color:#64748b;margin-bottom:6px;">${action}</div>`
      html += `<table style="border-collapse:collapse;width:100%;">`
      tasks.slice(0, 5).forEach(t => {
        html += `<tr style="border-bottom:1px solid #f1f5f9;">`
        html += `<td style="padding:4px 8px;font-size:12px;font-weight:500;color:#1e293b;">${esc(t.subject)}</td>`
        html += `<td style="padding:4px 8px;font-size:12px;color:#64748b;">${esc(t.related_to || '—')}</td>`
        html += `<td style="padding:4px 8px;font-size:12px;text-align:right;color:#64748b;">${t.opp_amount ? esc(formatCurrency(t.opp_amount, true)) : '—'}</td>`
        html += `<td style="padding:4px 8px;font-size:12px;text-align:right;color:#dc2626;font-weight:600;">${t.days_overdue != null ? `${t.days_overdue}d` : '—'}</td>`
        html += `</tr>`
      })
      html += `</table>`
      if (tasks.length > 5) html += `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">+ ${tasks.length - 5} more</div>`
      html += `</div>`
    }

    addGroup('Deals at Risk — Do These First', '#dc2626', 'These are tied to active deals. A missed follow-up could mean a lost sale.', atRisk)
    addGroup('Stale — Over 30 Days Overdue', '#d97706', 'These have been sitting for a while. Close them out or reassign.', stale)
    addGroup('Recently Overdue — Quick Wins', '#60a5fa', 'Just a few days late. Knock these out or update the due dates.', recent)
  }

  // Footer
  html += `<p style="font-size:14px;margin:16px 0 4px;">Let's discuss during our next 1:1. Let me know if you have any questions.</p>`
  html += `<p style="font-size:11px;color:#94a3b8;margin:16px 0 0;border-top:1px solid #e2e8f0;padding-top:8px;">Generated by SalesInsight &middot; ${esc(date)}</p>`
  html += `</div>`

  return html
}

/* ── Copy HTML to clipboard so it pastes as rich text in Outlook ──────────── */

export async function copyHtmlToClipboard(html: string): Promise<void> {
  const blob = new Blob([html], { type: 'text/html' })
  const item = new ClipboardItem({ 'text/html': blob })
  await navigator.clipboard.write([item])
}
