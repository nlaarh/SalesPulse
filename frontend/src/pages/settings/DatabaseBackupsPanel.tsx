import { motion } from 'framer-motion'
import { Cloud, Database, FileText, RefreshCw, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes } from './systemHealthTypes'
import type { DbBackup } from './systemHealthTypes'

interface Props {
  backups: DbBackup[]
  loadingBackups: boolean
  creatingBackup: boolean
  restoringBackup: boolean
  selectedBackup: string | null
  confirmRestoreOpen: boolean
  confirmText: string
  restorePin: string
  onRestorePinChange: (value: string) => void
  restoreValidated: boolean
  onRestoreValidatedChange: (value: boolean) => void
  onCreateBackup: () => void
  onOpenRestore: (filename: string) => void
  onCancelRestore: () => void
  onConfirmTextChange: (value: string) => void
  onRestore: () => void
}

export default function DatabaseBackupsPanel(props: Props) {
  const {
    backups, loadingBackups, creatingBackup, restoringBackup,
    selectedBackup, confirmRestoreOpen, confirmText,
    restorePin, onRestorePinChange, restoreValidated, onRestoreValidatedChange,
    onCreateBackup, onOpenRestore, onCancelRestore, onConfirmTextChange, onRestore,
  } = props

  const selectedBackupObj = backups.find((b) => b.filename === selectedBackup)

  return (
    <>
      <div className="card-premium animate-enter p-6">
        <div className="flex flex-col gap-4 border-b border-border/40 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-primary">
              <Database className="h-4 w-4" />
              Database Backup & Recovery Console
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Point-in-time snapshots and restore from local files or Azure Cloud backups.
            </p>
          </div>
          <button
            onClick={onCreateBackup}
            disabled={creatingBackup || restoringBackup}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-[12px] font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', creatingBackup && 'animate-spin')} />
            {creatingBackup ? 'Creating…' : 'Create Snapshot'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-secondary/10 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 font-mono">Identifier</th>
                <th className="px-4 py-2.5 text-right">Size</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingBackups && backups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    <RefreshCw className="mr-2 inline h-4 w-4 animate-spin text-primary/50" />
                    Loading backups…
                  </td>
                </tr>
              )}
              {!loadingBackups && backups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                    No snapshots yet — click Create Snapshot to generate the first one.
                  </td>
                </tr>
              )}
              {backups.map((backup) => (
                <tr key={backup.filename} className="border-b border-border/50 transition hover:bg-secondary/10">
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {backup.created_at ? new Date(backup.created_at).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold',
                      backup.type === 'azure'
                        ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-500',
                    )}>
                      {backup.type === 'azure' ? <Cloud className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      {backup.backup_type || 'Local JSON'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{backup.filename}</td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {backup.size_bytes !== null ? formatBytes(backup.size_bytes!) : 'Cloud Managed'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onOpenRestore(backup.filename)}
                      disabled={creatingBackup || restoringBackup}
                      className="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmRestoreOpen && (
        <RestoreDialog
          selectedBackup={selectedBackup}
          selectedBackupObj={selectedBackupObj}
          confirmText={confirmText}
          restorePin={restorePin}
          onRestorePinChange={onRestorePinChange}
          restoreValidated={restoreValidated}
          onRestoreValidatedChange={onRestoreValidatedChange}
          onCancel={onCancelRestore}
          onConfirmTextChange={onConfirmTextChange}
          onRestore={onRestore}
          restoringBackup={restoringBackup}
        />
      )}
    </>
  )
}

function RestoreDialog({
  selectedBackup, selectedBackupObj, confirmText, restorePin, onRestorePinChange,
  restoreValidated, onRestoreValidatedChange, onCancel, onConfirmTextChange, onRestore, restoringBackup,
}: {
  selectedBackup: string | null
  selectedBackupObj: DbBackup | undefined
  confirmText: string
  restorePin: string
  onRestorePinChange: (v: string) => void
  restoreValidated: boolean
  onRestoreValidatedChange: (v: boolean) => void
  onCancel: () => void
  onConfirmTextChange: (v: string) => void
  onRestore: () => void
  restoringBackup: boolean
}) {
  const isAzure = selectedBackupObj?.type === 'azure'
  const canExecute = restoreValidated && confirmText === 'RESTORE' && restorePin === '121838' && !restoringBackup

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card-premium relative w-full max-w-md border-rose-500/40 bg-background p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 text-rose-500">
          <ShieldAlert className="h-6 w-6 animate-pulse" />
          <h4 className="text-[14px] font-bold uppercase tracking-wider">Critical Database Restore</h4>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-foreground">
          Restore from {isAzure ? 'Azure Cloud Backup' : 'local snapshot'}:
          <span className="mt-1 block font-mono text-[11px] font-bold text-rose-400">{selectedBackup}</span>
        </p>

        {isAzure ? (
          <div className="mt-3 space-y-1 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-[11px] text-cyan-400">
            <p className="font-semibold">⚠ AZURE RESTORE</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Triggers a Point-in-Time Restore (PITR) on Azure.</li>
              <li>Provisions a new server <span className="font-mono">fslapp-pg-restored</span> — primary is NOT overwritten.</li>
              <li>Provisioning takes ~10–15 minutes.</li>
            </ul>
          </div>
        ) : (
          <div className="mt-3 space-y-1 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-[11px] text-rose-400">
            <p className="font-semibold">⚠ WARNING — THIS WILL:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Drop all active tables and schemas permanently</li>
              <li>Clear all current database records</li>
              <li>Invalidate all application cache layers</li>
              <li>Terminate all active user sessions</li>
            </ul>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-2 rounded border border-rose-500/25 bg-rose-500/5 p-2.5 text-[11px] text-rose-400">
            <input
              type="checkbox"
              checked={restoreValidated}
              onChange={(e) => onRestoreValidatedChange(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-border bg-secondary"
            />
            <span className="select-none leading-snug">
              I acknowledge that database schema recovery is destructive and cannot be stopped once initialized.
            </span>
          </label>

          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">
              Type <span className="font-bold text-foreground">RESTORE</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => onConfirmTextChange(e.target.value)}
              disabled={!restoreValidated}
              placeholder="RESTORE"
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[12px] font-bold text-foreground outline-none focus:border-rose-500/50 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground">Security PIN:</label>
            <input
              type="password"
              value={restorePin}
              onChange={(e) => onRestorePinChange(e.target.value)}
              placeholder="••••••"
              maxLength={6}
              disabled={!restoreValidated || confirmText !== 'RESTORE'}
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-center font-mono text-[12px] font-bold tracking-widest text-foreground outline-none focus:border-rose-500/50 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border bg-secondary py-2 text-[12px] font-semibold text-foreground transition hover:bg-secondary/80"
          >
            Cancel
          </button>
          <button
            onClick={onRestore}
            disabled={!canExecute}
            className="flex-1 rounded-lg bg-rose-600 py-2 text-[12px] font-bold text-white shadow-md transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoringBackup ? 'Restoring…' : 'Execute Restore'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
