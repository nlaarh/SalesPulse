import { cn } from '@/lib/utils'
import {
  Users, CheckCircle2, Star, FileText, DollarSign,
  Trophy, XCircle, ChevronRight,
} from 'lucide-react'

const LIFECYCLE_STAGES = [
  {
    label: 'Lead Created',
    desc: 'A new prospect enters Salesforce — either from a web form, referral, phone call, or marketing campaign. Every potential customer starts here.',
    icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', accent: '#3b82f6',
  },
  {
    label: 'Lead Qualified',
    desc: 'The sales team evaluates the lead for fit and intent. Good leads advance; poor-quality leads are disqualified or expire.',
    icon: CheckCircle2, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', accent: '#06b6d4',
  },
  {
    label: 'Opportunity Created',
    desc: 'The qualified lead converts into a deal (Opportunity). An estimated value and close date are assigned. This is the pipeline entry point.',
    icon: Star, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/30', accent: '#8b5cf6',
  },
  {
    label: 'Proposal / Negotiation',
    desc: 'The advisor works the deal — presenting options, negotiating terms, and refining the scope. Deal amount and close date may change.',
    icon: FileText, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', accent: '#f59e0b',
  },
  {
    label: 'Closed Won',
    desc: 'The deal is booked. The Amount field records the total booking value (gross for Travel, premium for Insurance). This is the "Bookings" metric.',
    icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', accent: '#10b981',
  },
  {
    label: 'Invoice / Delivered',
    desc: 'Services are delivered and billed. Commission is earned here (Earned_Commission_Amount__c). Typically 2-3 months after booking.',
    icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-600/10', border: 'border-emerald-600/30', accent: '#059669',
  },
]

export default function LifecycleSection() {
  return (
    <div className="space-y-6 p-6">
      <p className="text-[13px] text-muted-foreground">
        Every sale follows this lifecycle — from first contact to revenue earned. Understanding where
        each deal sits in this pipeline is key to forecasting and coaching.
      </p>

      {/* Linear pipeline visualization */}
      <div className="relative">
        <div className="absolute left-[23px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500/40 via-violet-500/40 to-emerald-500/40 rounded-full" />
        <div className="space-y-0">
          {LIFECYCLE_STAGES.map((stage, i) => {
            const Icon = stage.icon
            return (
              <div key={stage.label} className="relative flex items-start gap-4 py-3">
                <div className="relative z-10 flex flex-col items-center">
                  <div className={cn(
                    'flex h-[46px] w-[46px] items-center justify-center rounded-xl border-2',
                    stage.bg, stage.border,
                  )}>
                    <Icon className={cn('h-5 w-5', stage.color)} />
                  </div>
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-bold text-muted-foreground/40 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h4 className="text-[13px] font-semibold text-foreground">{stage.label}</h4>
                    {i < LIFECYCLE_STAGES.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                    )}
                  </div>
                  <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-muted-foreground">{stage.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lost / Expired callout */}
      <div className="flex items-start gap-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border-2 border-rose-500/30 bg-rose-500/10">
          <XCircle className="h-5 w-5 text-rose-500" />
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-rose-500">Lost / Expired</h4>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            A deal or lead can exit the pipeline at any stage. Leads expire if not contacted within the SLA.
            Opportunities are marked "Closed Lost" when the customer decides not to proceed. Tracking loss
            reasons helps improve conversion rates.
          </p>
        </div>
      </div>
    </div>
  )
}
