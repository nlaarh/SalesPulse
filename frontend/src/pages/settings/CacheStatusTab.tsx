/**
 * CacheStatusTab — shows recent warm runs + current cache stats.
 */
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Loader2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

interface WarmRun {
  id: number
  started_at: string
  ended_at: string | null
  trigger: string
  status: string
  endpoints_total: number
  endpoints_success: number
  endpoints_failed: number
  duration_ms: number | null
  log: { endpoint: string; ok: boolean; duration_ms: number; error: string | null }[]
}

interface WarmStatus {
  recent_runs: WarmRun[]
  cache_stats: {
    l1_entries: number
    l1_max_entries: number
    l2_entries: number
    l2_total_bytes: number
    l2_oldest_age_seconds: number | null
    l2_newest_age_seconds: number | null
    version: string
    v2_enabled: boolean
  }
}

export default function CacheStatusTab() {
  const [data, setData] = useState<WarmStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [warming, setWarming] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get<WarmStatus>('/api/admin/cache/warm-status')
      setData(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function triggerWarm() {
    setWarming(true)
    try {
      await api.post('/api/admin/cache/warm-now')
      setTimeout(load, 2000)
    } finally {
      setWarming(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
  }
  if (!data) return <div className="text-sm text-muted-foreground">No data</div>

  const s = data.cache_stats
  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="L1 Entries" value={`${s.l1_entries} / ${s.l1_max_entries}`} />
        <StatCard label="L2 Entries" value={`${s.l2_entries}`} sub={`${(s.l2_total_bytes / 1024).toFixed(0)} KB`} />
        <StatCard label="Cache Version" value={s.version} sub={s.v2_enabled ? 'v2 enabled' : 'v1 legacy'} />
        <StatCard label="Oldest Entry" value={s.l2_oldest_age_seconds ? `${Math.floor(s.l2_oldest_age_seconds / 3600)}h ago` : '—'} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={triggerWarm}
          disabled={warming}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium',
            'bg-card hover:bg-muted/50 transition-colors',
            warming && 'opacity-60 cursor-not-allowed',
          )}
        >
          {warming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {warming ? 'Warming\u2026' : 'Warm Now'}
        </button>
      </div>

      {/* Recent runs */}
      <div className="card-premium">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Warm Runs</div>
        <div className="divide-y divide-border">
          {data.recent_runs.map((r) => (
            <RunRow key={r.id} run={r} />
          ))}
          {data.recent_runs.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No warm runs recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function RunRow({ run }: { run: WarmRun }) {
  const [open, setOpen] = useState(false)
  const statusColor = run.status === 'success' ? 'text-emerald-600' : run.status === 'partial' ? 'text-amber-600' : 'text-rose-600'
  const Icon = run.status === 'success' ? CheckCircle : run.status === 'partial' ? Clock : XCircle

  return (
    <div className="p-3">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 w-full text-left">
        <Icon className={cn('w-4 h-4 shrink-0', statusColor)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {run.trigger} — {run.endpoints_success}/{run.endpoints_total} ok
            {run.endpoints_failed > 0 && <span className="text-rose-600"> · {run.endpoints_failed} failed</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(run.started_at).toLocaleString()} — {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : 'running'}
          </div>
        </div>
      </button>
      {open && run.log.length > 0 && (
        <div className="mt-3 ml-7 space-y-1 text-xs">
          {run.log.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={e.ok ? 'text-emerald-600' : 'text-rose-600'}>{e.ok ? '\u2713' : '\u2717'}</span>
              <span className="font-mono">{e.endpoint}</span>
              <span className="text-muted-foreground">{(e.duration_ms / 1000).toFixed(1)}s</span>
              {e.error && <span className="text-rose-600 truncate">{e.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
