import { useState, useEffect } from 'react'
import { fetchMembershipLeaderboard, type MembershipAgent } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

function fmtRev(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

export default function MembershipAdvisors() {
  const [agents, setAgents] = useState<MembershipAgent[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<'renew' | 'new' | 'cancel' | 'revenue'>('renew')

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetchMembershipLeaderboard()
      .then((d) => {
        setAgents(d.agents)
        setYear(d.year)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>

  if (error || agents.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm font-semibold">{error ? 'Performance data unavailable' : 'No agent data found'}</p>
      </div>
    )
  }

  const sorted = [...agents].sort((a, b) => b[sort] - a[sort])
  const max = sorted[0]?.[sort] ?? 1

  const colColors: Record<string, string> = {
    renew: 'bg-sky-500',
    new: 'bg-emerald-500',
    cancel: 'bg-rose-500',
    revenue: 'bg-violet-500',
  }

  return (
    <div className="space-y-4 animate-enter">
      <div>
        <p className="text-[12px] font-medium text-muted-foreground">
          Membership Division &middot; {year} Year to Date
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Advisor Performance</h1>
      </div>

      <div className="card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Agent Sales Performance — {year} YTD
          </p>
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
            {(['renew', 'new', 'cancel', 'revenue'] as const).map((k) => (
              <button key={k} onClick={() => setSort(k)}
                className={cn('rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                  sort === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {k === 'renew' ? 'Renewals' : k === 'new' ? 'New' : k === 'cancel' ? 'Cancelled' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground w-8">#</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Agent</th>
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground hidden lg:table-cell">Branch</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Renewals</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">New</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Cancelled</th>
                <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Revenue</th>
                <th className="px-5 py-2.5 text-left font-semibold text-muted-foreground w-28">Performance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 50).map((agent, idx) => {
                const barPct = max > 0 ? (agent[sort] / max) * 100 : 0
                const isTop3 = idx < 3
                return (
                  <tr key={agent.name} className={cn('border-b border-border/50 hover:bg-secondary/30 transition-colors', isTop3 && 'bg-primary/3')}>
                    <td className="px-4 py-2.5 font-semibold text-muted-foreground/60">
                      {isTop3 ? (
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                          idx === 0 ? 'bg-amber-400/20 text-amber-500' : idx === 1 ? 'bg-slate-300/20 text-slate-500' : 'bg-amber-700/20 text-amber-700')}>
                          {idx + 1}
                        </span>
                      ) : idx + 1}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{agent.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground/70 hidden lg:table-cell truncate max-w-[160px]">{agent.branch}</td>
                    <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'renew' ? 'text-sky-500' : '')}>{agent.renew.toLocaleString()}</td>
                    <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'new' ? 'text-emerald-500' : '')}>{agent.new.toLocaleString()}</td>
                    <td className={cn('px-4 py-2.5 text-right', sort === 'cancel' ? 'text-rose-500 font-semibold' : 'text-muted-foreground')}>{agent.cancel.toLocaleString()}</td>
                    <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'revenue' ? 'text-violet-500' : '')}>{fmtRev(agent.revenue)}</td>
                    <td className="px-5 py-2.5">
                      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div className={cn('h-full rounded-full', colColors[sort])} style={{ width: `${barPct}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > 50 && <p className="px-5 py-3 text-[11px] text-muted-foreground/60">Showing top 50 of {sorted.length} agents</p>}
      </div>
    </div>
  )
}
