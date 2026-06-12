export interface DbBackup {
  filename: string
  size_bytes: number | null
  created_at: string
  type?: 'local' | 'azure'
  backup_type?: string
}

export function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export type ServiceKey = 'salesforce' | 'postgres' | 'dr_postgres' | 'app' | 'dr_app' | 'pbi' | 'azure' | 'openai' | 'github'

import type { SystemHealthResponse } from '@/lib/api_admin'
export type { SystemHealthResponse }

export function getStatusTextClass(status: string) {
  switch (status) {
    case 'online':
      return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'
    case 'degraded':
      return 'text-amber-500 border-amber-500/20 bg-amber-500/10'
    case 'offline':
    default:
      return 'text-rose-500 border-rose-500/20 bg-rose-500/10'
  }
}

