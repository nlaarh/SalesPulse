import { useState, useEffect } from 'react'
import { fetchMembershipChannels, type MembershipChannel } from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useChartColors } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

function fmtRev(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

export default function MembershipChannels() {
  const [channels, setChannels] = useState<MembershipChannel[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sort, setSort] = useState<'renew' | 'new' | 'revenue'>('renew')
  const c = useChartColors()

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetchMembershipChannels()
      .then((d) => {
        setChannels(d.channels)
        setYear(d.year)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>

  if (error || channels.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm font-semibold">{error ? 'Channel data unavailable' : 'No channel data found'}</p>
      </div>
    )
  }

  const sorted = [...channels].sort((a, b) => b[sort] - a[sort])

  const chartData = [...channels]
    .sort((a, b) => (b.new + b.renew) - (a.new + a.renew))
    .slice(0, 8)
    .map(ch => ({ channel: ch.channel.replace(/\s+/g, '\n'), new: ch.new, renew: ch.renew }))

  return (
    <div className="space-y-4 animate-enter">
      <div>
        <p className="text-[12px] font-medium text-muted-foreground">
          Membership Division &middot; {year} Year to Date
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Revenue by Channel</h1>
      </div>

      <div className="card-premium px-5 py-4">
        <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Channel Activity — {year} YTD
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barGap={2} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey="channel" tick={{ fontSize: 10, fill: c.tick }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c.tick }} axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
            <Tooltip
              contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, name: any) => [val != null ? Number(val).toLocaleString() : '', String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="new" name="New" fill={c.secondary} radius={[3, 3, 0, 0]} />
            <Bar dataKey="renew" name="Renewed" fill={c.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">All Channels</p>
          <div className="flex gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
            {(['renew', 'new', 'revenue'] as const).map((k) => (
              <button key={k} onClick={() => setSort(k)}
                className={cn('rounded-md px-3 py-1 text-[11px] font-semibold transition-all',
                  sort === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {k === 'renew' ? 'Renewals' : k === 'new' ? 'New' : 'Revenue'}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Channel</th>
              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Renewals</th>
              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">New</th>
              <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ch) => (
              <tr key={ch.channel} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-2.5 font-medium">{ch.channel || '—'}</td>
                <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'renew' ? 'text-sky-500' : '')}>{ch.renew.toLocaleString()}</td>
                <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'new' ? 'text-emerald-500' : '')}>{ch.new.toLocaleString()}</td>
                <td className={cn('px-4 py-2.5 text-right font-semibold', sort === 'revenue' ? 'text-violet-500' : '')}>{fmtRev(ch.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
