import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Small "?" icon showing a calculation explanation on hover/click.
 * Renders tooltip via portal so it escapes overflow-hidden parents.
 * Uses stopPropagation so it won't trigger parent card drill-down.
 */
export function Tip({ text, className }: { text: string; className?: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (show && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.top - 8, left: r.left + r.width / 2 })
    }
  }, [show])

  return (
    <span
      ref={ref}
      className={cn('relative ml-1 inline-flex align-middle', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow(!show) }}
    >
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/30 transition-colors hover:text-muted-foreground/60" />
      {show && createPortal(
        <span
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-[11px] font-normal leading-relaxed text-popover-foreground shadow-xl w-[260px]"
        >
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-popover" />
        </span>,
        document.body,
      )}
    </span>
  )
}

/** Metric calculation explanations — reusable across all pages. */
export const TIPS = {
  // Revenue
  billedRevenue: 'Sum of the Amount field on Closed Won & Invoice opportunities in the selected period. Represents total booking value before commission.',
  commission: 'Sum of Earned_Commission_Amount__c on won deals. Commission is paid 2–3 months after booking, so recent months may be incomplete.',
  bookings: 'Sum of the Amount field (total booking value). Travel = gross bookings; Insurance = premium.',

  // Deals
  wonDeals: 'Count of opportunities in Closed Won or Invoice stage during the selected period.',
  winRate: 'Won ÷ (Won + Lost) in the selected period. Open deals are excluded. Invoice counts as a win.',
  avgDeal: 'Total bookings ÷ number of won deals in the selected period.',
  closeRate: 'Won ÷ (Won + Lost) per month. Only deals that reached a final outcome.',

  // Pipeline
  pipeline: 'Sum of Amount on open opportunities closing today through the next 12 months.',
  pipelineCoverage: 'Open pipeline ÷ annualized bookings. Measures if there is enough pipeline to hit targets. Healthy = 2x+, Moderate = 1–2x, Low = below 1x.',
  pipelineByStage: 'Open pipeline value grouped by sales stage. Shows where deals sit in the funnel.',
  activePipeline: 'Total value of open opportunities with close dates from today through the next 12 months.',
  openDeals: 'Count of open opportunities closing within the next 12 months.',
  avgDealValue: 'Average Amount across all open pipeline deals.',

  // Activity
  leads: 'New leads created (owned by division advisors) in the selected period.',
  opps: 'New opportunities created in the selected period.',

  // Risk
  atRisk: 'Open deals past their expected close date. Need immediate follow-up to avoid becoming lost.',
  pastDue: 'Open deals where CloseDate < today. Sorted by days overdue.',
  pushedDeals: 'Deals whose close date was moved forward 2+ times — may indicate qualification issues.',
  staleDeals: 'Open deals with no activity (calls, emails, tasks) in the last 30 days.',

  // Lead Funnel
  totalLeads: 'Total leads created in the selected period across all channels.',
  converted: 'Leads successfully converted into opportunities.',
  conversionRate: 'Converted leads ÷ total leads.',
  avgDaysToConvert: 'Average days from lead creation to opportunity creation for converted leads.',
  expiredRate: 'Percentage of leads expired or disqualified without converting to an opportunity.',
  leadSources: 'Lead volume grouped by Lead Source field. Shows which channels drive the most leads.',
  sourceEffectiveness: 'Conversion rate and average opportunity dollar value by lead source.',
  leadsByStatus: 'Lead volume broken down by current lead status (New, Contacted, Qualified, etc.).',
  timeToConvert: 'Distribution of days from lead creation to opportunity creation. Shows how quickly leads move through the funnel.',

  // Charts
  salesOverview: 'Monthly bookings (Amount) side-by-side for current vs prior year. Both years compared for the same calendar months.',
  revenueByMonth: 'Monthly bookings trend with prior-year overlay. Uses the Amount field for fair comparison.',
  dealsByMonth: 'Won deals per month. Shows seasonal patterns and production consistency.',
  wonBookingsCloseRate: 'Combined chart: bars = monthly won revenue (Amount), line = close rate (Won ÷ total closed). Shows revenue alongside conversion efficiency.',

  // Monthly Report
  monthlyComm: 'Earned commission per advisor per month (Earned_Commission_Amount__c). Recent months may lag.',
  monthlyBookings: 'Booking value (Amount) per advisor per month.',
  monthlyLeads: 'New leads created per advisor per month.',
  monthlyOpps: 'New opportunities created per advisor per month.',
  monthlyInvoiced: 'Deals in Invoice stage per advisor per month.',

  // Agent-specific
  vsTeam: "Compares this advisor's metrics against the division average for all active advisors in the same period.",
  priorityScore: 'Score (0–100) based on deal amount, stage, days to close, push count, and last activity. 80+ = Act Now, 60–79 = Follow Up, <60 = Monitor.',
  completionRate: 'Tasks completed ÷ tasks created in the selected period.',
  managerBrief: 'AI-generated executive summary analyzing this advisor\'s performance, strengths, risks, and recommended actions.',
} as const
