/**
 * HelpContent — Metric Definitions (with SOQL) + Business Rules.
 */

import {
  BarChart3,
  CheckCircle2, TrendingDown, Zap,
  XCircle, ArrowRightLeft, DollarSign, Trophy, AlertTriangle, Star,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { SectionHeader } from './HelpHowItWorks'

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }
const stagger = (n = 0.05) => ({ hidden: {}, show: { transition: { staggerChildren: n } } })

/* ── Metrics data ───────────────────────────────────────────────────────── */
const METRICS = [
  {
    name: 'Total Bookings',
    icon: DollarSign,
    target: 'Travel ~$44M/yr · Insurance ~$12M/yr',
    what: 'Sum of Amount on all Closed Won + Invoice Opportunities in the selected period. For Travel, this is gross booking value. For Insurance, this is the premium amount.',
    formula: `SELECT SUM(Amount) rev
FROM Opportunity
WHERE StageName IN ('Closed Won','Invoice')
  AND RecordTypeId IN ('012Pb0000006hIjIAI',  -- Travel
                       '012Pb0000006hIgIAI')  -- Insurance
  AND CloseDate >= {sd} AND CloseDate <= {ed}
  AND Amount != null`,
  },
  {
    name: 'Commission Earned',
    icon: Trophy,
    target: 'Travel ~$6.6M/yr · Insurance: not tracked',
    what: 'Sum of Earned_Commission_Amount__c on won Opportunities. Travel only — Insurance Amount IS the commission. IMPORTANT: this field is populated 2-3 months after booking (at Invoice stage). Do not use for YoY comparisons — use Bookings instead.',
    formula: `SELECT SUM(Earned_Commission_Amount__c) comm
FROM Opportunity
WHERE StageName IN ('Closed Won','Invoice')
  AND RecordTypeId = '012Pb0000006hIjIAI'  -- Travel only
  AND CloseDate >= {sd} AND CloseDate <= {ed}
  AND Amount != null`,
  },
  {
    name: 'Deal Count',
    icon: BarChart3,
    target: undefined,
    what: 'Count of all Closed Won + Invoice Opportunities. Excludes $0-amount deals.',
    formula: `SELECT COUNT(Id) cnt
FROM Opportunity
WHERE StageName IN ('Closed Won','Invoice')
  AND RecordTypeId IN (...)
  AND CloseDate >= {sd} AND CloseDate <= {ed}
  AND Amount != null`,
  },
  {
    name: 'Win Rate',
    icon: CheckCircle2,
    target: 'Benchmark: 50%+',
    what: 'Won deals ÷ (Won + Lost). Open deals are intentionally excluded — win rate only measures completed outcomes. An agent with 10 won and 10 lost has a 50% win rate, regardless of open pipeline.',
    formula: `-- Won count:
SELECT COUNT(Id) FROM Opportunity
WHERE StageName IN ('Closed Won','Invoice') ...

-- Lost count:
SELECT COUNT(Id) FROM Opportunity
WHERE StageName = 'Closed Lost' ...

win_rate = won / (won + lost) × 100`,
  },
  {
    name: 'Pipeline Value',
    icon: TrendingDown,
    target: 'Coverage ≥ 2× bookings',
    what: 'Total Amount of open Opportunities with a future CloseDate. Bounded to the next 12 months to exclude stale open deals.',
    formula: `SELECT COUNT(Id) cnt, SUM(Amount) rev
FROM Opportunity
WHERE IsClosed = false
  AND RecordTypeId IN (...)
  AND Amount != null
  AND CloseDate >= TODAY
  AND CloseDate <= NEXT_N_MONTHS:12`,
  },
  {
    name: 'Pipeline Coverage',
    icon: ArrowRightLeft,
    target: '2× = healthy · 1× = moderate · <1× = critical',
    what: 'Pipeline Value ÷ annualized bookings. A 2× coverage means the pipeline has twice the value of your current bookings run-rate — enough to absorb normal deal attrition and still hit targets.',
    formula: `coverage = pipeline_value / (current_period_revenue × (12 / period_months))

Example: $8M pipeline ÷ $4M bookings (6-month period annualized to $8M)
→ $8M ÷ $8M = 1.0× coverage (moderate)`,
  },
  {
    name: 'Average Deal Size',
    icon: Star,
    target: undefined,
    what: 'Total bookings ÷ number of won deals. Tracks whether advisors are moving up-market or down-market over time.',
    formula: `avg_deal_size = SUM(Amount) / COUNT(Id)
  on won opportunities in the period`,
  },
  {
    name: 'Lead Conversion Rate',
    icon: Zap,
    target: 'Benchmark: 20%+',
    what: 'Leads converted (IsConverted = true) ÷ total leads created in the period. Measures how effectively the team turns initial interest into actual deals.',
    formula: `-- Total leads:
SELECT COUNT(Id) FROM Lead
WHERE RecordTypeId IN (...)
  AND CreatedDate >= {sd}T00:00:00Z AND CreatedDate <= {ed}T23:59:59Z

-- Converted:
SELECT COUNT(Id) FROM Lead
WHERE IsConverted = true AND ConvertedDate >= {sd} AND ConvertedDate <= {ed}

conversion_rate = converted / total × 100`,
  },
  {
    name: 'Expired Lead Rate',
    icon: XCircle,
    target: '< 15%',
    what: 'Percentage of leads that expired without being contacted. High expiry rate signals advisors are not following up within the SLA window. This is a leading indicator of future pipeline problems.',
    formula: `expired_count = COUNT(Status = 'Expired')
total_leads = COUNT(*)
expiry_rate = expired_count / total_leads × 100

Both filtered by RecordTypeId and CreatedDate range.`,
  },
  {
    name: 'Priority Score (Opportunity)',
    icon: Trophy,
    target: '0–100 · Higher = more urgent',
    what: 'A composite 0-100 score assigned to each open deal by the AI scoring engine. Drives the Top Opportunities ranking. Decays over time as deals sit without activity.',
    formula: `score = (
  0.35 × amount_score      -- logarithmic vs division max
+ 0.25 × stage_decay       -- decays as days-in-stage grows
+ 0.20 × close_proximity   -- peaks for deals closing in ≤30 days
+ 0.15 × activity_score    -- based on days since LastActivityDate
+ 0.05 × push_penalty      -- negative for PushCount ≥ 3
) × 100`,
  },
  {
    name: 'YoY Growth',
    icon: TrendingDown,
    target: 'Positive = growing',
    what: 'Compares current period bookings to the same period last year. The app shifts dates back exactly one year (not calendar year) for a fair like-for-like comparison.',
    formula: `-- Current period:
CloseDate >= {sd} AND CloseDate <= {ed}

-- Prior period (same duration, 1 year back):
prev_sd = sd − 1 year
prev_ed = ed − 1 year

yoy_growth = (current_rev − prior_rev) / prior_rev × 100`,
  },
  {
    name: 'Inv/Opp % (Invoiced Rate)',
    icon: CheckCircle2,
    target: '> 50%',
    what: 'Invoiced deals ÷ total opportunities created in the period. Measures how well advisors close the deals they open. A low rate means many opportunities are created but few advance to booking.',
    formula: `invoiced_count = COUNT(StageName IN ('Invoice','Invoiced','Booked','Closed Won'))
opps_created = COUNT(Opportunity WHERE CreatedDate IN period)

inv_opp_pct = invoiced_count / opps_created × 100`,
  },
]

/* ── Business Rules data ────────────────────────────────────────────────── */
const RULES = [
  {
    title: 'Won Stages Filter',
    text: 'SalesInsight counts both "Closed Won" and "Invoice" as won bookings. Invoice = services delivered and billed (Travel only). Closed Won = fully settled deal. Never use IsClosed = true AND IsWon = true alone — Invoice stage is custom and not always flagged as IsWon in SF.',
  },
  {
    title: 'RecordTypeId vs RecordType.Name',
    text: 'All SOQL queries use RecordTypeId (direct indexed field) instead of RecordType.Name. RecordType.Name forces a cross-object join on every row and adds 1-3 seconds per query. Travel RecordTypeId = 012Pb0000006hIjIAI, Insurance = 012Pb0000006hIgIAI.',
  },
  {
    title: 'Commission Lag Rule',
    text: 'Earned_Commission_Amount__c is populated 2-3 months after booking, when the Invoice stage is set. Never compare commission for the current quarter vs prior quarter — recent months will always be artificially low. Use Bookings (Amount) for YoY comparisons.',
  },
  {
    title: 'Date Format Rules',
    text: 'CloseDate and ConvertedDate are Date fields — use bare dates (2024-01-01). CreatedDate is a DateTime field — must include time suffix (2024-01-01T00:00:00Z). Mixing formats causes silent SOQL errors where queries return 0 records.',
  },
  {
    title: 'LAST_N_MONTHS Banned',
    text: 'All queries use explicit concrete dates (resolve_dates helper). LAST_N_MONTHS is prohibited — it uses SF\'s fiscal calendar, produces inconsistent date ranges, and makes cache keys non-deterministic. Always compute start/end dates in Python and pass them explicitly.',
  },
  {
    title: 'Lead RecordType Scope',
    text: 'Lead queries cover Travel, Insurance, Financial Services, and Driver Programs RecordTypes. "Outbound Lead" was historically in the filter but does not exist as a RecordType in this org — it was silently ignored. The app now uses RecordTypeId directly.',
  },
  {
    title: 'OwnerId in GROUP BY',
    text: 'GROUP BY OwnerId (direct indexed field on Opportunity/Lead) is 2-5× faster than GROUP BY Owner.Name (cross-object join to User table on every row). The app fetches a User lookup map once (get_owner_map()) and maps IDs to names in Python.',
  },
  {
    title: 'Cache TTLs',
    text: 'L1 (in-memory): 1 hour for most endpoints, 15 min for YTD achievement. L2 (disk at ~/.salesinsight/cache/): 24 hours. All cache keys include date range and division — changing filters always fetches fresh data. Stampede protection prevents duplicate SF calls.',
  },
]

/* ── MetricsSection ─────────────────────────────────────────────────────── */
export function MetricsSection() {
  return (
    <div>
      <SectionHeader
        title="Metric Definitions"
        subtitle="Every KPI — what it measures, how it is calculated, and which Salesforce fields are used."
      />
      <motion.div className="space-y-3 mt-4" variants={stagger()} initial="hidden" animate="show">
        {METRICS.map(m => (
          <motion.div key={m.name}
            className="rounded-xl border border-border bg-card/50 overflow-hidden"
            variants={fadeUp} transition={{ type: 'spring' as const, stiffness: 300, damping: 24 }}>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
              <m.icon className="w-4 h-4 text-primary shrink-0" />
              <span className="font-semibold text-sm text-foreground">{m.name}</span>
              {m.target && (
                <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 whitespace-nowrap">
                  {m.target}
                </span>
              )}
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">What it measures</div>
                <p className="text-xs text-foreground/80 leading-relaxed">{m.what}</p>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">SOQL & Formula</div>
                <pre className="text-[11px] text-primary/80 leading-relaxed bg-muted/40 rounded-lg p-3 border border-border whitespace-pre-wrap font-mono overflow-x-auto">
                  {m.formula}
                </pre>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

/* ── RulesSection ───────────────────────────────────────────────────────── */
export function RulesSection() {
  return (
    <div>
      <SectionHeader
        title="Business Rules & Guardrails"
        subtitle="Key filters, conventions, and exclusions that affect how metrics are calculated."
      />
      <motion.div className="space-y-3 mt-4" variants={stagger()} initial="hidden" animate="show">
        {RULES.map(r => (
          <motion.div key={r.title}
            className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3"
            variants={fadeUp} transition={{ type: 'spring' as const, stiffness: 300, damping: 24 }}>
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm text-foreground mb-1">{r.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.text}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
