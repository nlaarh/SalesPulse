import { Users, Table2, Target, GitBranch, Plane, Megaphone } from 'lucide-react'

const MODULES = [
  {
    icon: Users, label: 'Sales Dashboard', route: '/',
    desc: 'The main command center. Shows KPIs (revenue, deals, win rate, pipeline), year-over-year comparison charts, advisor leaderboard, sales funnel, lead sources, AI insights, and at-risk deals — all in a single view.',
  },
  {
    icon: Table2, label: 'Monthly Report', route: '/monthly',
    desc: 'Agent-by-month breakdown table showing leads, opportunities, invoiced deals, sales, and commission. Useful for tracking individual advisor productivity over time.',
  },
  {
    icon: Target, label: 'Top Opportunities', route: '/top-opps',
    desc: 'AI-scored ranking of the most important open deals. Each opportunity gets a priority score based on amount, days in stage, close probability, and urgency. Includes AI-generated deal write-ups.',
  },
  {
    icon: GitBranch, label: 'Pipeline & Forecasting', route: '/pipeline',
    desc: 'Pipeline health analysis including stage distribution, deal velocity, past-due tracking, and a sales funnel visualization showing conversion rates from lead to close.',
  },
  {
    icon: Plane, label: 'Travel Analytics', route: '/destinations',
    desc: 'Destination-level booking analysis for the Travel division. Shows revenue by destination, party sizes, year-over-year trends, and top-performing markets.',
  },
  {
    icon: Megaphone, label: 'Lead Funnel', route: '/leads',
    desc: 'Lead conversion analytics including volume by status, source effectiveness, time-to-convert distribution, and agent close speed comparison.',
  },
]

export default function ModulesSection() {
  return (
    <div className="space-y-3 p-6">
      {MODULES.map(({ icon: Icon, label, desc }) => (
        <div
          key={label}
          className="flex items-start gap-4 rounded-lg border border-border/40 bg-card/50 p-4 transition-colors hover:bg-secondary/20"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-foreground">{label}</h4>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
