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
