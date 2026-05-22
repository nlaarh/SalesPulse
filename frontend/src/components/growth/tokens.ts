// Growth Plan — design tokens lifted from AAA_WCNY_Path_To_120M_Growth_Plan_v1.pdf

export const GROWTH_COLORS = {
  navy: '#002B5C',
  navyLight: '#004494',
  navyDark: '#001A3D',
  red: '#C41E3A',
  redDeep: '#A1162D',
  teal: '#00838F',
  tealLight: '#00ACC1',
  green: '#2E7D32',
  greenLight: '#4CAF50',
  orange: '#E65100',
  orangeLight: '#FF9800',
  purple: '#6A1B9A',
  purpleLight: '#AB47BC',
  paperBg: '#F8F9FB',
  ink: '#1A2332',
  inkSoft: '#4A5567',
  rule: '#D6DDE5',
} as const

// Choropleth ramps (matplotlib-style sequential scales) — picked per metric
export const RAMPS = {
  membership: ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#43A047', '#2E7D32', '#1B5E20'],
  insurance: ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#E53935', '#C62828', '#B71C1C'],
  travel: ['#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726', '#FB8C00', '#E65100', '#BF360C'],
  auto: ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#9C27B0', '#7B1FA2', '#4A148C'],
  home: ['#E0F2F1', '#B2DFDB', '#80CBC4', '#4DB6AC', '#26A69A', '#009688', '#00796B', '#004D40'],
  density: ['#EDE7F6', '#D1C4E9', '#B39DDB', '#9575CD', '#7E57C2', '#673AB7', '#512DA8', '#311B92'],
} as const

export type RampKey = keyof typeof RAMPS

// Look up a color in a ramp given a 0-1 normalized value
export function rampColor(value: number, ramp: readonly string[], lo = 0, hi = 1): string {
  if (!Number.isFinite(value)) return '#E5E7EB'
  const n = hi > lo ? (value - lo) / (hi - lo) : 0
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(n * ramp.length)))
  return ramp[i]
}

// ── Metallic gradient helpers for ECharts ─────────────────────────────────────
// Produces a translucent linear gradient that looks polished (not flat) and a
// soft drop shadow. Used by every bar / pie / area chart for a uniform
// professional finish.

interface MetallicOpts {
  /** "horizontal" (default — left→right, good for horizontal bars) or "vertical" */
  direction?: 'horizontal' | 'vertical'
  /** Overall opacity (0..1). 0.92 gives the subtle "glass" effect. */
  alpha?: number
  /** Shadow strength multiplier (0..1). 0 disables. */
  shadow?: number
}

/** Linear-gradient color spec for ECharts itemStyle.color */
export function metallicGradient(baseHex: string, opts: MetallicOpts = {}) {
  const dir = opts.direction ?? 'horizontal'
  const a = opts.alpha ?? 0.92
  const c = hexToRgb(baseHex)
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: dir === 'horizontal' ? 1 : 0,
    y2: dir === 'horizontal' ? 0 : 1,
    colorStops: [
      { offset: 0,   color: `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.55})` },
      { offset: 0.5, color: `rgba(${c.r}, ${c.g}, ${c.b}, ${a * 0.85})` },
      { offset: 1,   color: `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` },
    ],
  }
}

/** Soft drop shadow paired with the metallic gradient */
export function metallicShadow(baseHex: string, strength = 0.22) {
  const c = hexToRgb(baseHex)
  return {
    shadowBlur: 8,
    shadowColor: `rgba(${c.r}, ${c.g}, ${c.b}, ${strength})`,
    shadowOffsetY: 2,
    shadowOffsetX: 0,
  }
}

/** Translucent area-fill gradient (for line chart area underneath) */
export function metallicAreaGradient(baseHex: string) {
  const c = hexToRgb(baseHex)
  return {
    type: 'linear' as const,
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0,   color: `rgba(${c.r}, ${c.g}, ${c.b}, 0.38)` },
      { offset: 0.6, color: `rgba(${c.r}, ${c.g}, ${c.b}, 0.12)` },
      { offset: 1,   color: `rgba(${c.r}, ${c.g}, ${c.b}, 0.0)` },
    ],
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  }
}

// Format helpers used everywhere in the report
export const fmt = {
  dollars(n: number): string {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n.toFixed(0)}`
  },
  num(n: number): string {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  },
  pct(n: number | null | undefined, digits = 1): string {
    if (n == null || !Number.isFinite(n)) return '—'
    return `${(n * 100).toFixed(digits)}%`
  },
  pctPlain(n: number | null | undefined, digits = 1): string {
    if (n == null || !Number.isFinite(n)) return '—'
    return `${n.toFixed(digits)}%`
  },
}
