import {
  Activity, GitBranch, TrendingUp, Megaphone, Target, Trophy, Zap,
} from 'lucide-react'

export default function OverviewSection() {
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-bold tracking-tight">SalesInsight</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            SalesInsight is a real-time analytics platform built on top of Salesforce data
            for AAA Western & Central New York. It provides sales leadership with actionable
            visibility into advisor performance, pipeline health, lead conversion, and bookings
            trends across the Travel and Insurance divisions.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 bg-secondary/10 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50 mb-3">
          Key Capabilities
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Zap, text: 'Real-time Salesforce data sync with intelligent caching' },
            { icon: Trophy, text: 'Advisor performance rankings with AI-generated insights' },
            { icon: GitBranch, text: 'Pipeline forecasting with velocity and risk analysis' },
            { icon: TrendingUp, text: 'Year-over-year comparisons for all key metrics' },
            { icon: Megaphone, text: 'Lead funnel analytics with source effectiveness tracking' },
            { icon: Target, text: 'AI-scored opportunity prioritization and write-ups' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
              <span className="text-[12px] leading-relaxed text-foreground/80">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
