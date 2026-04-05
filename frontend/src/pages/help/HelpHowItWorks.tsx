/**
 * HelpHowItWorks — Sales workflow, data architecture, expandable topics.
 * Exports: FieldTag, SectionHeader, InfoCard, FlowStep + default HowItWorksSection.
 */

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, CheckCircle2,
  Zap, DollarSign, Users, Workflow, Server, Globe,
} from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'

/* ── Framer Motion helpers ──────────────────────────────────────────────── */
const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }
const stagger = (n = 0.06) => ({ hidden: {}, show: { transition: { staggerChildren: n } } })
const collapse = {
  hidden:  { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18 } },
}

/* ── Shared primitives (exported) ───────────────────────────────────────── */

export function FieldTag({ name, className }: { name: string; className?: string }) {
  return (
    <code className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono',
      'bg-primary/10 text-primary border border-primary/20',
      className,
    )}>
      {name}
    </code>
  )
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function InfoCard({ title, icon: Icon, color, children }: {
  title: string; icon: React.FC<{ className?: string }>; color: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center border', color)}>
          <Icon className="w-4 h-4" />
        </div>
        <h4 className="font-semibold text-sm text-foreground">{title}</h4>
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

export function FlowStep({ number, color, icon: Icon, title, children }: {
  number: number; color: string; icon: React.FC<{ className?: string }>; title: string; children: React.ReactNode
}) {
  return (
    <motion.div className="flex gap-4"
      initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: (number - 1) * 0.1 }}>
      <div className="flex flex-col items-center">
        <motion.div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border', color)}
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: (number - 1) * 0.1 + 0.05 }}>
          <Icon className="w-5 h-5" />
        </motion.div>
        <div className="w-0.5 flex-1 bg-border mt-2" />
      </div>
      <div className="pb-8 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Step {number}</span>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2">{children}</div>
      </div>
    </motion.div>
  )
}

/* ── Pipeline Visual data ───────────────────────────────────────────────── */
const PIPELINE_STEPS = [
  { label: 'Lead Created',  sub: 'SF Lead Object',   color: 'bg-blue-500',    fields: ['CreatedDate', 'LeadSource', 'RecordTypeId'] },
  { label: 'Contacted',     sub: 'Status Update',    color: 'bg-cyan-500',    fields: ['Status', 'OwnerId'] },
  { label: 'Qualified',     sub: 'Intent Confirmed', color: 'bg-violet-500',  fields: ['Status = Qualified'] },
  { label: 'Converted',     sub: 'Opp Created',      color: 'bg-indigo-500',  fields: ['IsConverted', 'ConvertedDate'] },
  { label: 'Proposal',      sub: 'Deal in Progress', color: 'bg-amber-500',   fields: ['Amount', 'CloseDate', 'StageName'] },
  { label: 'Closed Won',    sub: 'Booking Captured', color: 'bg-emerald-500', fields: ['Amount', 'StageName'] },
  { label: 'Invoice',       sub: 'Service Delivered',color: 'bg-emerald-600', fields: ['Earned_Commission_Amount__c'] },
  { label: 'Commission',    sub: 'Revenue Earned',   color: 'bg-primary',     fields: ['Earned_Comm…', '+2-3 mo lag'] },
]

/* ── Expandable Topics ──────────────────────────────────────────────────── */
const TOPICS = [
  {
    id: 'arch',
    color: 'bg-blue-500/15 border-blue-500/25',
    iconColor: 'text-blue-400',
    borderAccent: 'border-blue-800/30',
    icon: Server,
    title: '1. Data Architecture',
    subtitle: 'How Salesforce data flows to your dashboard in real time',
  },
  {
    id: 'divisions',
    color: 'bg-emerald-500/15 border-emerald-500/25',
    iconColor: 'text-emerald-400',
    borderAccent: 'border-emerald-800/30',
    icon: Globe,
    title: '2. Travel vs Insurance Divisions',
    subtitle: 'Two business lines, one platform — key differences in data and metrics',
  },
  {
    id: 'workflow',
    color: 'bg-violet-500/15 border-violet-500/25',
    iconColor: 'text-violet-400',
    borderAccent: 'border-violet-800/30',
    icon: Workflow,
    title: '3. Lead-to-Close Workflow',
    subtitle: 'Step-by-step walkthrough of the full sales cycle in Salesforce',
  },
  {
    id: 'agents',
    color: 'bg-amber-500/15 border-amber-500/25',
    iconColor: 'text-amber-400',
    borderAccent: 'border-amber-800/30',
    icon: Users,
    title: '4. Agent Lists & Whitelist Logic',
    subtitle: 'How the app determines which people are sales agents vs support staff',
  },
  {
    id: 'ai',
    color: 'bg-primary/15 border-primary/25',
    iconColor: 'text-primary',
    borderAccent: 'border-primary/30',
    icon: Zap,
    title: '5. AI Features',
    subtitle: 'Opportunity scoring, deal write-ups, and auto-generated insights',
  },
]

function TopicContent({ id }: { id: string }) {
  if (id === 'arch') return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { step: '1', label: 'Salesforce', desc: 'Source of truth. All Opportunities, Leads, Users, and RecordTypes live here.', color: 'border-blue-500/30 bg-blue-500/5' },
          { step: '2', label: 'FastAPI Backend', desc: 'Python server queries SF via REST API, applies business logic, and serves data to the frontend.', color: 'border-violet-500/30 bg-violet-500/5' },
          { step: '3', label: 'Cache (L1 + L2)', desc: 'L1: in-memory per worker (1 hr). L2: disk cache at ~/.salesinsight/cache/ (24 hr). Eliminates redundant SF calls.', color: 'border-amber-500/30 bg-amber-500/5' },
        ].map(s => (
          <div key={s.step} className={clsx('rounded-xl border p-4', s.color)}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Layer {s.step}</div>
            <div className="font-semibold text-sm text-foreground mb-1">{s.label}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-2">Cache Keys</div>
        <p className="text-xs text-muted-foreground">Every cache key includes the date range and division:
          <FieldTag name={`advisor_leaderboard_Travel_2024-01-01_2024-12-31`} className="ml-1" />.
          Changing the date filter always fetches fresh data.
        </p>
      </div>
    </div>
  )

  if (id === 'divisions') return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-xl border-2 border-blue-500/30 overflow-hidden">
        <div className="bg-blue-500/10 px-4 py-3 border-b border-blue-500/20">
          <span className="font-bold text-sm text-blue-500">✈  Travel Division</span>
          <code className="text-[9px] text-blue-400/70 mt-1 block">RecordTypeId = '012Pb0000006hIjIAI'</code>
        </div>
        <div className="p-4 space-y-2.5 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">Revenue metric:</span> <FieldTag name="Amount" /> = gross booking value (trips, tours, packages). Typically <strong>~$44M/yr</strong>.</p>
          <p><span className="font-medium text-foreground">Commission:</span> <FieldTag name="Earned_Commission_Amount__c" /> ≈ 18.7% of bookings. Lags 2-3 months — populated at Invoice stage.</p>
          <p><span className="font-medium text-foreground">Won stages:</span> <FieldTag name="Closed Won" /> and <FieldTag name="Invoice" /> both count as revenue.</p>
          <p><span className="font-medium text-foreground">Agents:</span> Profile IN (Travel User, Support User) filtered by title keywords (TSC, Travel Advisor).</p>
        </div>
      </div>
      <div className="rounded-xl border-2 border-emerald-500/30 overflow-hidden">
        <div className="bg-emerald-500/10 px-4 py-3 border-b border-emerald-500/20">
          <span className="font-bold text-sm text-emerald-500">🛡  Insurance Division</span>
          <code className="text-[9px] text-emerald-500/70 mt-1 block">RecordTypeId = '012Pb0000006hIgIAI'</code>
        </div>
        <div className="p-4 space-y-2.5 text-xs text-muted-foreground">
          <p><span className="font-medium text-foreground">Revenue metric:</span> <FieldTag name="Amount" /> = insurance premium. Typically <strong>~$12M/yr</strong>.</p>
          <p><span className="font-medium text-foreground">Commission:</span> Not tracked via <FieldTag name="Earned_Commission_Amount__c" /> (always $0). Amount IS the revenue.</p>
          <p><span className="font-medium text-foreground">Won stages:</span> Only <FieldTag name="Closed Won" /> — the "Invoice" stage is Travel-only.</p>
          <p><span className="font-medium text-foreground">Agents:</span> Profile = Insurance User, excluding manager/supervisor/QC/training titles.</p>
        </div>
      </div>
    </div>
  )

  if (id === 'workflow') return (
    <div className="space-y-4">
      {[
        { n: 1, icon: Users, color: 'bg-blue-500/15 border-blue-500/30 text-blue-500', title: 'Lead Enters SF', body: 'Created via web form, referral, phone, or marketing campaign. RecordType (Travel/Insurance) and LeadSource are set.', fields: ['CreatedDate', 'LeadSource', 'RecordTypeId', 'OwnerId'] },
        { n: 2, icon: CheckCircle2, color: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-500', title: 'Advisor Works the Lead', body: 'Status moves Open → Contacted → Working → Qualified. Each status change is tracked in SF History.', fields: ['Status', 'LastActivityDate'] },
        { n: 3, icon: Zap, color: 'bg-violet-500/15 border-violet-500/30 text-violet-500', title: 'Lead Converts → Opportunity', body: 'Qualified lead converts. A new Opportunity is created with the same RecordType and owner. The Lead is marked IsConverted = true.', fields: ['IsConverted', 'ConvertedDate', 'Opportunity.CreatedDate'] },
        { n: 4, icon: DollarSign, color: 'bg-amber-500/15 border-amber-500/30 text-amber-500', title: 'Opportunity Advances Stages', body: 'Advisor moves the deal through stages — Prospecting → Qualification → Proposal → Negotiation. Amount and CloseDate are updated.', fields: ['StageName', 'Amount', 'CloseDate', 'PushCount'] },
        { n: 5, icon: CheckCircle2, color: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500', title: 'Closed Won / Invoice', body: 'Deal is booked. Amount captures booking value. For Travel, deal moves to Invoice when service is delivered — Earned_Commission_Amount__c is populated 2-3 months later.', fields: ['StageName', 'Amount', 'Earned_Commission_Amount__c'] },
      ].map(({ n, icon: Icon, color, title, body, fields }) => (
        <div key={n} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border', color)}>
              <Icon className="w-4 h-4" />
            </div>
            {n < 5 && <div className="w-0.5 flex-1 bg-border mt-2" />}
          </div>
          <div className="pb-5 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">0{n}</span>
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{body}</p>
            <div className="flex flex-wrap gap-1">
              {fields.map(f => <FieldTag key={f} name={f} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  if (id === 'agents') return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard title="Travel Agent Rule" icon={Users} color="bg-blue-500/15 border-blue-500/30 text-blue-500">
          <p>Queried from SF at startup: <FieldTag name="Profile.Name IN ('Travel User','Support User')" /></p>
          <p>Then filtered by title: included if title contains <strong>TSC</strong> or <strong>Travel Advisor</strong>, BUT excluded if title contains <em>Member Experience</em>, <em>Call Center</em>, or <em>Group Travel</em>.</p>
          <p className="text-amber-500">No hardcoded list — when HR changes SF User profiles, restart the backend to pick it up.</p>
        </InfoCard>
        <InfoCard title="Insurance Agent Rule" icon={Users} color="bg-emerald-500/15 border-emerald-500/30 text-emerald-500">
          <p>Queried from SF at startup: <FieldTag name="Profile.Name = 'Insurance User'" /></p>
          <p>Excluded if title contains: <em>manager, supervisor, quality control, training, specialist, administrator, coordinator</em>.</p>
          <p className="text-amber-500">Same dynamic rule — SF User changes take effect on next backend restart.</p>
        </InfoCard>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Why this matters:</strong> The leaderboard and monthly reports
          filter out non-sales staff (managers, admins, QC) who appear in SF but don't sell.
          Only whitelisted agents appear in rankings. Agents with $0 revenue in the period are also hidden.
        </p>
      </div>
    </div>
  )

  if (id === 'ai') return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InfoCard title="Opportunity Scoring" icon={Zap} color="bg-primary/15 border-primary/30 text-primary">
        <p>Each open deal gets a 0–100 priority score using a weighted formula:</p>
        <ul className="space-y-1 mt-1">
          {[
            ['Amount',            '35%', 'Logarithmic scale vs division max'],
            ['Days in Stage',     '25%', 'Decays as deal sits without advancing'],
            ['Close Proximity',   '20%', 'Deals closing within 30 days score higher'],
            ['Activity Recency',  '15%', 'Days since last SF activity'],
            ['Push Count',        '5%',  'Penalty for deals pushed 3+ times'],
          ].map(([k, w, d]) => (
            <li key={k} className="flex items-start gap-1.5 text-[11px]">
              <span className="text-primary font-bold shrink-0">{w}</span>
              <span><strong>{k}</strong> — {d}</span>
            </li>
          ))}
        </ul>
      </InfoCard>
      <InfoCard title="AI Narrative & Insights" icon={Zap} color="bg-amber-500/15 border-amber-500/30 text-amber-500">
        <p><strong>Deal Write-ups:</strong> GPT-4o generates a 2-3 sentence summary for top-scored opportunities, explaining why it's a priority and suggesting next steps.</p>
        <p><strong>Auto Insights:</strong> The Insights panel auto-generates findings from your data — top performer, agents below win-rate threshold, pipeline health, at-risk deals.</p>
        <p><strong>Manager Briefing:</strong> Generates a structured email-ready briefing covering KPIs, trends, and actions for the week.</p>
      </InfoCard>
    </div>
  )

  return null
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function HowItWorksSection() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id)

  return (
    <div>
      <SectionHeader
        title="How It Works"
        subtitle="End-to-end guide — how Salesforce data flows into SalesInsight, the full sales lifecycle, and key features."
      />

      {/* ── Sales Pipeline Visual ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card/50 p-5 mt-4 mb-6 overflow-x-auto">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-4">
          Sales Pipeline — Lead to Revenue
        </h3>
        <motion.div className="flex items-start gap-0 min-w-[860px]" variants={stagger(0.08)} initial="hidden" animate="show">
          {PIPELINE_STEPS.map((step, i, arr) => (
            <motion.div key={step.label} className="flex items-start flex-1 min-w-0" variants={fadeUp}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
              <div className="flex flex-col items-center text-center w-full">
                <motion.div className={clsx('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md', step.color)}
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: i * 0.08 + 0.1 }}>
                  {i + 1}
                </motion.div>
                <div className="mt-2 font-semibold text-[11px] text-foreground">{step.label}</div>
                <div className="text-[9px] text-muted-foreground/60 mt-0.5">{step.sub}</div>
                <div className="mt-2 flex flex-col gap-1 items-center">
                  {step.fields.map(f => (
                    <code key={f} className="text-[8px] text-primary/70 bg-primary/5 border border-primary/15 rounded px-1.5 py-0.5 whitespace-nowrap">{f}</code>
                  ))}
                </div>
              </div>
              {i < arr.length - 1 && (
                <motion.div className="flex items-center pt-3 px-0.5 shrink-0"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 + 0.15 }}>
                  <ChevronRight className="w-4 h-4 text-border" />
                </motion.div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Expandable Topics ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {TOPICS.map(topic => (
          <div key={topic.id} className="space-y-3">
            <button onClick={() => toggle(topic.id)}
              className="w-full flex items-center gap-3 rounded-xl border border-border bg-card/50 p-4 hover:border-primary/30 transition-all text-left">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border', topic.color)}>
                <topic.icon className={clsx('w-5 h-5', topic.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-foreground">{topic.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{topic.subtitle}</p>
              </div>
              <ChevronDown className={clsx('w-4 h-4 text-muted-foreground/50 transition-transform shrink-0', expanded === topic.id && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {expanded === topic.id && (
                <motion.div
                  className={clsx('ml-4 pl-4 border-l-2', topic.borderAccent)}
                  variants={collapse} initial="hidden" animate="visible" exit="exit">
                  <TopicContent id={topic.id} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  )
}
