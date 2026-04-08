/**
 * Issue tracker — shared constants, helpers, and re-exported types.
 */

import React from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { severityColor, statusColor } from '@/lib/statusColors'

export type { GithubIssue, IssueComment, IssueStatus, IssueSeverity } from '@/lib/api'
import type { GithubIssue, IssueComment } from '@/lib/api'

/* ── Constants ──────────────────────────────────────────────────────────── */

export const SEVERITY_OPTIONS = [
  { value: 'high',   label: 'High',   cls: severityColor('high') },
  { value: 'medium', label: 'Medium', cls: severityColor('medium') },
  { value: 'low',    label: 'Low',    cls: severityColor('low') },
] as const

export const STATUS_OPTIONS: { value: import('@/lib/api').IssueStatus; label: string; dot: string }[] = [
  { value: 'backlog',       label: 'Backlog',        dot: statusColor('backlog') },
  { value: 'acknowledged',  label: 'Acknowledged',   dot: statusColor('acknowledged') },
  { value: 'investigating', label: 'Investigating',   dot: statusColor('investigating') },
  { value: 'in-progress',   label: 'In Progress',    dot: statusColor('in-progress') },
  { value: 'released',      label: 'Fixed',          dot: statusColor('released') },
  { value: 'closed',        label: 'Closed',         dot: statusColor('closed') },
  { value: 'cancelled',     label: "Won't Fix",      dot: statusColor('cancelled') },
]

export const VERDICT_MAP: Record<string, { label: string; icon: React.ReactElement; cls: string }> = {
  bug:     { label: 'Bug',          icon: React.createElement(AlertTriangle, { className: 'h-3 w-3' }), cls: 'text-rose-500' },
  not_bug: { label: 'Not a Bug',    icon: React.createElement(CheckCircle2,  { className: 'h-3 w-3' }), cls: 'text-emerald-500' },
  unclear: { label: 'Needs Review', icon: React.createElement(Info,          { className: 'h-3 w-3' }), cls: 'text-amber-500' },
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function getSev(issue: GithubIssue) {
  return issue.severity || issue.labels?.find(l => ['high','medium','low'].includes(l)) || 'medium'
}

export function getStatus(issue: GithubIssue): import('@/lib/api').IssueStatus {
  const s = issue.status || issue.labels?.find(l => l.startsWith('status:'))?.split(':')[1]
  return (s as import('@/lib/api').IssueStatus) || 'backlog'
}

export function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60)    return 'just now'
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export function isBotComment(c: IssueComment) {
  return c.user === 'github-actions[bot]'
    || c.user.toLowerCase().includes('bot')
    || c.body.startsWith('## 🤖 SalesPulse Bot')
    || c.body.includes('— **SalesPulse Bot**')
}

/** Strip the GitHub metadata header from issue body — show only user's description */
export function extractDescription(body: string): string {
  if (!body) return ''
  const parts = body.split(/\n---\n/)
  return (parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : body.trim())
}
