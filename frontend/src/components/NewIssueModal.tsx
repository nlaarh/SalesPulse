import { useState } from 'react'
import { Bug, Loader2, Plus, X } from 'lucide-react'
import { submitIssue } from '@/lib/api'

export default function NewIssueModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const [title, setTitle]   = useState('')
  const [desc, setDesc]     = useState('')
  const [sev, setSev]       = useState<'low' | 'medium' | 'high'>('medium')
  const [page, setPage]     = useState('')
  const [name, setName]     = useState(localStorage.getItem('sp_reporter_name') || '')
  const [email, setEmail]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')

  const submit = async () => {
    if (!title.trim() || !desc.trim()) { setErr('Title and description are required'); return }
    setBusy(true); setErr('')
    try {
      if (name.trim()) localStorage.setItem('sp_reporter_name', name.trim())
      await submitIssue({ description: `${title.trim()}\n\n${desc.trim()}`, severity: sev, page, reporter: name || 'User', email })
      onSubmitted()
    } catch {
      setErr('Failed to submit. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-bold text-foreground">New Issue</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 p-5">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Issue title *"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[14px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            placeholder="Describe the issue in detail — what happened, what you expected… *"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Severity</label>
              <select value={sev} onChange={e => setSev(e.target.value as typeof sev)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Page / Area</label>
              <input value={page} onChange={e => setPage(e.target.value)}
                placeholder="e.g. Dashboard, Advisor page…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Your Name</label>
              <input value={name} onChange={e => { setName(e.target.value); localStorage.setItem('sp_reporter_name', e.target.value) }}
                placeholder="Name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-muted-foreground">Email (for updates)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          {err && <p className="text-[13px] text-rose-500">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !title.trim() || !desc.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Submit Issue
          </button>
        </div>
      </div>
    </div>
  )
}
