import { formatCurrency, formatPct, cn } from '@/lib/utils'
import {
  X, Printer, Copy, Check, AlertTriangle,
  Mail,
} from 'lucide-react'
import { useState } from 'react'
import type { AgentProfile, AchievementData, FocusArea, TaskItem } from './briefing/types'
import { generateFocusAreas } from './briefing/focus-areas'
import { buildAdvisorEmailHtml, copyHtmlToClipboard } from './briefing/email-builder'

/* ── Re-export types so existing consumers still work ─────────────────────── */
export type { AgentProfile, AchievementData, FocusArea }

/* ── Component ────────────────────────────────────────────────────────────── */

export default function ManagerBriefing({
  profile,
  achievement,
  onClose,
}: {
  profile: AgentProfile
  achievement?: AchievementData | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const pts = generateFocusAreas(profile)
  const s = profile.summary
  const yoy = profile.yoy
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const overdueTasks = profile.tasks.open_tasks.filter(t => t.overdue)
  const firstName = profile.name.split(/[,\s]+/)[0]

  const handlePrint = () => window.print()

  const handleCopy = () => {
    const html = buildAdvisorEmailHtml(profile, pts, today)
    copyHtmlToClipboard(html).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const handleEmail = () => {
    const html = buildAdvisorEmailHtml(profile, pts, today)
    const subject = `Performance Summary — ${profile.name} — ${today}`
    const to = profile.email || ''
    // Copy rich HTML to clipboard (M365 deep link can't handle long body)
    copyHtmlToClipboard(html).then(() => {
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 8000)
    }).catch(() => {})
    // Open M365 Outlook compose in browser (to + subject only)
    const url = `https://outlook.cloud.microsoft/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}`
    window.open(url, '_blank')
  }

  const priorityStyles = {
    high: 'border-l-rose-500 bg-rose-500/5',
    medium: 'border-l-amber-500 bg-amber-500/5',
    low: 'border-l-emerald-500 bg-emerald-500/5',
  }
  const priorityLabel = {
    high: 'ACTION NEEDED',
    medium: 'REVIEW',
    low: 'POSITIVE',
  }
  const priorityColor = {
    high: 'text-rose-600',
    medium: 'text-amber-600',
    low: 'text-emerald-600',
  }

  return (
    <div className="print-briefing fixed inset-0 z-[100] overflow-y-auto bg-white text-slate-900 dark:bg-white dark:text-slate-900">
      {/* ── Toolbar (hidden in print) ── */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
        <span className="text-sm font-semibold text-slate-600">
          Performance Summary for {profile.name}
          {profile.email && (
            <span className="ml-2 text-xs font-normal text-slate-400">{profile.email}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEmail}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Mail className="h-3.5 w-3.5" /> Email to Advisor
          </button>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy Text'}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </button>
          <button
            onClick={onClose}
            className="ml-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Clipboard toast ── */}
      {emailCopied && (
        <div className="no-print animate-enter mx-auto mt-3 flex max-w-[520px] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 shadow-md">
          <Check className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-emerald-900">
            <b>Email body copied!</b>{' '}
            Paste into the Outlook window ({navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+V)
          </div>
        </div>
      )}

      {/* ── Printable Content ── */}
      <div className="mx-auto max-w-[800px] px-8 py-8">
        {/* Header */}
        <div className="mb-6 border-b-2 border-slate-900 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Performance Summary
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {firstName}, here is your performance overview for {profile.line} Division &middot; {today}
          </p>
        </div>

        {/* Performance Snapshot */}
        <div className="mb-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
            Your Numbers
          </h2>
          <div className="grid grid-cols-4 gap-4">
            <MetricBox label="Revenue" value={formatCurrency(s.revenue, true)} delta={`${yoy.revenue_pct > 0 ? '+' : ''}${yoy.revenue_pct.toFixed(1)}% YoY`} positive={yoy.revenue_pct > 0} />
            <MetricBox label="Deals Won" value={String(s.deals)} delta={`${yoy.deals_pct > 0 ? '+' : ''}${yoy.deals_pct.toFixed(1)}% YoY`} positive={yoy.deals_pct > 0} />
            <MetricBox label="Win Rate" value={formatPct(s.win_rate)} delta={`Team: ${formatPct(profile.team.win_rate)}`} positive={s.win_rate >= profile.team.win_rate} />
            <MetricBox label="Pipeline" value={formatCurrency(s.pipeline_value, true)} delta={s.coverage >= 2 ? 'Healthy' : 'Needs more deals'} positive={s.coverage >= 2} />
          </div>
          <div className="mt-3 flex gap-6 text-xs text-slate-500">
            <span>Avg Deal: <b className="text-slate-700">{formatCurrency(s.avg_deal, true)}</b> (team: {formatCurrency(profile.team.avg_deal, true)})</span>
            <span>Leads: <b className="text-slate-700">{s.leads}</b></span>
            <span>Opps Created: <b className="text-slate-700">{s.opps_created}</b></span>
          </div>
        </div>

        {/* Target Achievement */}
        {achievement && (achievement.monthly.target > 0 || achievement.yearly.target > 0) && (
          <div className="mb-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Target Achievement
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {achievement.monthly.target > 0 && (
                <PrintProgressBar
                  label={achievement.monthLabel}
                  actual={achievement.monthly.actual}
                  target={achievement.monthly.target}
                  achievementPct={Math.min((achievement.monthly.actual / achievement.monthly.target) * 100, 100)}
                  pacePct={achievement.monthlyPacePct}
                  paceLabel={achievement.dayLabel}
                  color="#6366f1"
                />
              )}
              {achievement.yearly.target > 0 && (
                <PrintProgressBar
                  label={achievement.yearLabel}
                  actual={achievement.yearly.actual}
                  target={achievement.yearly.target}
                  achievementPct={Math.min((achievement.yearly.actual / achievement.yearly.target) * 100, 100)}
                  pacePct={achievement.yearly.pace_pct}
                  paceLabel={`Month ${achievement.monthOfYear}/12`}
                  color="#10b981"
                />
              )}
            </div>
          </div>
        )}

        {/* AI Summary */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
            Summary
          </h2>
          <p className="text-sm leading-relaxed text-slate-700">{profile.writeup}</p>
        </div>

        {/* Focus Areas */}
        {pts.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Focus Areas
            </h2>
            <div className="space-y-3">
              {pts.map((pt, i) => (
                <div key={i} className={cn('rounded-lg border-l-4 px-4 py-3', priorityStyles[pt.priority])}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider', priorityColor[pt.priority])}>
                      {priorityLabel[pt.priority]}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900">{pt.title}</h3>
                  </div>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600">
                    {pt.detail}
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-800">
                    {pt.action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opportunities to Focus On */}
        {profile.top_opportunities.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
              Your Top Opportunities ({profile.top_opportunities.length})
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 pr-2 font-semibold text-slate-500">Priority</th>
                  <th className="pb-2 pr-2 font-semibold text-slate-500">Opportunity</th>
                  <th className="pb-2 pr-2 text-right font-semibold text-slate-500">Value</th>
                  <th className="pb-2 pr-2 font-semibold text-slate-500">Stage</th>
                  <th className="pb-2 pr-2 font-semibold text-slate-500">Close</th>
                  <th className="pb-2 font-semibold text-slate-500">Key Signal</th>
                </tr>
              </thead>
              <tbody>
                {profile.top_opportunities.slice(0, 10).map((opp) => (
                  <tr key={opp.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <span className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white',
                        opp.score >= 80 ? 'bg-emerald-500' : opp.score >= 60 ? 'bg-amber-500' : 'bg-rose-400',
                      )}>
                        {opp.score.toFixed(0)}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-2 font-medium text-slate-800">
                      {opp.name}
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(opp.amount, true)}
                    </td>
                    <td className="py-2 pr-2 text-slate-600">{opp.stage}</td>
                    <td className="py-2 pr-2 tabular-nums text-slate-600">
                      {opp.close_date ? new Date(opp.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="py-2 text-slate-500">{opp.reasons[0] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Overdue Tasks — grouped by urgency */}
        {overdueTasks.length > 0 && (() => {
          const atRisk = overdueTasks.filter(t => (t.opp_amount || 0) >= 3000)
          const stale = overdueTasks.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) >= 30)
          const recent = overdueTasks.filter(t => (t.opp_amount || 0) < 3000 && (t.days_overdue || 0) < 30)

          const TaskGroup = ({ label, color, action, tasks }: {
            label: string; color: string; action: string; tasks: TaskItem[]
          }) => tasks.length === 0 ? null : (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn('inline-block h-2.5 w-2.5 rounded-full', color)} />
                <span className="text-xs font-bold text-slate-700">{label} ({tasks.length})</span>
              </div>
              <p className="mb-2 text-[11px] text-slate-500">{action}</p>
              <table className="w-full text-xs">
                <tbody>
                  {tasks.slice(0, 5).map((t) => (
                    <tr key={t.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{t.subject}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{t.related_to || '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">
                        {t.opp_amount != null && t.opp_amount > 0 ? formatCurrency(t.opp_amount, true) : '—'}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-rose-600">
                        {t.days_overdue != null ? `${t.days_overdue}d` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tasks.length > 5 && (
                <p className="mt-1 text-[10px] text-slate-400">+ {tasks.length - 5} more</p>
              )}
            </div>
          )

          return (
            <div className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                Overdue Tasks ({overdueTasks.length})
              </h2>
              <TaskGroup
                label="Deals at Risk — Do These First"
                color="bg-rose-500"
                action="These are tied to active deals. A missed follow-up could mean a lost sale."
                tasks={atRisk}
              />
              <TaskGroup
                label="Stale — Over 30 Days Overdue"
                color="bg-amber-500"
                action="These have been sitting for a while. Close them out if they're no longer relevant, or reassign."
                tasks={stale}
              />
              <TaskGroup
                label="Recently Overdue — Quick Wins"
                color="bg-blue-400"
                action="Just a few days late. Knock these out or update the due dates."
                tasks={recent}
              />
            </div>
          )
        })()}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
          Generated by SalesInsight &middot; {today} &middot; Data from Salesforce
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function MetricBox({ label, value, delta, positive }: {
  label: string; value: string; delta: string; positive: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      <span className={cn(
        'text-[11px] font-medium',
        positive ? 'text-emerald-600' : 'text-rose-600',
      )}>
        {delta}
      </span>
    </div>
  )
}

function PrintProgressBar({ label, actual, target, achievementPct, pacePct, paceLabel, color }: {
  label: string; actual: number; target: number
  achievementPct: number; pacePct: number; paceLabel: string; color: string
}) {
  const remaining = Math.max(target - actual, 0)
  const diff = achievementPct - pacePct
  const paceText = diff > 5 ? 'Ahead of pace ✓' : diff >= -5 ? 'On pace' : 'Behind pace ⚠'
  const paceColor = diff > 5 ? '#059669' : diff >= -5 ? '#d97706' : '#dc2626'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {formatCurrency(actual, true)}
          <span style={{ color: '#94a3b8', fontWeight: 400 }}> / {formatCurrency(target, true)}</span>
        </span>
      </div>
      {/* Bar track */}
      <div style={{ position: 'relative', height: 24, borderRadius: 12, backgroundColor: `${color}18`, overflow: 'hidden' }}>
        {/* Actual fill */}
        <div style={{
          position: 'absolute', inset: 0, right: `${Math.max(100 - achievementPct, 0)}%`,
          borderRadius: 12, backgroundColor: color, opacity: 0.75,
        }} />
        {/* Pace marker */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: `${pacePct}%`, width: 2,
          backgroundColor: 'white', opacity: 0.8, zIndex: 2,
        }} />
        {/* Percentage label */}
        {achievementPct >= 12 && (
          <span style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
            left: `${Math.max(achievementPct - 6, 2)}%`,
            fontSize: 11, fontWeight: 700, color: 'white',
          }}>
            {achievementPct.toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span style={{ color: paceColor, fontWeight: 600, marginLeft: `${Math.max(pacePct - 6, 0)}%` }}>
          ▲ {paceLabel} — {paceText}
        </span>
        <span style={{ color: '#94a3b8' }}>{formatCurrency(remaining, true)} to go</span>
      </div>
    </div>
  )
}
