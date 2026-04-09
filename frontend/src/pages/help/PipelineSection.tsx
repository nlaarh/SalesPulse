import { cn } from '@/lib/utils'
import { Users, GitBranch, Shield, Plane, ArrowRight } from 'lucide-react'

/* ── Data ─────────────────────────────────────────────────────────────────── */

const PIPELINE_STAGES: { stage: string; prob: string; desc: string; color: string; bg: string; border: string }[] = [
  { stage: 'Prospecting',       prob: '~10%',  desc: 'Initial contact — advisor identified a potential customer but has not yet qualified the need.',                                        color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30' },
  { stage: 'Qualification',     prob: '~20%',  desc: 'Advisor confirmed the customer has a real need and budget. Still early — many deals drop here.',                                       color: 'text-cyan-500',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30' },
  { stage: 'Needs Analysis',    prob: '~30%',  desc: 'Actively scoping the engagement — understanding destination preferences, coverage needs, timelines.',                                 color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  { stage: 'Proposal',          prob: '~50%',  desc: 'Advisor presented options to the customer. Waiting for a decision. Deal amount and close date may still shift.',                       color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30' },
  { stage: 'Negotiation',       prob: '~60%',  desc: 'Customer is interested, working out final terms. High likelihood of closing.',                                                         color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
]

const WON_STAGES: { stage: string; prob: string; desc: string; color: string; bg: string; border: string }[] = [
  { stage: 'Booked',     prob: '90%',  desc: 'Trip or policy is confirmed, awaiting final paperwork. Essentially a won deal.',                                         color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  { stage: 'Invoice',    prob: '95%',  desc: 'Services delivered and billed. Commission is earned at this stage. Typically 2-3 months after booking.',                  color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { stage: 'Closed Won', prob: '100%', desc: 'Deal fully complete. Amount field captures the booking value. This drives the "Bookings" metric.',                        color: 'text-emerald-600', bg: 'bg-emerald-600/10', border: 'border-emerald-600/30' },
  { stage: 'Closed Lost', prob: '0%',  desc: 'Customer decided not to proceed. Tracking loss reasons helps improve future win rates.',                                  color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
]

const COVERAGE_LEVELS: { range: string; label: string; desc: string; color: string; bg: string }[] = [
  { range: '2x +',      label: 'Strong',   desc: 'Healthy buffer to absorb normal deal attrition and still meet bookings targets.',                     color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { range: '1x – 2x',   label: 'Moderate', desc: 'Serviceable but thin. Team should increase prospecting to build a stronger buffer.',                 color: 'text-amber-500',   bg: 'bg-amber-500/10' },
  { range: 'Below 1x',  label: 'Critical', desc: 'Pipeline value is less than target bookings. Without immediate pipeline build, targets are at risk.',  color: 'text-rose-500',    bg: 'bg-rose-500/10' },
]

const LEAD_STATUSES: { status: string; desc: string; color: string; bg: string; border: string }[] = [
  { status: 'Open / New',    desc: 'Lead just entered Salesforce from a web form, referral, or campaign. Not yet contacted.',        color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30' },
  { status: 'Working',       desc: 'Advisor picked up the lead and is actively reaching out.',                                       color: 'text-cyan-500',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30' },
  { status: 'Contacted',     desc: 'Advisor made initial contact. Evaluating if the lead has a real need.',                           color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/30' },
  { status: 'Qualified',     desc: 'Lead confirmed as a genuine prospect — has budget, need, and intent.',                            color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
]

const LEAD_EXITS: { status: string; desc: string; color: string; bg: string; border: string }[] = [
  { status: 'Converted',     desc: 'Lead becomes an Opportunity. This is where the pipeline begins.',                                 color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { status: 'Expired',       desc: 'Lead was not contacted within the SLA window and timed out.',                                      color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  { status: 'Unqualified',   desc: 'Lead was contacted but did not have a real need, budget, or intent.',                              color: 'text-orange-500',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
]

/* ── Component ────────────────────────────────────────────────────────────── */

export default function PipelineSection() {
  return (
    <div className="space-y-6 p-6">
      {/* Lead vs Opportunity Relationship */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <GitBranch className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-foreground">Leads vs Opportunities — Two Separate Objects</h4>
            <p className="text-[11px] text-muted-foreground">Understanding where each one starts and ends</p>
          </div>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-foreground/80">
          In Salesforce, <strong>Leads</strong> and <strong>Opportunities</strong> are completely
          separate objects with their own stages. A Lead is a <em>person</em> who might be
          interested. An Opportunity is a <em>deal</em> with a dollar value. The bridge between
          them is <strong>Lead Conversion</strong> — the moment a qualified Lead creates a new
          Opportunity and enters the sales pipeline.
        </p>
        <div className="flex items-center gap-2 mb-4 rounded-lg bg-background/50 p-3">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-md bg-blue-500/15 px-2 py-0.5 font-semibold text-blue-400">Lead</span>
            <span className="text-muted-foreground/50">Open → Working → Qualified →</span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
            <ArrowRight className="h-3 w-3 text-emerald-500" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-400">Opportunity</span>
            <span className="text-muted-foreground/50">Prospecting → … → Closed Won</span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The <strong className="text-foreground">probability percentages</strong> (10%, 20%, etc.)
          shown below belong to <strong className="text-foreground">Opportunity stages only</strong>,
          not Leads. Leads don't have win probabilities — they either convert into an Opportunity or
          they expire / get disqualified.
        </p>
      </div>

      {/* Lead Statuses */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
          Lead Stages (Before Pipeline)
        </p>
        <div className="space-y-2">
          {LEAD_STATUSES.map(({ status, desc, color, bg, border }) => (
            <div key={status} className={cn('flex items-start gap-3.5 rounded-lg border p-3', border, bg)}>
              <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0 w-[70px]">
                <Users className={cn('h-3.5 w-3.5', color)} />
                <span className="text-[9px] font-medium text-muted-foreground/50">LEAD</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold text-foreground">{status}</h4>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {LEAD_EXITS.map(({ status, desc, color, bg, border }) => (
            <div key={status} className={cn('rounded-lg border p-3', border, bg)}>
              <h4 className={cn('text-[12px] font-semibold mb-1', color)}>{status}</h4>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline intro */}
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Pipeline</strong> is the total value of all open,
        not-yet-won Opportunities in Salesforce. Only deals that were created from converted Leads
        (or entered directly) and have not yet been won or lost count as pipeline. It answers
        the question: <em>"Do we have enough deals in progress to hit our bookings targets?"</em>
      </p>

      {/* Pipeline Stages */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
          Opportunity Stages — Pipeline (Open &amp; Actionable)
        </p>
        <div className="space-y-2">
          {PIPELINE_STAGES.map(({ stage, prob, desc, color, bg, border }) => (
            <div key={stage} className={cn('flex items-start gap-3.5 rounded-lg border p-3.5', border, bg)}>
              <div className="flex flex-col items-center gap-0.5 pt-0.5">
                <span className={cn('text-[18px] font-bold tabular-nums leading-none', color)}>{prob}</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold text-foreground">{stage}</h4>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Won / Terminal Stages */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
          Opportunity Stages — Won &amp; Terminal (Not in Pipeline)
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {WON_STAGES.map(({ stage, prob, desc, color, bg, border }) => (
            <div key={stage} className={cn('rounded-lg border p-3.5', border, bg)}>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className={cn('text-[13px] font-semibold', color)}>{stage}</h4>
                <span className="text-[10px] font-medium text-muted-foreground">{prob}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Coverage */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-foreground">Pipeline Coverage (the "x" metric)</h4>
            <p className="text-[11px] text-muted-foreground">Open Pipeline Value &divide; Annualized Bookings</p>
          </div>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-foreground/80">
          Coverage tells you how many "times over" your pipeline could cover your bookings
          target. At <strong>2x</strong>, you have twice the pipeline you need — a healthy
          buffer because roughly half of all deals fall through. At <strong>0.5x</strong>,
          you would need to close every single deal just to hit half your target.
        </p>
        <div className="space-y-2">
          {COVERAGE_LEVELS.map(({ range, label, desc, color, bg }) => (
            <div key={label} className="flex items-start gap-3 rounded-lg bg-background/50 p-3">
              <div className={cn('rounded-md px-2.5 py-1 text-[12px] font-bold tabular-nums shrink-0', bg, color)}>
                {range}
              </div>
              <div>
                <span className={cn('text-[12px] font-semibold', color)}>{label}</span>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Travel note */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <Plane className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <h4 className="text-[12px] font-semibold text-amber-500">Why Travel shows low pipeline coverage</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Travel bookings move through stages very quickly — a trip can go from Prospecting
            to Invoice in days. The "open" pipeline at any snapshot is naturally thin compared
            to annual bookings. A low coverage number for Travel is expected and does not
            necessarily indicate a problem.
          </p>
        </div>
      </div>
    </div>
  )
}
