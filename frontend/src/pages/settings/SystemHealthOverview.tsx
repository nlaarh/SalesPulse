import { motion } from 'framer-motion'
import { Activity, AlertTriangle, CheckCircle2, Cloud, Cpu, Pin, Power, Radio, RefreshCw, ShieldAlert, Terminal, Layers, Database, Zap, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getStatusTextClass } from './systemHealthTypes'
import type { ServiceKey, SystemHealthResponse } from './systemHealthTypes'
import { OpenLink } from './systemHealthUi'

interface Props {
  health: SystemHealthResponse
  logs: string[]
  loading: boolean
  pinned: string[]
  pinging: Record<string, boolean>
  restarting: Record<string, boolean>
  onRefresh: () => void
  onPing: (key: ServiceKey) => void
  onRestart: (key: ServiceKey) => void
  onTogglePin: (key: ServiceKey) => void
}

const SERVICE_LABELS: Record<ServiceKey, string> = {
  salesforce: 'SALESFORCE',
  postgres: 'PRIMARY DATABASE',
  dr_postgres: 'POSTGRESQL DR',
  app: 'PRIMARY API NODE',
  dr_app: 'SALESPULSE DR',
  pbi: 'POWER BI',
  azure: 'AZURE VM',
  openai: 'OPENAI SERVICE',
  github: 'GITHUB REPO',
}

const SERVICE_POSITIONS: Record<ServiceKey, string> = {
  salesforce: 'top-[10px] left-[50%] -translate-x-1/2',
  postgres: 'top-[95px] left-[15px]',
  app: 'top-[95px] right-[15px]',
  pbi: 'top-[215px] left-[15px]',
  openai: 'top-[215px] right-[15px]',
  github: 'top-[335px] left-[15px]',
  azure: 'top-[335px] right-[15px]',
  dr_postgres: 'top-[455px] left-[35%] -translate-x-1/2',
  dr_app: 'top-[455px] left-[65%] -translate-x-1/2',
}

export default function SystemHealthOverview(props: Props) {
  const { health, logs, loading, pinned, pinging, restarting, onRefresh, onPing, onRestart, onTogglePin } = props
  const services = health.services

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {(Object.entries(services) as [ServiceKey, any][]).map(([key, service]) => {
          if (!SERVICE_LABELS[key]) return null
          return (
            <OverviewCard
              key={key}
              serviceKey={key}
              service={service}
              pinned={pinned.includes(key)}
              restarting={restarting[key]}
              onTogglePin={onTogglePin}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-premium p-6 flex flex-col justify-between min-h-[460px] overflow-hidden relative bg-black/25 dark:bg-black/45 border border-border/40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(94,106,210,0.06),transparent_65%)] pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between border-b border-border/40 pb-3">
            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Activity className="h-4 w-4 animate-pulse text-primary" /> Cybernetic Power Switchboard Topology
              </h3>
              <p className="text-[11px] text-muted-foreground">Tactical panel: service nodes plugged into central PDU power distributor</p>
            </div>
            <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition disabled:opacity-50">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
          <Topology health={health} restarting={restarting} pinging={pinging} onPing={onPing} onRestart={onRestart} />
        </div>
        <TerminalLog logs={logs} />
      </div>
    </>
  )
}

function OverviewCard({ serviceKey, service, pinned, restarting, onTogglePin }: any) {
  return (
    <div className={cn('card-premium p-4 relative overflow-hidden transition-all duration-300 flex flex-col justify-between border border-border/40', pinned ? 'border-primary/40 bg-primary/5 shadow-md' : 'hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5')}>
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ServiceIcon serviceKey={serviceKey} />
            <span className="text-[12px] font-bold text-foreground">{service.name}</span>
            <OpenLink href={service.host_link} />
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => onTogglePin(serviceKey)} title={pinned ? 'Unpin item' : 'Pin to dashboard'} className={cn('p-1 rounded hover:bg-secondary transition', pinned ? 'text-primary' : 'text-muted-foreground/30')}>
              <Pin className="h-3.5 w-3.5" />
            </button>
            <StatusIcon status={service.status} />
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <MiniMetric label="Status" value={restarting ? 'Restarting...' : service.status} capitalize />
          {service.latency_ms !== undefined && <MiniMetric label="Latency" value={`${service.latency_ms} ms`} />}
          {service.host && <MiniMetric label="Host" value={service.host} mono truncate />}
          {service.region && <MiniMetric label="Region" value={service.region} />}
        </div>
      </div>
      {service.api_key_valid !== undefined && (
        <div className="mt-3 pt-2 border-t border-border/20 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Credentials:</span>
          <span className={cn('px-1.5 py-0.5 rounded font-bold uppercase tracking-wider', service.api_key_valid ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20')}>
            {service.api_key_valid ? 'Valid' : 'Invalid'}
          </span>
        </div>
      )}
    </div>
  )
}

function Topology({ health, restarting, pinging, onPing, onRestart }: any) {
  return (
    <div className="relative w-full h-[380px] flex items-center justify-center my-2 select-none">
      <ConnectionLinesAndPlugs health={health} restarting={restarting} />
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <CentralPDU health={health} />
      </svg>
      {(Object.keys(health.services) as ServiceKey[]).map((key) => {
        if (!SERVICE_LABELS[key]) return null
        return (
          <NodeCard
            key={key}
            serviceKey={key}
            status={health.services[key].status}
            restarting={restarting[key]}
            pinging={pinging[key]}
            onPing={onPing}
            onRestart={onRestart}
          />
        )
      })}
    </div>
  )
}

function ConnectionLinesAndPlugs({ health, restarting }: { health: SystemHealthResponse; restarting: Record<string, boolean> }) {
  const lines = [
    { key: 'salesforce', d: 'M 320 90 L 320 130', plugD: 'M 316 118 h 8 v 5 h -8 z' },
    { key: 'postgres', d: 'M 127 115 L 240 115 L 295 150', plugD: 'M 287 146 h 5 v 8 h -5 z' },
    { key: 'app', d: 'M 513 115 L 400 115 L 345 150', plugD: 'M 348 146 h 5 v 8 h -5 z' },
    { key: 'pbi', d: 'M 127 210 L 240 210 L 290 195', plugD: 'M 282 191 h 5 v 8 h -5 z' },
    { key: 'openai', d: 'M 513 210 L 400 210 L 350 195', plugD: 'M 353 191 h 5 v 8 h -5 z' },
    { key: 'github', d: 'M 127 305 L 240 305 L 295 230', plugD: 'M 287 226 h 5 v 8 h -5 z' },
    { key: 'azure', d: 'M 513 305 L 400 305 L 345 230', plugD: 'M 348 226 h 5 v 8 h -5 z' },
    { key: 'dr_postgres', d: 'M 224 400 L 270 400 L 300 238', plugD: 'M 292 234 h 5 v 8 h -5 z' },
    { key: 'dr_app', d: 'M 416 400 L 370 400 L 340 238', plugD: 'M 343 234 h 5 v 8 h -5 z' },
  ] as const;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ pointerEvents: 'none' }}>
      <defs>
        <style>{`
          @keyframes pulseLine { to { stroke-dashoffset: -20; } }
          .line-pulse { stroke-dasharray: 4, 12; animation: pulseLine 1.2s linear infinite; }
        `}</style>
      </defs>
      {lines.map(({ key, d, plugD }) => {
        const service = health.services[key]
        if (!service) return null
        const status = service.status
        const color = status === 'online' ? '#10B981' : status === 'degraded' ? '#F59E0B' : '#F43F5E'
        
        let cx = 320
        let cy = 120.5
        if (key === 'postgres') { cx = 289.5; cy = 150 }
        else if (key === 'app') { cx = 350.5; cy = 150 }
        else if (key === 'pbi') { cx = 284.5; cy = 195 }
        else if (key === 'openai') { cx = 355.5; cy = 195 }
        else if (key === 'github') { cx = 289.5; cy = 230 }
        else if (key === 'azure') { cx = 350.5; cy = 230 }
        else if (key === 'dr_postgres') { cx = 294.5; cy = 238 }
        else if (key === 'dr_app') { cx = 345.5; cy = 238 }

        return (
          <g key={key}>
            {/* Background trace line */}
            <path d={d} stroke={color} strokeWidth={1.5} opacity={0.25} fill="none" />
            
            {/* Flowing animated dash signal */}
            {status !== 'offline' && !restarting[key] && (
              <path d={d} stroke={color} strokeWidth={1.5} className="line-pulse" fill="none" />
            )}
            
            {/* Blocky plug casing */}
            <path d={plugD} fill="#334155" stroke="#475569" strokeWidth="1" />
            
            {/* Mini plug state LED */}
            <circle cx={cx} cy={cy} r="1.2" fill={color} />
          </g>
        )
      })}
    </svg>
  )
}

function CentralPDU({ health }: { health: SystemHealthResponse }) {
  const getStatusColor = (key: ServiceKey) => {
    const service = health.services[key]
    if (!service) return '#64748b'
    if (service.status === 'online') return '#10B981'
    if (service.status === 'degraded') return '#F59E0B'
    return '#F43F5E'
  }

  const sockets = [
    { key: 'salesforce', label: 'SF', x: 320, y: 130, dir: 'up' },
    { key: 'postgres', label: 'DB', x: 295, y: 150, dir: 'left' },
    { key: 'app', label: 'API', x: 345, y: 150, dir: 'right' },
    { key: 'pbi', label: 'PBI', x: 290, y: 195, dir: 'left' },
    { key: 'openai', label: 'AI', x: 350, y: 195, dir: 'right' },
    { key: 'github', label: 'GIT', x: 295, y: 230, dir: 'left' },
    { key: 'azure', label: 'VM', x: 345, y: 230, dir: 'right' },
    { key: 'dr_postgres', label: 'DR_DB', x: 300, y: 238, dir: 'left' },
    { key: 'dr_app', label: 'DR_API', x: 340, y: 238, dir: 'right' },
  ] as const;

  return (
    <g className="z-10">
      {/* Outer Pulse Shadow */}
      <rect x="257" y="102" width="126" height="156" rx="10" fill="none" stroke="#5E6AD2" strokeWidth="1" opacity="0.1" className="animate-pulse" />
      
      {/* PDU Panel Box */}
      <rect x="260" y="105" width="120" height="150" rx="8" fill="#0F172A" fillOpacity="0.9" stroke="#334155" strokeWidth="1.5" />
      <rect x="262" y="107" width="116" height="146" rx="6" fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.4" />
      
      {/* PDU Lines */}
      <line x1="260" y1="121" x2="380" y2="121" stroke="#334155" strokeWidth="1" strokeDasharray="2, 2" />
      <line x1="260" y1="237" x2="380" y2="237" stroke="#334155" strokeWidth="1" strokeDasharray="2, 2" />

      {/* Brand Text */}
      <text x="320" y="116" textAnchor="middle" fill="#94A3B8" fontSize="7" fontWeight="bold" letterSpacing="1" fontFamily="monospace">CORE PDU v2.5</text>
      
      {/* Sockets */}
      {sockets.map((sock) => {
        const color = getStatusColor(sock.key);
        return (
          <g key={sock.key}>
            {/* Outer socket bezel */}
            <circle cx={sock.x} cy={sock.y} r="8.5" fill="#1E293B" stroke="#475569" strokeWidth="1" />
            
            {/* Socket core */}
            <circle cx={sock.x} cy={sock.y} r="5.5" fill="#020617" />
            
            {/* Glowing Ring representing socket connection */}
            <circle cx={sock.x} cy={sock.y} r="6" fill="none" stroke={color} strokeWidth="1" opacity="0.75" />
            
            {/* Center contact point */}
            <circle cx={sock.x} cy={sock.y} r="2" fill={color} />
            
            {/* Ping animation if online */}
            {health.services[sock.key]?.status === 'online' && (
              <circle cx={sock.x} cy={sock.y} r="9.5" fill="none" stroke={color} strokeWidth="0.5" className="animate-ping" style={{ transformOrigin: `${sock.x}px ${sock.y}px` }} />
            )}

            {/* Label positioning */}
            <text 
              x={sock.dir === 'left' ? sock.x + 13 : sock.dir === 'right' ? sock.x - 13 : sock.x} 
              y={sock.dir === 'up' ? sock.y + 13 : sock.y + 2.5} 
              textAnchor={sock.dir === 'left' ? 'start' : sock.dir === 'right' ? 'end' : 'middle'} 
              fill="#64748B" 
              fontSize="6.5" 
              fontWeight="bold"
              fontFamily="monospace"
            >
              {sock.label}
            </text>
          </g>
        )
      })}

      {/* Decorative LED panel indicators */}
      <circle cx="300" cy="244.5" r="1.5" fill="#10B981" className="animate-pulse" />
      <circle cx="320" cy="244.5" r="1.5" fill="#3B82F6" />
      <circle cx="340" cy="244.5" r="1.5" fill="#F59E0B" className="animate-pulse" style={{ animationDelay: '0.4s' }} />
    </g>
  )
}

function NodeCard({ serviceKey, status, restarting, pinging, onPing, onRestart }: any) {
  return (
    <motion.div 
      className={cn(
        'absolute w-28 p-2 rounded-lg bg-card/90 border border-border/80 backdrop-blur-md flex flex-col items-center shadow-lg transition-all duration-300', 
        SERVICE_POSITIONS[serviceKey as ServiceKey]
      )} 
      style={{ zIndex: 20 }} 
      whileHover={{ scale: 1.04, borderColor: 'var(--color-primary-500)' }}
    >
      <div className="flex items-center gap-1.5">
        <ServiceIcon serviceKey={serviceKey} small />
        <span className="text-[10px] font-bold text-foreground tracking-tight">{SERVICE_LABELS[serviceKey as ServiceKey]}</span>
      </div>
      <span className={cn('text-[9px] mt-1 px-1.5 py-0.5 rounded border font-semibold scale-95 origin-center', getStatusTextClass(status))}>
        {restarting ? 'BOOTING' : status.toUpperCase()}
      </span>
      <div className="flex gap-1 mt-2 w-full">
        <button onClick={() => onPing(serviceKey)} disabled={pinging || restarting} className="flex-1 text-[9px] font-bold bg-secondary/80 hover:bg-secondary text-foreground py-0.5 rounded transition disabled:opacity-30">
          {pinging ? 'PING...' : 'PING'}
        </button>
        <button onClick={() => onRestart(serviceKey)} disabled={restarting} className="p-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded transition disabled:opacity-30" title={`Restart ${serviceKey}`}>
          <Power className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  )
}

function TerminalLog({ logs }: { logs: string[] }) {
  const formatTerminalLog = (logStr: string) => {
    // Check if the log matches standard pattern: [HH:MM:SS] [LEVEL] message
    const match = logStr.match(/^(\[\d{2}:\d{2}:\d{2}\])\s+(\[[A-Z]+\])\s+(.*)$/)
    if (match) {
      const [_, timestamp, level, msg] = match
      let levelColor = 'text-sky-400'
      let levelBorder = 'border-sky-500/30'
      if (level.includes('WARN')) {
        levelColor = 'text-amber-400'
        levelBorder = 'border-amber-500/30'
      } else if (level.includes('ERROR') || level.includes('FAIL')) {
        levelColor = 'text-rose-400'
        levelBorder = 'border-rose-500/30'
      } else if (level.includes('RESTORE') || level.includes('SUCCESS') || level.includes('OK')) {
        levelColor = 'text-emerald-400'
        levelBorder = 'border-emerald-500/30'
      }

      return (
        <div className={cn('whitespace-pre-wrap border-l-2 pl-2', levelBorder)}>
          <span className="text-zinc-500 select-none mr-1.5">{timestamp}</span>
          <span className={cn('font-bold mr-1.5', levelColor)}>{level}</span>
          <span className="text-zinc-200">{msg}</span>
        </div>
      )
    }

    // Fallback classification if it doesn't match standard [HH:MM:SS] [LEVEL] format
    let color = 'text-zinc-300'
    let border = 'border-zinc-800'
    if (logStr.includes('[WARN]')) {
      color = 'text-amber-400'
      border = 'border-amber-500/30'
    } else if (logStr.includes('[ERROR') || logStr.includes('FAIL')) {
      color = 'text-rose-400'
      border = 'border-rose-500/30'
    } else if (logStr.includes('[RESTORE') || logStr.includes('SUCCESS') || logStr.includes('OK')) {
      color = 'text-emerald-400'
      border = 'border-emerald-500/30'
    }

    return (
      <div className={cn('whitespace-pre-wrap border-l-2 pl-2', border, color)}>
        {logStr}
      </div>
    )
  }

  return (
    <div className="card-premium flex flex-col h-[460px] overflow-hidden bg-zinc-950 border border-zinc-800 font-mono">
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-2 text-primary bg-zinc-900/40 shrink-0">
        <Terminal className="h-4 w-4 text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wider">Tactical HUD Console Logs</span>
      </div>
      <div className="p-4 flex-1 overflow-y-auto text-[10px] leading-relaxed space-y-2.5 select-text scrollbar-thin bg-zinc-950">
        {logs.map((logStr, index) => (
          <div key={index}>
            {formatTerminalLog(logStr)}
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniMetric({ label, value, mono = false, truncate = false, capitalize = false }: any) {
  return (
    <div className="flex justify-between border-b border-border/20 pb-1 gap-4 w-full">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold text-foreground text-right', mono && 'font-mono text-[10px]', truncate && 'truncate max-w-[85px]', capitalize && 'capitalize')} title={String(value)}>{value}</span>
    </div>
  )
}

function ServiceIcon({ serviceKey, small = false }: { serviceKey: ServiceKey; small?: boolean }) {
  const cls = small ? 'h-3.5 w-3.5 text-primary' : 'h-4 w-4 text-primary'
  if (serviceKey === 'postgres') return <Database className={cls} />
  if (serviceKey === 'pbi') return <Radio className={cls} />
  if (serviceKey === 'app') return <Cpu className={cls} />
  if (serviceKey === 'salesforce') return <Layers className={cls} />
  if (serviceKey === 'openai') return <Zap className={cls} />
  if (serviceKey === 'github') return <GitBranch className={cls} />
  return <Cloud className={cls} />
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'online') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'degraded') return <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
  return <ShieldAlert className="h-4 w-4 text-rose-500 animate-bounce" />
}
