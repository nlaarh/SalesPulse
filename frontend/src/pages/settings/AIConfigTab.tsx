/**
 * AIConfigTab — Settings tab for AI provider / model / API key configuration.
 * Lets superadmin pick provider, enter model name, paste API key, and test.
 */

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Zap, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import axios from 'axios'

const api = axios.create({ baseURL: '', timeout: 30000 })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('si-auth-token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

interface AIConfig {
  provider: string
  model: string
  base_url: string
  has_key: boolean
  key_preview: string
  providers: Record<string, { label: string; models: string[] }>
}

export default function AIConfigTab() {
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/admin/ai-config')
      setConfig(data)
      setProvider(data.provider)
      setModel(data.model)
      setBaseUrl(data.base_url || '')
    } catch {
      setError('Failed to load config')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.put('/api/admin/ai-config', {
        provider,
        model,
        base_url: baseUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      })
      setSaved(true)
      setApiKey('')
      await load()
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await api.post('/api/admin/ai-config/test', {})
      setTestResult({ ok: true, msg: `Connected ✓ — model replied: "${data.reply}"` })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Test failed'
      setTestResult({ ok: false, msg: detail })
    } finally {
      setTesting(false)
    }
  }

  const selectedProvider = config?.providers[provider]
  const suggestedModels = selectedProvider?.models ?? []

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">AI & Integrations</h2>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        {/* Provider */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            AI Provider
          </label>
          <div className="flex flex-wrap gap-2">
            {config && Object.entries(config.providers).map(([key, p]) => (
              <button key={key} onClick={() => { setProvider(key); setModel(p.models[0]) }}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-medium transition-all',
                  provider === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                )}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. gpt-4o-mini"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {suggestedModels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestedModels.map(m => (
                <button key={m} onClick={() => setModel(m)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] transition-all',
                    model === m
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                  )}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            API Key
            {config?.has_key && (
              <span className="ml-2 font-normal normal-case text-emerald-500">
                {config.key_preview} (saved)
              </span>
            )}
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={config?.has_key ? 'Enter new key to replace…' : 'sk-…'}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Base URL (optional, shown for Azure) */}
        {(provider === 'azure' || baseUrl) && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Base URL <span className="font-normal normal-case">(Azure / custom endpoint)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://your-resource.openai.azure.com/"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </button>
          <button onClick={handleTest} disabled={testing || (!config?.has_key && !apiKey)}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:opacity-40">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Test Connection
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div className={cn(
            'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
            testResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-500',
          )}>
            {testResult.ok
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            {testResult.msg}
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-500">{error}</p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/40">
        API key is stored encrypted on the server and never sent to the browser after saving.
        Used for AI narrative summaries on dashboard pages.
      </p>
    </div>
  )
}
