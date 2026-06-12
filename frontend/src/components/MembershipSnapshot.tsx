import { useEffect, useState } from 'react'
import { fetchMembershipSnapshot, type MembershipSnapshot } from '@/lib/api'
import { Users, UserPlus, RefreshCw, UserMinus, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function pct(curr: number, prior: number) {
  if (!prior) return null
  return ((curr - prior) / prior) * 100
}

function YoY({ curr, prior, invert = false }: { curr: number; prior: number; invert?: boolean }) {
  const p = pct(curr, prior)
  if (p === null) return null
  const positive = invert ? p < 0 : p > 0
  const neutral = Math.abs(p) < 0.5
  return (
    <span className={cn(
      'flex items-center gap-0.5 text-[10px] font-semibold',
      neutral ? 'text-muted-foreground' : positive ? 'text-emerald-500' : 'text-rose-500',
    )}>
      {neutral ? null : positive
        ? <TrendingUp className="h-2.5 w-2.5" />
        : <TrendingDown className="h-2.5 w-2.5" />}
      {p > 0 ? '+' : ''}{p.toFixed(1)}% YoY
    </span>
  )
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export default function MembershipSnapshotCard() {
  const [data, setData] = useState<MembershipSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMembershipSnapshot()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null
  if (!data) return null

  const retentionRate = data.ytd_renew + data.ytd_cancel > 0
    ? (data.ytd_renew / (data.ytd_renew + data.ytd_cancel)) * 100
    : null

  const tiles = [
    {
      label: 'Total Active Members',
      value: fmt(data.active_members),
      icon: Users,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      yoy: null,
    },
    {
      label: `${data.year} YTD New`,
      value: fmt(data.ytd_new),
      icon: UserPlus,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      yoy: <YoY curr={data.ytd_new} prior={data.prior_ytd_new} />,
    },
    {
      label: `${data.year} YTD Renewed`,
      value: fmt(data.ytd_renew),
      icon: RefreshCw,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
      yoy: <YoY curr={data.ytd_renew} prior={data.prior_ytd_renew} />,
    },
    {
      label: `${data.year} YTD Cancelled`,
      value: fmt(data.ytd_cancel),
      icon: UserMinus,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      yoy: <YoY curr={data.ytd_cancel} prior={data.prior_ytd_cancel} invert />,
    },
  ]

  return (
    <div className="animate-enter card-premium px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Membership
        </span>
        {retentionRate !== null && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
            {retentionRate.toFixed(1)}% Retention Rate YTD
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.label} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', t.bg)}>
                  <Icon className={cn('h-3.5 w-3.5', t.color)} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">{t.label}</span>
              </div>
              <div className="pl-9">
                <p className="text-xl font-bold tracking-tight">{t.value}</p>
                {t.yoy}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
