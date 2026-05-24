import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { SystemHealthResponse } from '@/lib/api_admin'
import { fetchSystemHealth, pingSystemHealthService } from '@/lib/api'
import { api } from '@/lib/api'
import SystemHealthDetails from './SystemHealthDetails'
import SystemHealthTopology from './SystemHealthTopology'
import DatabaseBackupsPanel from './DatabaseBackupsPanel'
import { StatusBadge } from './systemHealthUi'
import type { DbBackup } from './systemHealthTypes'

const INITIAL_LOGS = [
  'Initializing tactical system health dashboard...',
  'Secure connection established with node controller.',
]

export default function SystemHealthTab() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [logs, setLogs] = useState(INITIAL_LOGS)
  const [pinging, setPinging] = useState<Record<string, boolean>>({})
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Backup state
  const [dbBackups, setDbBackups] = useState<DbBackup[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null)
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [restorePin, setRestorePin] = useState('')
  const [restoreValidated, setRestoreValidated] = useState(false)
  const [undoBackupFile, setUndoBackupFile] = useState<string | null>(null)

  const appendLog = useCallback((message: string) => {
    const stamp = new Date().toLocaleTimeString()
    setLogs((items) => [`[${stamp}] ${message}`, ...items].slice(0, 60))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchSystemHealth()
      setHealth(data)
      setLastUpdated(new Date())
      setLogs((items) => [...(data.logs || []), ...items].slice(0, 60))
      appendLog(`System health queried: status matches ${data.status.toUpperCase()}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'System health query failed'
      setError(message)
      appendLog(`[ERROR] Failed to query health: ${message}`)
    } finally {
      setLoading(false)
    }
  }, [appendLog])

  const loadDbBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const { data } = await api.get('/api/admin/db/backups')
      setDbBackups((data as { backups: DbBackup[] }).backups ?? [])
    } catch (err) {
      appendLog(`[ERROR] Failed to load backups: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setLoadingBackups(false)
    }
  }, [appendLog])

  useEffect(() => {
    void load()
    void loadDbBackups()
  }, [load, loadDbBackups])

  const counts = useMemo(() => {
    const items = Object.values(health?.services || {})
    return {
      online: items.filter((item) => item.status === 'online').length,
      degraded: items.filter((item) => item.status === 'degraded').length,
      offline: items.filter((item) => item.status === 'offline').length,
    }
  }, [health])

  async function pingNode(serviceKey: string) {
    setPinging((prev) => ({ ...prev, [serviceKey]: true }))
    appendLog(`Sending safe health request to ${serviceKey.toUpperCase()} node...`)
    try {
      const result = await pingSystemHealthService(serviceKey)
      appendLog(`Reply from ${serviceKey.toUpperCase()} node: ${result.message} status=${result.status.toUpperCase()} live_ping=${result.live_ping}`)
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ping failed'
      appendLog(`[WARN] Request failed for ${serviceKey.toUpperCase()} node: ${message}`)
    } finally {
      setPinging((prev) => ({ ...prev, [serviceKey]: false }))
    }
  }

  async function handleCreateBackup() {
    setCreatingBackup(true)
    appendLog('Initiating full database serialization snapshot...')
    try {
      const { data } = await api.post('/api/admin/db/backup')
      appendLog(`Backup created: ${(data as DbBackup).filename}`)
      setSuccess('Backup snapshot created')
      setTimeout(() => setSuccess(''), 3000)
      await loadDbBackups()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup failed'
      appendLog(`[ERROR] Database backup failed: ${message}`)
      setError('Backup creation failed')
      setTimeout(() => setError(''), 3000)
    } finally {
      setCreatingBackup(false)
    }
  }

  async function handleRestore() {
    if (!selectedBackup || confirmText !== 'RESTORE' || restorePin !== '121838' || !restoreValidated) return
    const backupObj = dbBackups.find((b) => b.filename === selectedBackup)
    const backupType = backupObj?.type ?? 'local'

    setRestoringBackup(true)
    setConfirmRestoreOpen(false)

    // Auto-create safety backup before overwriting
    appendLog('[RESTORE-PREP] Creating safety snapshot before restore...')
    try {
      const { data } = await api.post('/api/admin/db/backup')
      setUndoBackupFile((data as DbBackup).filename)
      appendLog(`[RESTORE-PREP] Safety snapshot created: ${(data as DbBackup).filename}`)
    } catch (e) {
      appendLog(`[RESTORE-WARN] Safety backup failed: ${e instanceof Error ? e.message : 'unknown'}. Proceeding anyway.`)
    }

    appendLog(`[CRITICAL] DATABASE RESTORE INITIALIZED FROM ${selectedBackup} (${backupType.toUpperCase()})`)
    try {
      await api.post(`/api/admin/db/restore?filename=${selectedBackup}&backup_type=${backupType}`)
      appendLog('[RESTORE] Restore completed successfully.')
      setSuccess('Database restored successfully')
      setTimeout(() => setSuccess(''), 5000)
      resetRestoreState()
      await loadDbBackups()
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed'
      appendLog(`[RESTORE-ERROR] ${message}`)
      setError(`Restore failed: ${message}`)
      setTimeout(() => setError(''), 5000)
      setRestoringBackup(false)
      setConfirmText('')
      setRestorePin('')
      setRestoreValidated(false)
    }
  }

  async function handleUndoRestore() {
    if (!undoBackupFile) return
    setRestoringBackup(true)
    appendLog(`[UNDO] Reverting to pre-restore snapshot: ${undoBackupFile}`)
    try {
      await api.post(`/api/admin/db/restore?filename=${undoBackupFile}&backup_type=local`)
      appendLog('[UNDO] Database reverted successfully.')
      setUndoBackupFile(null)
      await loadDbBackups()
      await load()
    } catch (err) {
      appendLog(`[UNDO-ERROR] Revert failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setRestoringBackup(false)
    }
  }

  function resetRestoreState() {
    setRestoringBackup(false)
    setSelectedBackup(null)
    setConfirmText('')
    setRestorePin('')
    setRestoreValidated(false)
  }

  if (loading && !health) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!health) {
    return (
      <div className="card-premium flex items-center gap-3 border-destructive/20 p-5 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <div>
          <p className="text-sm font-semibold">System health failed to load.</p>
          <p className="text-xs">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-premium animate-enter overflow-hidden p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wider text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              SalesPulse Tactical System Health
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              No automatic paid-provider pings. Salesforce, Power BI, OpenAI, GitHub, and Azure show configured status until a safe manual check is requested.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={health.status} />
            <span className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              Last updated: {lastUpdated ? lastUpdated.toLocaleString() : new Date(health.timestamp).toLocaleString()}
            </span>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <HudStat label="Online" value={counts.online} tone="text-emerald-500" />
          <HudStat label="Degraded" value={counts.degraded} tone="text-amber-500" />
          <HudStat label="Offline" value={counts.offline} tone="text-rose-500" />
        </div>
      </div>

      <SystemHealthTopology
        health={health}
        logs={logs}
        loading={loading}
        pinging={pinging}
        onRefresh={() => void load()}
        onPing={(serviceKey) => void pingNode(serviceKey)}
      />

      {/* Undo restore banner */}
      {undoBackupFile && (
        <div className="card-premium flex flex-col gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-amber-500">
            <ShieldAlert className="h-6 w-6 animate-pulse" />
            <div>
              <span className="font-bold text-foreground">Database Restored Successfully</span>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Safety snapshot auto-created at{' '}
                <span className="font-mono font-semibold text-amber-400">{undoBackupFile}</span>. Revert if needed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => void handleUndoRestore()}
              disabled={restoringBackup}
              className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-[11px] font-bold tracking-wide text-black transition hover:bg-amber-600 disabled:opacity-50"
            >
              UNDO RESTORE
            </button>
            <button
              onClick={() => setUndoBackupFile(null)}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-[11px] text-foreground transition hover:bg-secondary/80"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <DatabaseBackupsPanel
        backups={dbBackups}
        loadingBackups={loadingBackups}
        creatingBackup={creatingBackup}
        restoringBackup={restoringBackup}
        selectedBackup={selectedBackup}
        confirmRestoreOpen={confirmRestoreOpen}
        confirmText={confirmText}
        restorePin={restorePin}
        onRestorePinChange={setRestorePin}
        restoreValidated={restoreValidated}
        onRestoreValidatedChange={setRestoreValidated}
        onCreateBackup={() => void handleCreateBackup()}
        onOpenRestore={(filename) => { setSelectedBackup(filename); setConfirmRestoreOpen(true) }}
        onCancelRestore={() => { setConfirmRestoreOpen(false); setSelectedBackup(null); setConfirmText(''); setRestorePin(''); setRestoreValidated(false) }}
        onConfirmTextChange={setConfirmText}
        onRestore={() => void handleRestore()}
      />

      <SystemHealthDetails health={health} setSuccess={setSuccess} setError={setError} />

      {success && <Toast tone="success" message={success} />}
      {error && <Toast tone="error" message={error} />}
    </div>
  )
}

function HudStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function Toast({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium ${tone === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
      {tone === 'success' ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {message}
    </div>
  )
}
