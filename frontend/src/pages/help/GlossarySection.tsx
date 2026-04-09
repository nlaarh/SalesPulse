import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Users, Star, TrendingUp, AlertTriangle, ArrowRight,
  Clock, PieChart, Send, CheckCircle2, DollarSign,
  CircleDollarSign, Trophy, BarChart3, Shield,
} from 'lucide-react'

type TermDef = { term: string; definition: string; icon: typeof Star; color: string; bg: string }

const GLOSSARY_CATEGORIES: { category: string; terms: TermDef[] }[] = [
  {
    category: 'Pipeline & Deals',
    terms: [
      { term: 'Lead', definition: 'A potential customer who has shown interest. The starting point of the sales funnel.', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { term: 'Opportunity', definition: 'A qualified deal with an estimated value and close date. Created when a lead is converted.', icon: Star, color: 'text-primary', bg: 'bg-primary/10' },
      { term: 'Pipeline', definition: 'Total value of open opportunities expected to close within the next 12 months.', icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
      { term: 'Pipeline Coverage', definition: 'Open pipeline / annualized bookings. Healthy = 2x+, Moderate = 1-2x, Low = below 1x.', icon: Shield, color: 'text-violet-500', bg: 'bg-violet-500/10' },
      { term: 'At-Risk Deal', definition: 'An open deal past its expected close date. Needs immediate follow-up.', icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
      { term: 'Pushed Deal', definition: 'A deal whose close date has been moved forward 2+ times.', icon: ArrowRight, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { term: 'Stale Deal', definition: 'Open deal with no activity in the last 30 days.', icon: PieChart, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    ],
  },
  {
    category: 'Bookings & Financials',
    terms: [
      { term: 'Bookings (Amount)', definition: 'Total booking value of a deal. Travel = gross bookings; Insurance = premium. Recorded at close.', icon: CircleDollarSign, color: 'text-primary', bg: 'bg-primary/10' },
      { term: 'Commission', definition: 'Earned commission on delivered deals (Earned_Commission_Amount__c). Lags 2-3 months after booking.', icon: DollarSign, color: 'text-amber-500', bg: 'bg-amber-500/10' },
      { term: 'Closed Won', definition: 'A deal that has been successfully booked. The Amount field captures the booking value.', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { term: 'Invoice', definition: 'Services have been delivered and billed. Commission is earned at this stage.', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    ],
  },
  {
    category: 'Performance Metrics',
    terms: [
      { term: 'Win Rate', definition: 'Won deals / (Won + Lost). Open deals are excluded from the calculation.', icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      { term: 'Close Rate', definition: 'Won / total closed (Won + Lost) per month. Shows conversion efficiency over time.', icon: BarChart3, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { term: 'Conversion Rate', definition: 'Leads converted into opportunities / total leads. Measures top-of-funnel efficiency.', icon: Send, color: 'text-blue-500', bg: 'bg-blue-500/10' },
      { term: 'Days to Convert', definition: 'Average days from lead creation to opportunity creation. Shorter = more efficient.', icon: Clock, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    ],
  },
]

export default function GlossarySection() {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-6 p-6">
      {GLOSSARY_CATEGORIES.map(({ category, terms }) => (
        <div key={category}>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            {category}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {terms.map(({ term, definition, icon: Icon, color, bg }) => {
              const isOpen = expanded === term
              return (
                <button
                  key={term}
                  onClick={() => setExpanded(isOpen ? null : term)}
                  className={cn(
                    'flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all duration-200',
                    isOpen
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border/40 bg-card/50 hover:border-primary/20 hover:bg-secondary/30',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', bg)}>
                      <Icon className={cn('h-3.5 w-3.5', color)} />
                    </div>
                    <span className="text-[12px] font-bold text-foreground">{term}</span>
                  </div>
                  <p className={cn(
                    'text-[11px] leading-relaxed transition-all duration-200',
                    isOpen ? 'text-foreground/80' : 'text-muted-foreground/50 line-clamp-1',
                  )}>
                    {definition}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
