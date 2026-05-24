import {
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemServiceHealth, SystemServiceStatus } from '@/lib/api_admin'

export const SERVICE_LABELS: Record<string, string> = {
  salesforce: 'SALESFORCE',
  postgres: 'DATABASE',
  dr_postgres: 'DR DATABASE',
  app: 'API NODE',
  pbi: 'POWER BI',
  azure: 'AZURE VM',
  openai: 'OPENAI SERVICE',
  github: 'GITHUB REPO',
}

export const SERVICE_ORDER = ['salesforce', 'postgres', 'dr_postgres', 'app', 'pbi', 'azure', 'openai', 'github']

export function statusTone(status?: SystemServiceStatus | string) {
  if (status === 'online') {
    return {
      text: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      hex: '#10B981',
    }
  }
  if (status === 'degraded') {
    return {
      text: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      hex: '#F59E0B',
    }
  }
  return {
    text: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    hex: '#F43F5E',
  }
}

export function StatusBadge({ status }: { status?: SystemServiceStatus | string }) {
  const tone = statusTone(status)
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', tone.bg, tone.text, tone.border)}>
      {(status || 'offline').toUpperCase()}
    </span>
  )
}

export function StatusIcon({ status }: { status?: SystemServiceStatus | string }) {
  if (status === 'online') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  if (status === 'degraded') return <ShieldAlert className="h-4 w-4 animate-pulse text-amber-500" />
  return <ShieldAlert className="h-4 w-4 animate-bounce text-rose-500" />
}

export function ServiceIcon({ serviceKey, small = false }: { serviceKey: string; small?: boolean }) {
  const cls = small ? 'h-3.5 w-3.5 text-primary' : 'h-4 w-4 text-primary'
  if (serviceKey === 'postgres' || serviceKey === 'dr_postgres') return <Database className={cls} />
  if (serviceKey === 'pbi') return <Layers className={cls} />
  if (serviceKey === 'app') return <Cpu className={cls} />
  if (serviceKey === 'salesforce') return <Layers className={cls} />
  if (serviceKey === 'openai') return <Zap className={cls} />
  if (serviceKey === 'github') return <GitBranch className={cls} />
  return <Cloud className={cls} />
}

export function Field({
  label,
  value,
  mono = false,
  strong = false,
  truncate = false,
}: {
  label: string
  value?: unknown
  mono?: boolean
  strong?: boolean
  truncate?: boolean
}) {
  return (
    <div className={cn(truncate && 'min-w-0')}>
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        title={String(value ?? 'N/A')}
        className={cn('block text-foreground', mono ? 'font-mono text-[11px]' : 'font-medium', strong && 'font-semibold', truncate && 'truncate')}
      >
        {String(value ?? 'N/A')}
      </span>
    </div>
  )
}

export function CredentialBadge({ service }: { service: SystemServiceHealth }) {
  if (service.api_key_valid === undefined || service.api_key_valid === null) {
    return <span className="text-[10px] text-muted-foreground">No credentials</span>
  }
  return service.api_key_valid ? (
    <span className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
      <ShieldCheck className="h-3 w-3" />
      Valid
    </span>
  ) : (
    <span
      title={service.api_key_error || 'Credential verification failed'}
      className="flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-500"
    >
      <ShieldAlert className="h-3 w-3" />
      Failed
    </span>
  )
}

function renderLogLine(line: string) {
  if (line.includes('No recent') || line.includes('No events') || line.includes('No logs')) {
    return <span className="italic text-zinc-500">{line}</span>
  }
  const match = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s+(\[[A-Z]+\]|[A-Z_]+(?:\s+[A-Z_]+)*)(:|\s+-)\s+(.*)$/)
  if (!match) return <span className="text-zinc-300">{line}</span>
  const [, stamp, level, sep, message] = match
  const parts = message.split(' | ')
  return (
    <>
      <span className="mr-1.5 select-none text-zinc-500">{stamp}</span>
      <span className="font-semibold tracking-wide text-cyan-400">{level}</span>
      <span className="mx-1 text-zinc-600">{sep}</span>
      {parts.map((part, idx) => (
        <span key={`${part}-${idx}`}>
          {idx > 0 && <span className="mx-1.5 select-none text-zinc-700">|</span>}
          <span className={cn(
            idx === 0 && 'text-zinc-100',
            part.endsWith('ms') && (parseInt(part) > 500 ? 'font-semibold text-amber-400' : 'font-semibold text-emerald-400'),
            part.startsWith('rows=') && 'text-sky-400',
            part.startsWith('ERR=') && 'rounded border border-rose-500/20 bg-rose-500/10 px-1 font-bold text-rose-400',
            idx > 0 && !part.endsWith('ms') && !part.startsWith('rows=') && !part.startsWith('ERR=') && 'text-zinc-400',
          )}>
            {part}
          </span>
        </span>
      ))}
    </>
  )
}

export function ServiceLogs({ logs }: { logs?: string[] }) {
  if (!logs?.length) return null
  return (
    <div className="col-span-2 mt-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
        <Terminal className="h-3.5 w-3.5" />
        Recent Service Transactions
      </div>
      <div className="max-h-[130px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed shadow-inner">
        {logs.map((line, idx) => (
          <div key={`${line}-${idx}`} className="mb-1.5 break-words border-b border-zinc-900 pb-1.5 last:mb-0 last:border-b-0 last:pb-0">
            {renderLogLine(line)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function OpenLink({ href }: { href?: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open resource link"
      className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}
