import { useEffect, useRef, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCustomers, type CustomerSummary } from '@/lib/api'
import { Loader2, Search, X, ExternalLink } from 'lucide-react'

/* ── Formatters ──────────────────────────────────────────────────────────────*/

export function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export function fmtFull(n: number) {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function fmtNum(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export type Tab = 'customers' | 'destinations' | 'regions'

/* ── Pie3D ───────────────────────────────────────────────────────────────────*/

export interface Pie3DSlice { label: string; value: number; color: string; pct: number }

export function Pie3D({ data, height = 300, formatter }: {
  data: Pie3DSlice[]
  height?: number
  formatter: (v: number) => string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return null

  const cx = 200, cy = 120, rx = 140, ry = 70, depth = 28
  const svgW = 400, svgH = height

  let angle = -Math.PI / 2
  const slices = data.map(d => {
    const fraction = d.value / total
    const startAngle = angle
    const endAngle = angle + fraction * 2 * Math.PI
    angle = endAngle
    return { ...d, startAngle, endAngle, fraction }
  })

  const ep = (a: number, yOff = 0) => ({
    x: cx + rx * Math.cos(a),
    y: cy + ry * Math.sin(a) + yOff,
  })

  const sectorPath = (sa: number, ea: number, yOff = 0) => {
    const s = ep(sa, yOff), e = ep(ea, yOff)
    const large = ea - sa > Math.PI ? 1 : 0
    return `M${cx},${cy + yOff} L${s.x},${s.y} A${rx},${ry} 0 ${large} 1 ${e.x},${e.y} Z`
  }

  const sidePath = (sa: number, ea: number) => {
    const steps = Math.max(2, Math.ceil(((ea - sa) / (Math.PI * 2)) * 48))
    const pts: string[] = []
    for (let i = 0; i <= steps; i++) {
      const a = sa + (ea - sa) * (i / steps)
      const p = ep(a, 0)
      pts.push(`${p.x},${p.y}`)
    }
    for (let i = steps; i >= 0; i--) {
      const a = sa + (ea - sa) * (i / steps)
      const p = ep(a, depth)
      pts.push(`${p.x},${p.y}`)
    }
    return `M${pts.join(' L')} Z`
  }

  const darken = (hex: string, amt = 40) => {
    const h = hex.replace('#', '')
    const n = parseInt(h, 16)
    const r = Math.max(0, (n >> 16) - amt)
    const g = Math.max(0, ((n >> 8) & 0xff) - amt)
    const b = Math.max(0, (n & 0xff) - amt)
    return `rgb(${r},${g},${b})`
  }

  const labels = slices.map(s => {
    const mid = (s.startAngle + s.endAngle) / 2
    const lr = rx + 36
    const ly = ry + 18
    const lx = cx + lr * Math.cos(mid)
    const lyr = cy + ly * Math.sin(mid)
    const anchor = Math.cos(mid) > 0 ? 'start' : 'end'
    const ap = ep(mid, 0)
    return { ...s, lx, ly: lyr, anchor, ax: ap.x, ay: ap.y }
  })

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
      {slices.filter(s => Math.sin((s.startAngle + s.endAngle) / 2) < 0).map((s, i) => (
        <path key={`sb-${i}`} d={sidePath(s.startAngle, s.endAngle)}
          fill={darken(s.color)} stroke={darken(s.color, 60)} strokeWidth={0.5} />
      ))}
      {slices.filter(s => Math.sin((s.startAngle + s.endAngle) / 2) >= 0).map((s, i) => (
        <path key={`sf-${i}`} d={sidePath(s.startAngle, s.endAngle)}
          fill={darken(s.color)} stroke={darken(s.color, 60)} strokeWidth={0.5} />
      ))}
      {slices.map((s, i) => (
        <path key={`top-${i}`} d={sectorPath(s.startAngle, s.endAngle)}
          fill={s.color} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5}>
          <title>{`${s.label}: ${formatter(s.value)} (${s.pct.toFixed(1)}%)`}</title>
        </path>
      ))}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      {labels.map((l, i) => (
        <g key={`lbl-${i}`}>
          <line x1={l.ax} y1={l.ay} x2={l.lx} y2={l.ly} stroke="currentColor" strokeWidth={0.8} opacity={0.4} />
          <text x={l.lx + (l.anchor === 'start' ? 4 : -4)} y={l.ly}
            textAnchor={l.anchor as any} dominantBaseline="middle"
            fill="currentColor" fontSize={11} fontWeight={500}>
            {l.label} {l.pct.toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ── CustomerSearchBox ───────────────────────────────────────────────────────*/

export function CustomerSearchBox() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setSearching(true)
    searchCustomers(q)
      .then(r => { setResults(r); setOpen(true) })
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 350)
  }

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(id: string) {
    setQuery(''); setResults([]); setOpen(false)
    navigate(`/customer/${id}`)
  }

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40 transition-all">
        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50 shrink-0" /> : <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
        <input
          value={query} onChange={onChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by name, member # or email…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 text-foreground"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>
            <X className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-popover shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} onClick={() => pick(r.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left border-b border-border/50 last:border-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-primary">{(r.name || '?')[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold text-foreground truncate">{r.name}</span>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/60 flex-wrap">
                  {r.member_id && <span className="font-mono"># {r.member_id}</span>}
                  {r.email && <span>{r.email}</span>}
                  {r.city && <span>{r.city}{r.state ? `, ${r.state}` : ''}</span>}
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground/30 mt-1 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
