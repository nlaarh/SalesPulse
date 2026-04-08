/**
 * Shared formatting helpers used across multiple pages.
 *
 * Keep page-specific formatters in their own files.
 * Only functions that appear (or logically belong) in 2+ files live here.
 */

/* ── Axis formatter (currency, compact) ──────────────────────────────────── */

/** Format a number for a chart Y-axis: $1.2M, $450K, $80 */
export function fmtAxis(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

/* ── Date formatters ─────────────────────────────────────────────────────── */

/** Format an ISO date string to MM/DD/YYYY */
export function fmtDate(iso: string | null): string {
  if (!iso) return '\u2014'
  const s = iso.includes('T') ? iso : iso + 'T00:00:00'
  const d = new Date(s)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/** Format a YYYY-MM string to "Jan '25" style */
export function fmtMonth(ym: string): string {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [y, m] = ym.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} '${y.slice(2)}`
}

/* ── Score color utilities ───────────────────────────────────────────────── */

/** Text color class based on opportunity priority score */
export function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-500'
  if (s >= 60) return 'text-amber-500'
  return 'text-rose-500'
}

/** Background color class based on opportunity priority score */
export function scoreBg(s: number): string {
  if (s >= 80) return 'bg-emerald-500'
  if (s >= 60) return 'bg-amber-500'
  return 'bg-rose-500'
}

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Format a nullable number as currency ($1,234) or em-dash */
export function fmt$(n: number | null): string {
  return n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
}

/** Short month labels (0-indexed: Jan=0) */
export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const
