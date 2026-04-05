/**
 * HelpGuides — Page-by-Page Guide + How Advisors Are Ranked.
 */

import { useState } from 'react'
import {
  LayoutDashboard, Table2, Target, GitBranch, Plane, Megaphone,
  Users, Trophy, ChevronDown, ArrowRight, Filter, Star,
} from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { SectionHeader, FieldTag, InfoCard } from './HelpHowItWorks'

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }
const stagger = (n = 0.06) => ({ hidden: {}, show: { transition: { staggerChildren: n } } })
const collapse = {
  hidden:  { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18 } },
}

/* ── Page Guide data ────────────────────────────────────────────────────── */
const PAGES = [
  {
    icon: LayoutDashboard,
    label: 'Sales Dashboard', route: '/',
    color: 'bg-blue-500/10 border-blue-500/30 text-blue-500',
    whatToLook: [
      'KPI cards at the top — compare current vs prior period for revenue, deals, and win rate.',
      'YoY chart — look for months where current year trails the prior year line.',
      'Leaderboard — who is above their target? Who fell off the top 5 compared to last month?',
      'AI Insights panel — acts as an early-warning system for pipeline gaps and agent coaching needs.',
      'At-Risk Deals — any deal past its close date needs immediate attention.',
    ],
    whenToAct: 'Use daily. Check at the start of each week and after month-end to identify coaching priorities.',
    fields: ['Amount', 'StageName', 'CloseDate', 'Owner.Name', 'RecordTypeId'],
  },
  {
    icon: Table2,
    label: 'Monthly Report', route: '/monthly',
    color: 'bg-violet-500/10 border-violet-500/30 text-violet-500',
    whatToLook: [
      'Each row = one advisor. Columns = Leads, Opps, Invoiced, Inv/Opp%, Sales, Commission.',
      'Inv/Opp% below 50% signals deals entering the pipeline but not converting — coaching needed.',
      'Compare totals row against your divisional target.',
      'Sort by Sales descending to quickly find top performers and laggards.',
    ],
    whenToAct: 'Use monthly for performance reviews. Use mid-month to spot advisors falling behind.',
    fields: ['Owner.Name', 'CALENDAR_MONTH(CloseDate)', 'Amount', 'Earned_Commission_Amount__c'],
  },
  {
    icon: Target,
    label: 'Top Opportunities', route: '/top-opps',
    color: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
    whatToLook: [
      'Priority Score (0-100) — higher = more urgent. Deals decay as they sit without activity.',
      'Days in Stage — a deal in "Proposal" for 30+ days is stalling. Schedule a call.',
      'AI Write-up — read the narrative to understand why a deal is ranked high.',
      'Push Count > 2 — deal has been moved forward multiple times. May need reassignment.',
    ],
    whenToAct: 'Review weekly. Share the top 10 with advisors in pipeline reviews.',
    fields: ['Amount', 'StageName', 'LastActivityDate', 'PushCount', 'CloseDate'],
  },
  {
    icon: GitBranch,
    label: 'Pipeline & Forecasting', route: '/pipeline',
    color: 'bg-primary/10 border-primary/30 text-primary',
    whatToLook: [
      'Pipeline Coverage — should be 2x+ your revenue target. Below 1x is critical.',
      'Stage Distribution — healthy pipeline has deals spread across stages, not all in Prospecting.',
      'Slipping Deals — open deals past their close date are your biggest risk.',
      'Funnel chart — conversion rate from Lead → Won. Low conversion = process issue.',
    ],
    whenToAct: 'Review weekly with sales managers. Use before board meetings for forecasting.',
    fields: ['StageName', 'ForecastCategory', 'Amount', 'CloseDate', 'IsClosed'],
  },
  {
    icon: Plane,
    label: 'Travel Analytics', route: '/destinations',
    color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500',
    whatToLook: [
      'Top destinations by revenue — which markets are growing vs declining YoY?',
      'Seasonal heatmap — identify which months are strongest for which destinations.',
      'Party size trends — larger groups = higher-value bookings.',
    ],
    whenToAct: 'Use quarterly for marketing planning and advisor training. Travel division only.',
    fields: ['Destination_Region__c', 'Amount', 'CloseDate', 'RecordTypeId = Travel'],
  },
  {
    icon: Megaphone,
    label: 'Lead Funnel', route: '/leads',
    color: 'bg-rose-500/10 border-rose-500/30 text-rose-500',
    whatToLook: [
      'Expired lead rate — if > 15%, advisors are not following up within SLA.',
      'Source effectiveness — which lead sources convert at the highest rate?',
      'Time to convert — how many days from lead creation to opportunity? Longer = slower process.',
      'Agent close speed — which advisors convert leads fastest?',
    ],
    whenToAct: 'Review monthly. Spikes in expiry rate signal staffing or process problems.',
    fields: ['Status', 'IsConverted', 'ConvertedDate', 'LeadSource', 'CreatedDate'],
  },
]

/* ── Overview Section ───────────────────────────────────────────────────── */
export function OverviewSection() {
  const [openPage, setOpenPage] = useState<string | null>(null)

  return (
    <div>
      <SectionHeader
        title="Page-by-Page Guide"
        subtitle="What each section shows, what to look for, and when to take action."
      />
      <motion.div className="space-y-3 mt-4" variants={stagger(0.05)} initial="hidden" animate="show">
        {PAGES.map(p => (
          <motion.div key={p.label} className="rounded-xl border border-border bg-card/50 overflow-hidden"
            variants={fadeUp} transition={{ type: 'spring' as const, stiffness: 300, damping: 24 }}>
            <button
              onClick={() => setOpenPage(openPage === p.label ? null : p.label)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-secondary/20 transition-colors text-left">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border', p.color)}>
                <p.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-foreground">{p.label}</h3>
                <code className="text-[10px] text-muted-foreground/50">{p.route}</code>
              </div>
              <ChevronDown className={clsx('w-4 h-4 text-muted-foreground/40 transition-transform shrink-0', openPage === p.label && 'rotate-180')} />
            </button>

            <AnimatePresence initial={false}>
              {openPage === p.label && (
                <motion.div className="border-t border-border px-5 pb-5 pt-4 space-y-4"
                  variants={collapse} initial="hidden" animate="visible" exit="exit">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">
                      What to look for
                    </p>
                    <ul className="space-y-1.5">
                      {p.whatToLook.map(w => (
                        <li key={w} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-primary/50" />
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary/60 mb-1">When to act</p>
                    <p className="text-xs text-foreground/80">{p.whenToAct}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">Key SF fields</p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.fields.map(f => <FieldTag key={f} name={f} />)}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

/* ── Scoring dimensions ─────────────────────────────────────────────────── */
const RANK_DIMENSIONS = [
  { key: 'revenue',    label: 'Total Revenue (Bookings)', weight: '—',   note: 'Primary sort key for the leaderboard. Higher bookings = higher rank.' },
  { key: 'deals',      label: 'Deal Count',               weight: 'context', note: 'Number of Closed Won + Invoice deals in the period.' },
  { key: 'win_rate',   label: 'Win Rate',                 weight: 'context', note: 'Won ÷ (Won + Lost). Open deals are excluded.' },
  { key: 'avg_deal',   label: 'Avg Deal Size',            weight: 'context', note: 'Revenue ÷ Deals. Higher = advisor closes more valuable clients.' },
  { key: 'pipeline',   label: 'Pipeline Value',           weight: 'context', note: 'Open deals with future close dates. Shows growth trajectory.' },
]

const FILTER_RULES = [
  { label: 'Zero-revenue filter', desc: 'Advisors with $0 total sales in the period are hidden — prevents support staff from cluttering the leaderboard.' },
  { label: 'Whitelist filter', desc: 'Only SF Users matching the profile + title rules are shown. Managers, QC, and admin roles are excluded.' },
  { label: 'Division filter', desc: 'Travel leaderboard uses RecordTypeId = Travel opportunities only. Insurance uses Insurance only. "All" combines both.' },
  { label: 'Date range filter', desc: 'Defaults to rolling 12 months (CloseDate >= today−12mo AND CloseDate <= today). Adjustable via date picker.' },
]

/* ── Scoring Section ────────────────────────────────────────────────────── */
export function ScoringSection() {
  return (
    <div>
      <SectionHeader
        title="How Advisors Are Ranked"
        subtitle="The leaderboard ranks advisors by revenue, with win rate and deal count as context metrics."
      />

      {/* Rank dimensions */}
      <motion.div className="space-y-3 mt-4" variants={stagger(0.05)} initial="hidden" animate="show">
        {RANK_DIMENSIONS.map(d => (
          <motion.div key={d.key}
            className="flex items-start gap-4 rounded-xl border border-border bg-card/50 p-4"
            variants={fadeUp} transition={{ type: 'spring' as const, stiffness: 300, damping: 24 }}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-foreground">{d.label}</span>
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full',
                  d.weight === '—'
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-muted text-muted-foreground border border-border',
                )}>
                  {d.weight === '—' ? 'Primary sort' : 'Context'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{d.note}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter rules */}
      <div className="mt-6 rounded-xl border border-border bg-card/50 overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-border">
          <Filter className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm text-foreground">Filter & Exclusion Rules</h3>
        </div>
        <div className="divide-y divide-border">
          {FILTER_RULES.map(r => (
            <div key={r.label} className="px-5 py-4">
              <h4 className="font-medium text-xs text-foreground mb-1">{r.label}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SOQL formula */}
      <div className="mt-4 rounded-xl border border-border bg-muted/30 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Star className="w-3.5 h-3.5 text-primary/60" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Leaderboard SOQL</span>
        </div>
        <pre className="text-[11px] text-primary/80 px-5 py-4 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">{`SELECT OwnerId, COUNT(Id) cnt,
       SUM(Amount) rev,
       SUM(Earned_Commission_Amount__c) comm
FROM Opportunity
WHERE StageName IN ('Closed Won','Invoice')
  AND RecordTypeId IN ('012Pb0000006hIjIAI',   -- Travel
                       '012Pb0000006hIgIAI')   -- Insurance
  AND CloseDate >= {sd} AND CloseDate <= {ed}
  AND Amount != null
GROUP BY OwnerId
ORDER BY SUM(Amount) DESC`}
        </pre>
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            Uses <FieldTag name="RecordTypeId" /> (direct indexed field) instead of <FieldTag name="RecordType.Name" /> for
            2-4× faster query execution — eliminates the cross-object join on every row.
          </p>
        </div>
      </div>

      {/* Advisor Targets note */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Target Achievement" icon={Trophy} color="bg-primary/15 border-primary/30 text-primary">
          <p>Monthly targets come from the <strong>AdvisorTarget</strong> table (local DB, not SF). Targets are set by admins in the Targets page.</p>
          <p>Achievement % = YTD actual ÷ YTD target. Progress bars show month-by-month vs target.</p>
        </InfoCard>
        <InfoCard title="Agent Source of Truth" icon={Users} color="bg-amber-500/15 border-amber-500/30 text-amber-500">
          <p>Agent names come directly from <FieldTag name="SF User.Name" /> via the <FieldTag name="OwnerId" /> field on each Opportunity.</p>
          <p>No hardcoded name lists. When SF user accounts change, the app picks it up on next backend restart.</p>
        </InfoCard>
      </div>
    </div>
  )
}
