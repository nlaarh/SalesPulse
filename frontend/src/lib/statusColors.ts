/**
 * Shared color-mapping utilities for stages, severities, and statuses.
 * Centralised here so every page uses the same palette.
 */

// ── Opportunity Stage Colors ──────────────────────────────────────────────

/** Badge classes (bg + text + border) for an opportunity stage name. */
export function stageColor(stage: string): string {
  const s = stage?.toLowerCase() ?? ''
  if (s === 'closed won' || s === 'invoice')  return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  if (s === 'closed lost')                    return 'bg-slate-500/15 text-slate-500 border-slate-500/20'
  if (s.includes('process') || s.includes('proposal') || s.includes('pipeline'))
                                                return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
  if (s.includes('qualifying') || s.includes('qualify')) return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
  return 'bg-muted/40 text-muted-foreground border-border'
}

/** Small dot color for a stage indicator. */
export function stageDot(stage: string): string {
  const s = stage?.toLowerCase() ?? ''
  if (s === 'closed won' || s === 'invoice') return 'bg-emerald-500'
  if (s === 'closed lost')                   return 'bg-slate-400'
  return 'bg-blue-500'
}

/** Badge classes for a lead status value. */
export function leadStatusColor(status: string, converted: boolean): string {
  if (converted) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  const s = status?.toLowerCase() ?? ''
  if (s.includes('closed') || s.includes('dead')) return 'bg-slate-500/15 text-slate-500 border-slate-500/20'
  if (s.includes('qualified')) return 'bg-blue-500/15 text-blue-600 border-blue-500/30'
  return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
}

// ── Issue Severity Colors ─────────────────────────────────────────────────

/** Badge classes for issue severity (high / medium / low). */
export function severityColor(severity: string): string {
  switch (severity) {
    case 'high':   return 'bg-rose-500/15 text-rose-500 border-rose-500/30'
    case 'medium': return 'bg-amber-500/15 text-amber-500 border-amber-500/30'
    case 'low':    return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
    default:       return 'bg-muted/40 text-muted-foreground border-border'
  }
}

// ── Issue Status Colors ───────────────────────────────────────────────────

/** Dot color class for an issue status. */
export function statusColor(status: string): string {
  switch (status) {
    case 'backlog':       return 'bg-slate-400'
    case 'acknowledged':  return 'bg-blue-400'
    case 'investigating': return 'bg-violet-400'
    case 'in-progress':   return 'bg-amber-400'
    case 'released':      return 'bg-emerald-500'
    case 'closed':        return 'bg-slate-400'
    case 'cancelled':     return 'bg-rose-400'
    default:              return 'bg-slate-400'
  }
}
