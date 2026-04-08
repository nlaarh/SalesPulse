import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import axios from 'axios'
import Markdown from '@/components/Markdown'

const api = axios.create({ baseURL: '' })
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('si-auth-token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

export default function UpsellPanel({ accountId }: { accountId: string }) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState(false)

  const generate = async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.post(`/api/customers/${accountId}/upsell`)
      if (data.error) { setError(data.error); return }
      setAnalysis(data.analysis)
      setGenerated(true)
    } catch {
      setError('Failed to generate upsell analysis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">AI Upsell Analysis</p>
        </div>
        {!generated && (
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        )}
        {generated && (
          <button onClick={generate} disabled={loading}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {!generated && !loading && (
          <p className="text-[13px] text-muted-foreground/60 text-center py-4">
            Click <strong>Analyze</strong> to get AI-powered upsell recommendations for this member.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Analyzing member profile…</span>
          </div>
        )}
        {error && <p className="text-[13px] text-rose-500">{error}</p>}
        {analysis && <Markdown>{analysis}</Markdown>}
      </div>
    </div>
  )
}
