import { cn } from '@/lib/utils'

export interface CompareBarProps {
  label: string
  agent: number
  team: number
  format: (v: number) => string
  max: number
}

export default function CompareBar({ label, agent, team, format, max }: CompareBarProps) {
  const agentPct = max > 0 ? (agent / max) * 100 : 0
  const teamPct = max > 0 ? (team / max) * 100 : 0
  const isAbove = agent >= team

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold tabular-nums">{format(agent)}</span>
          <span className={cn(
            'text-[12px] font-semibold',
            isAbove ? 'text-emerald-500' : 'text-rose-500',
          )}>
            {isAbove ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </div>
      <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
        {/* Team marker line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-muted-foreground/50"
          style={{ left: `${teamPct}%` }}
        />
        {/* Agent bar */}
        <div
          className={cn('h-full rounded-full transition-all',
            isAbove ? 'bg-primary' : 'bg-rose-400')}
          style={{ width: `${agentPct}%` }}
        />
      </div>
      <span className="mt-1 block text-[12px] font-medium text-muted-foreground">
        Team avg: {format(team)}
      </span>
    </div>
  )
}
