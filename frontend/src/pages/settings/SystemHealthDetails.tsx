import { Cpu, Search } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SystemHealthResponse } from '@/lib/api_admin'

type Props = {
  health: SystemHealthResponse
  setSuccess: (message: string) => void
  setError: (message: string) => void
}

export default function SystemHealthDetails({ health }: Props) {
  const [query, setQuery] = useState('')
  const envRows = (health.environment?.variables || []).filter((row) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return row.name.toLowerCase().includes(q) || row.masked.toLowerCase().includes(q)
  })

  return (
    <EnvironmentExplorer
      rows={envRows}
      files={health.environment?.files || []}
      query={query}
      onQuery={setQuery}
    />
  )
}

function EnvironmentExplorer({
  rows,
  files,
  query,
  onQuery,
}: {
  rows: Array<{ name: string; masked: string; configured: boolean }>
  files: Array<{ path: string; exists: boolean; keys_count: number }>
  query: string
  onQuery: (value: string) => void
}) {
  return (
    <div className="card-premium animate-enter p-6">
      <div className="flex flex-col gap-4 border-b border-border/40 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-primary">
            <Cpu className="h-4 w-4" />
            System Environment Configuration Explorer
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Securely view environment flags and configuration settings. Sensitive secrets are masked automatically.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search variables..."
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 pl-9 text-[12px] font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 sm:w-60"
          />
        </div>
      </div>

      <div className="mt-4 max-h-[300px] overflow-x-auto overflow-y-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-border bg-secondary/10 text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Variable</th>
              <th className="px-4 py-2.5">Masked Value</th>
              <th className="px-4 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/50 transition hover:bg-secondary/10">
                <td className="px-4 py-3 font-mono text-[11px] font-semibold text-foreground">{row.name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{row.masked || 'Not configured'}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn(
                    'rounded border px-2 py-0.5 text-[10px] font-bold uppercase',
                    row.configured ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500' : 'border-rose-500/20 bg-rose-500/10 text-rose-500',
                  )}>
                    {row.configured ? 'Configured' : 'Missing'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {files.map((file) => (
          <div key={file.path} className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-[11px]">
            <div className="font-mono text-foreground">{file.path}</div>
            <div className={file.exists ? 'text-emerald-500' : 'text-muted-foreground'}>
              {file.exists ? `${file.keys_count} keys loaded` : 'File not found'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
