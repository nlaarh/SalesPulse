/**
 * EmailPopover — reusable inline email button + popover.
 * Caller provides `onSend(to)` which calls the appropriate API endpoint.
 */

import { useState, useRef, useEffect } from 'react'
import { Mail, Loader2, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onSend: (to: string) => Promise<void>
  description?: string
  label?: string
}

export default function EmailPopover({ onSend, description, label = 'Email' }: Props) {
  const [open, setOpen]   = useState(false)
  const [to, setTo]       = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  async function handleSend() {
    if (!to || sending) return
    setSending(true); setError(null)
    try {
      await onSend(to)
      setSent(true)
      setTimeout(() => { setOpen(false); setSent(false); setTo('') }, 2200)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? (e as Error).message ?? 'Failed to send'
      setError(msg)
    } finally { setSending(false) }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); setSent(false); setError(null) }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors',
          open
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
      >
        <Mail className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-popover shadow-xl p-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[11px] font-semibold text-foreground">Send to email</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {sent ? (
            <div className="flex items-center gap-2 py-2 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-medium">Report sent!</span>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={to}
                  onChange={e => { setTo(e.target.value); setError(null) }}
                  placeholder="recipient@email.com"
                  onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  disabled={!to || sending}
                  onClick={handleSend}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send'}
                </button>
              </div>
              {error && <p className="mt-1.5 text-[11px] text-rose-500">{error}</p>}
              {description && (
                <p className="mt-2 text-[10px] text-muted-foreground/50">{description}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
