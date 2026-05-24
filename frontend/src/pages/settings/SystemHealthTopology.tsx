import { Activity, Power, RefreshCw, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemHealthResponse, SystemServiceHealth } from '@/lib/api_admin'
import {
  OpenLink,
  SERVICE_LABELS,
  SERVICE_ORDER,
  ServiceIcon,
  StatusBadge,
  statusTone,
} from './systemHealthUi'

// Positions tuned for the ~460px-tall topology container.
const NODE_POSITIONS: Record<string, string> = {
  salesforce:  'top-[5px] left-[50%] -translate-x-1/2',
  postgres:    'top-[80px] left-[10px]',
  app:         'top-[80px] right-[10px]',
  pbi:         'top-[215px] left-[10px]',
  openai:      'top-[215px] right-[10px]',
  github:      'bottom-[5px] left-[10px]',
  dr_postgres: 'bottom-[5px] left-[50%] -translate-x-1/2',
  azure:       'bottom-[5px] right-[10px]',
}

type Props = {
  health: SystemHealthResponse
  logs: string[]
  loading: boolean
  pinging: Record<string, boolean>
  onRefresh: () => void
  onPing: (serviceKey: string) => void
}

export default function SystemHealthTopology({
  health,
  logs,
  loading,
  pinging,
  onRefresh,
  onPing,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="card-premium relative flex min-h-[560px] flex-col justify-between overflow-hidden border border-border/40 bg-black/25 p-6 dark:bg-black/45">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(94,106,210,0.08),transparent_65%)]" />
        <div className="relative z-10 flex items-center justify-between border-b border-border/40 pb-3">
          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-primary">
              <Activity className="h-4 w-4 animate-pulse text-primary" />
              Cybernetic Power Switchboard Topology
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Tactical panel — click any node to ping. Status, latency and host shown live.
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            title="Refresh health snapshot"
            className="rounded-lg border border-border bg-secondary/50 p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
        <PowerTopology health={health} pinging={pinging} onPing={onPing} />
      </div>

      <ConsoleLogs logs={logs} />
    </div>
  )
}

function PowerTopology({ health, pinging, onPing }: {
  health: SystemHealthResponse
  pinging: Record<string, boolean>
  onPing: (serviceKey: string) => void
}) {
  return (
    <div className="relative my-2 flex h-[460px] w-full select-none items-center justify-center">
      <CableLines health={health} />
      <CorePdu health={health} />
      {SERVICE_ORDER.map((key) => health.services[key] ? (
        <TopologyNode key={key} serviceKey={key} service={health.services[key]} pinging={Boolean(pinging[key])} onPing={onPing} />
      ) : null)}
    </div>
  )
}

function CableLines({ health }: { health: SystemHealthResponse }) {
  const lines = [
    { key: 'salesforce',  d: 'M 320 90 L 320 130' },
    { key: 'postgres',    d: 'M 127 115 L 240 115 L 295 150' },
    { key: 'app',         d: 'M 513 115 L 400 115 L 345 150' },
    { key: 'pbi',         d: 'M 127 210 L 240 210 L 290 195' },
    { key: 'openai',      d: 'M 513 210 L 400 210 L 350 195' },
    { key: 'github',      d: 'M 127 325 L 240 325 L 295 230' },
    { key: 'dr_postgres', d: 'M 320 325 L 320 238' },
    { key: 'azure',       d: 'M 513 325 L 400 325 L 345 230' },
  ]
  return (
    <svg viewBox="0 0 640 380" className="pointer-events-none absolute inset-0 z-0 h-full w-full">
      <defs>
        <style>{'@keyframes pulseLine{to{stroke-dashoffset:-20}}.line-pulse{stroke-dasharray:4 12;animation:pulseLine 1.2s linear infinite}'}</style>
      </defs>
      {lines.map(({ key, d }) => {
        const service = health.services[key]
        const color = statusTone(service?.status).hex
        return service ? (
          <g key={key}>
            <path d={d} stroke={color} strokeWidth="1.5" opacity=".25" fill="none" />
            {service.status !== 'offline' && <path d={d} stroke={color} strokeWidth="1.5" className="line-pulse" fill="none" />}
          </g>
        ) : null
      })}
    </svg>
  )
}

function CorePdu({ health }: { health: SystemHealthResponse }) {
  const ports = [
    { key: 'salesforce',  label: 'SF',  x: 320, y: 130, anchor: 'middle' },
    { key: 'postgres',    label: 'DB',  x: 295, y: 150, anchor: 'start' },
    { key: 'app',         label: 'API', x: 345, y: 150, anchor: 'end' },
    { key: 'pbi',         label: 'PBI', x: 290, y: 195, anchor: 'start' },
    { key: 'openai',      label: 'AI',  x: 350, y: 195, anchor: 'end' },
    { key: 'github',      label: 'GIT', x: 295, y: 230, anchor: 'start' },
    { key: 'dr_postgres', label: 'DR',  x: 320, y: 238, anchor: 'middle' },
    { key: 'azure',       label: 'VM',  x: 345, y: 230, anchor: 'end' },
  ]
  return (
    <svg viewBox="0 0 640 380" className="pointer-events-none absolute inset-0 z-10 h-full w-full">
      <rect x="257" y="102" width="126" height="156" rx="10" fill="none" stroke="#5E6AD2" strokeWidth="1" opacity="0.1" className="animate-pulse" />
      <rect x="260" y="105" width="120" height="150" rx="8" fill="#0F172A" fillOpacity="0.9" stroke="#334155" strokeWidth="1.5" />
      <rect x="262" y="107" width="116" height="146" rx="6" fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.4" />
      <text x="320" y="116" textAnchor="middle" fill="#94A3B8" fontSize="7" fontWeight="bold" letterSpacing="1" fontFamily="monospace">CORE PDU v2.5</text>
      {ports.map(({ key, label, x, y, anchor }) => {
        const color = statusTone(health.services[key]?.status).hex
        return (
          <g key={key}>
            <circle cx={x} cy={y} r="8.5" fill="#1E293B" stroke="#475569" strokeWidth="1" />
            <circle cx={x} cy={y} r="5.5" fill="#020617" />
            <circle cx={x} cy={y} r="6" fill="none" stroke={color} strokeWidth="1" opacity="0.75" />
            <circle cx={x} cy={y} r="2" fill={color} />
            {health.services[key]?.status === 'online' && (
              <circle cx={x} cy={y} r="9.5" fill="none" stroke={color} strokeWidth="0.5" className="animate-ping" style={{ transformOrigin: `${x}px ${y}px` }} />
            )}
            <text
              x={anchor === 'start' ? x + 13 : anchor === 'end' ? x - 13 : x}
              y={anchor === 'middle' ? y + 14 : y + 2.5}
              textAnchor={anchor as 'start' | 'middle' | 'end'}
              fill="#64748B" fontSize="6.5" fontWeight="bold" fontFamily="monospace"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function TopologyNode({ serviceKey, service, pinging, onPing }: {
  serviceKey: string
  service: SystemServiceHealth
  pinging: boolean
  onPing: (serviceKey: string) => void
}) {
  const tone = statusTone(service.status)
  const recentLogs = service.logs?.slice(0, 3) ?? []

  return (
    <div className={cn('absolute z-20 w-[160px]', NODE_POSITIONS[serviceKey])}>
      <div className={cn('rounded-lg border bg-background/95 p-2.5 shadow-xl backdrop-blur transition hover:shadow-primary/15', tone.border)}>
        {/* Header: icon + name + link icon */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ServiceIcon serviceKey={serviceKey} small />
            <span className="truncate font-mono text-[8px] font-bold uppercase tracking-wide text-foreground">
              {SERVICE_LABELS[serviceKey]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <OpenLink href={service.host_link} />
            <Power className={cn('h-3 w-3', tone.text, pinging && 'animate-pulse')} />
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-2 space-y-1 border-t border-border/20 pt-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-muted-foreground">Status</span>
            <span className={cn('text-[8px] font-bold uppercase', tone.text)}>
              {pinging ? 'CHECKING' : service.status}
            </span>
          </div>
          {service.latency_ms != null && (
            <div className="flex items-center justify-between">
              <span className="text-[8px] text-muted-foreground">Latency</span>
              <span className={cn('text-[8px] font-semibold tabular-nums', service.latency_ms > 500 ? 'text-amber-400' : 'text-emerald-400')}>
                {service.latency_ms} ms
              </span>
            </div>
          )}
          {service.host && (
            <div className="flex items-center justify-between gap-1">
              <span className="shrink-0 text-[8px] text-muted-foreground">Host</span>
              <span className="max-w-[95px] truncate font-mono text-[7.5px] text-foreground/60" title={service.host}>
                {service.host}
              </span>
            </div>
          )}
        </div>

        {/* Footer: badge + ping */}
        <div className="mt-1.5 flex items-center justify-between border-t border-border/20 pt-1.5">
          <StatusBadge status={service.status} />
          <button
            onClick={() => onPing(serviceKey)}
            disabled={pinging}
            className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            {pinging ? '···' : 'PING'}
          </button>
        </div>

        {/* Per-service logs (if returned by health check) */}
        {recentLogs.length > 0 && (
          <div className="mt-1.5 space-y-0.5 border-t border-border/20 pt-1.5 font-mono">
            {recentLogs.map((entry, i) => (
              <div key={i} className="truncate border-l-2 border-sky-500/30 pl-1 text-[7px] leading-tight text-zinc-400" title={entry}>
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConsoleLogs({ logs }: { logs: string[] }) {
  return (
    <div className="card-premium flex min-h-[560px] flex-col overflow-hidden border border-zinc-800 bg-zinc-950 font-mono">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 text-primary">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Tactical HUD Console Logs</span>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto bg-zinc-950 p-4 text-[10px] leading-relaxed">
        {logs.map((line, idx) => (
          <div key={`${line}-${idx}`} className="whitespace-pre-wrap border-l-2 border-sky-500/30 pl-2 text-zinc-200">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
