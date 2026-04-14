/**
 * PerformanceTab — System latency and client render metrics.
 * Extracted from Settings.tsx to keep that file under the 600-line limit.
 */
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import { fetchPerformanceSummary, type PerformanceSummaryResponse } from '@/lib/api'

const fmtMs = (n: number) => `${n.toFixed(1)} ms`

export default function PerformanceTab() {
  const [perfWindow, setPerfWindow] = useState(60)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfSummary, setPerfSummary] = useState<PerformanceSummaryResponse | null>(null)

  const loadSummary = async (windowMinutes = perfWindow) => {
    setPerfLoading(true)
    try {
      setPerfSummary(await fetchPerformanceSummary(windowMinutes))
    } finally {
      setPerfLoading(false)
    }
  }

  useEffect(() => { void loadSummary() }, [])

  return (
    <div className="space-y-4">
      <div className="card-premium p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">System Latency Summary</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Server request timings + client render events from production traffic.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={perfWindow}
              onChange={(e) => {
                const next = Number(e.target.value)
                setPerfWindow(next)
                void loadSummary(next)
              }}
              className="rounded-lg border border-border bg-secondary/40 px-2.5 py-2 text-[12px] text-foreground"
            >
              <option value={60}>Last 60 min</option>
              <option value={360}>Last 6 hours</option>
              <option value={1440}>Last 24 hours</option>
            </select>
            <button
              onClick={() => void loadSummary(perfWindow)}
              disabled={perfLoading}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary transition',
                perfLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/20',
              )}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', perfLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {perfSummary && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="card-premium p-4">
              <p className="text-[12px] font-semibold">Server API</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                {[
                  { label: 'Requests', val: perfSummary.server.total_requests.toLocaleString() },
                  { label: 'Avg', val: fmtMs(perfSummary.server.avg_ms) },
                  { label: 'p50', val: fmtMs(perfSummary.server.p50_ms) },
                  { label: 'p95', val: fmtMs(perfSummary.server.p95_ms) },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg bg-secondary/40 p-2">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="font-semibold text-foreground">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-premium p-4">
              <p className="text-[12px] font-semibold">Client Render</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                {[
                  { label: 'Events', val: perfSummary.client.total_events.toLocaleString() },
                  { label: 'Pages', val: perfSummary.client.by_page.length.toLocaleString() },
                  { label: 'Top p50', val: perfSummary.client.by_page[0] ? fmtMs(perfSummary.client.by_page[0].p50_ms) : '0.0 ms' },
                  { label: 'Top p95', val: perfSummary.client.by_page[0] ? fmtMs(perfSummary.client.by_page[0].p95_ms) : '0.0 ms' },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg bg-secondary/40 p-2">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="font-semibold text-foreground">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card-premium overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-[12px] font-semibold">Top API Routes</p>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  {['Route', 'Req', 'Avg', 'p50', 'p95', 'Errors'].map(h => (
                    <th key={h} className="px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perfSummary.server.by_route.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-4 text-muted-foreground">No server metrics in selected window.</td></tr>
                )}
                {perfSummary.server.by_route.map((r) => (
                  <tr key={r.path} className="border-b border-border/50">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-foreground">{r.path}</td>
                    <td className="px-4 py-2.5">{r.requests}</td>
                    <td className="px-4 py-2.5">{fmtMs(r.avg_ms)}</td>
                    <td className="px-4 py-2.5">{fmtMs(r.p50_ms)}</td>
                    <td className="px-4 py-2.5">{fmtMs(r.p95_ms)}</td>
                    <td className="px-4 py-2.5">{r.error_rate_pct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card-premium overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-[12px] font-semibold">Top Client Pages</p>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  {['Page', 'Events', 'Avg', 'p50', 'p95', 'Metric'].map(h => (
                    <th key={h} className="px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {perfSummary.client.by_page.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-4 text-muted-foreground">No client metrics in selected window.</td></tr>
                )}
                {perfSummary.client.by_page.map((p) => (
                  <tr key={p.page} className="border-b border-border/50">
                    <td className="px-4 py-2.5 font-medium text-foreground">{p.page}</td>
                    <td className="px-4 py-2.5">{p.events}</td>
                    <td className="px-4 py-2.5">{fmtMs(p.avg_ms)}</td>
                    <td className="px-4 py-2.5">{fmtMs(p.p50_ms)}</td>
                    <td className="px-4 py-2.5">{fmtMs(p.p95_ms)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {p.metrics[0] ? `${p.metrics[0].metric} (${p.metrics[0].count})` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
