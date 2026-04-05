import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { uploadTargetsFile, confirmTargets } from '@/lib/api'
import {
  Upload, FileSpreadsheet, Check, X, AlertCircle,
  Loader2, Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import TargetGrid from '@/components/TargetGrid'

interface TargetRow {
  raw_name: string
  sf_name: string
  branch: string | null
  title: string | null
  monthly_target: number | null
  monthly_targets: Record<string, number> | null
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function TargetsTab() {
  const fileRef = useRef<HTMLInputElement>(null)

  // Upload section visibility
  const [showUpload, setShowUpload] = useState(false)

  // Upload/preview state
  const [preview, setPreview] = useState<{ filename: string; advisors: TargetRow[]; mapping: Record<string, string>; has_months: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSuccess('')
    setUploading(true)

    try {
      const data = await uploadTargetsFile(file)
      setPreview({
        filename: data.filename,
        advisors: data.advisors,
        mapping: data.mapping,
        has_months: data.has_months ?? false,
      })
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to parse file')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirm() {
    if (!preview) return
    setConfirming(true)
    setError('')

    try {
      const result = await confirmTargets(preview.filename, 'Travel', preview.advisors)
      setSuccess(`Saved ${result.count} advisor targets`)
      setPreview(null)
      setShowUpload(false)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save targets')
    } finally {
      setConfirming(false)
    }
  }

  const fmt = (v: number | null) =>
    v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : null

  return (
    <div className="space-y-6">
      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-600">
          <Check className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* 12-Month Target Grid — always visible first */}
      {!preview && (
        <div className="card-premium p-6">
          <div className="mb-4">
            <h3 className="text-[14px] font-semibold">Advisor Monthly Targets</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Edit individual cells or use fill controls. Changes are saved when you click Save.
            </p>
          </div>
          <TargetGrid line="Travel" />
        </div>
      )}

      {/* Upload toggle button */}
      {!preview && (
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" />
          {showUpload ? 'Hide Upload' : 'Upload Advisor List File'}
          {showUpload ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Upload Zone — hidden until toggled */}
      {showUpload && !preview && (
        <div className="card-premium p-6 animate-enter">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold">Upload Advisor Targets</h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Upload an Excel (.xlsx) or CSV file with advisor names, branches, and monthly targets.
                Column mapping is automatic (AI-powered).
              </p>
            </div>
            <FileSpreadsheet className="h-8 w-8 text-primary/30" />
          </div>

          <label className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl',
            'border-2 border-dashed border-border py-10 transition-all duration-200',
            'hover:border-primary/40 hover:bg-primary/5',
            uploading && 'pointer-events-none opacity-50',
          )}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground/40" />
            )}
            <span className="text-[13px] font-medium text-muted-foreground">
              {uploading ? 'Parsing file...' : 'Click to upload or drag & drop'}
            </span>
            <span className="text-[11px] text-muted-foreground/50">
              .xlsx, .xls, or .csv — max 5MB
            </span>
          </label>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="card-premium p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold">
                Preview — {preview.advisors.length} advisors
              </h3>
              <p className="mt-1 text-[12px] text-muted-foreground">
                File: {preview.filename}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreview(null)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold',
                  'bg-primary text-primary-foreground hover:opacity-90 transition-all',
                  confirming && 'opacity-50 cursor-not-allowed',
                )}
              >
                {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm & Save
              </button>
            </div>
          </div>

          {/* Column mapping info */}
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 text-primary" />
            Mapped: {Object.entries(preview.mapping).map(([k, v]) => `${k} → "${v}"`).join(' · ')}
          </div>

          <div className="max-h-[400px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name (SF)</th>
                  {preview.has_months ? (
                    <>
                      {MONTHS_SHORT.map(m => (
                        <th key={m} className="px-2 py-2 text-right font-semibold text-muted-foreground">{m}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-bold text-primary">Total</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Branch</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Monthly Target</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.advisors.map((a, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-secondary/30">
                    <td className="px-3 py-1.5 text-muted-foreground/50">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{a.sf_name}</td>
                    {preview.has_months && a.monthly_targets ? (
                      <>
                        {MONTHS_SHORT.map((_, mi) => {
                          const v = a.monthly_targets?.[String(mi + 1)] ?? 0
                          return (
                            <td key={mi} className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                              {v > 0 ? fmt(v) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums text-primary/80">
                          {fmt(Object.values(a.monthly_targets ?? {}).reduce((s, v) => s + v, 0))}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-muted-foreground">{a.branch || '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          {a.monthly_target != null ? (
                            <span className="tabular-nums font-medium">{fmt(a.monthly_target)}</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">No Target</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
