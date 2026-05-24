// ── Issues / Bug Reporting ─────────────────────────────────────────────────

import { api } from './api'
import type { AppUser, UserRole } from '@/contexts/AuthContext'

export interface GithubIssue {
  number: number
  title: string
  body: string
  state: string
  labels: string[]
  created_at: string
  html_url: string
  reporter?: string
  reporter_email?: string
  severity?: string
  status?: string
  page?: string
  triage_verdict?: string
  comments: number
}

export interface IssueComment {
  id: number
  body: string
  created_at: string
  user: string
}

export async function submitIssue(payload: {
  description: string
  severity: 'low' | 'medium' | 'high'
  page: string
  reporter: string
  email: string
}) {
  const { data } = await api.post('/api/issues', payload)
  return data as { issue_number: number; url: string; status: string }
}

export async function fetchIssues(state: 'open' | 'closed' | 'all' = 'open') {
  const { data } = await api.get('/api/issues', { params: { state } })
  return (Array.isArray(data) ? data : data.issues ?? []) as GithubIssue[]
}

export async function fetchIssue(number: number) {
  const { data } = await api.get(`/api/issues/${number}`)
  return data as { issue: GithubIssue; comments: IssueComment[] }
}

export async function addIssueComment(number: number, comment: string, name: string) {
  const { data } = await api.post(`/api/issues/${number}/comments`, { comment, name })
  return data as { status: string }
}

export type IssueStatus = 'backlog' | 'acknowledged' | 'investigating' | 'in-progress' | 'released' | 'closed' | 'cancelled'
export type IssueSeverity = 'low' | 'medium' | 'high'

export async function updateIssue(
  number: number,
  pin: string,
  opts: { status?: IssueStatus; severity?: IssueSeverity; title?: string; body?: string }
) {
  const { data } = await api.patch(`/api/issues/${number}`, { pin, ...opts })
  return data as { ok: boolean; state: string; status?: string; severity?: string; labels: string[] }
}

// ── Admin ─────────────────────────────────────────────────────────────────

export async function flushCache() {
  const { data } = await api.post('/api/admin/cache-reset')
  return data as { ok: boolean; flushed_l1: number; flushed_l2: number; owner_map_size: number }
}

export async function refreshGeoData() {
  const { data } = await api.post('/api/admin/geo/refresh')
  return data as { ok: boolean; counties: number; zips: number; total_population: number; last_refreshed: string | null }
}

export async function refreshGeographyData() {
  const { data } = await api.post('/api/admin/geo/refresh-geography')
  return data as {
    ok: boolean
    counties: number
    zips: number
    zip_county_assigned: number
    last_refreshed: string | null
    type: 'geography'
  }
}

export async function refreshCensusData() {
  const { data } = await api.post('/api/admin/geo/refresh-census')
  return data as {
    ok: boolean
    counties: number
    zips: number
    total_population: number
    last_refreshed: string | null
    type: 'census'
  }
}

export async function fetchGeoStatus() {
  const { data } = await api.get('/api/admin/geo/status')
  return data as { seeded: boolean; counties: number; zips: number; last_refreshed: string | null; source: string }
}

export async function fetchDmvStatus() {
  const { data } = await api.get('/api/admin/dmv/status')
  return data as { seeded: boolean; record_count: number; total_vehicles: number; last_refreshed: string | null; source: string }
}

export async function refreshDmvData() {
  const { data } = await api.post('/api/admin/dmv/refresh')
  return data as { ok: boolean; record_count: number; total_vehicles: number; last_refreshed: string | null }
}

export async function fetchDbInfo() {
  const { data } = await api.get('/api/admin/db/info')
  return data as { path: string; exists: boolean; size_kb: number; backups: { name: string; size_kb: number; created: number }[] }
}

export interface PerformanceSummaryResponse {
  window_minutes: number
  server: {
    total_requests: number
    avg_ms: number
    p50_ms: number
    p95_ms: number
    by_route: Array<{
      path: string
      requests: number
      avg_ms: number
      p50_ms: number
      p95_ms: number
      error_rate_pct: number
    }>
  }
  client: {
    total_events: number
    by_page: Array<{
      page: string
      events: number
      avg_ms: number
      p50_ms: number
      p95_ms: number
      metrics: Array<{
        metric: string
        count: number
        avg_ms: number
        p50_ms: number
        p95_ms: number
      }>
    }>
  }
}

export async function fetchPerformanceSummary(windowMinutes = 60): Promise<PerformanceSummaryResponse> {
  const { data } = await api.get('/api/admin/performance/summary', {
    params: { window_minutes: windowMinutes },
  })
  return data as PerformanceSummaryResponse
}

export async function reportClientRenderMetric(
  page: string,
  metric: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
) {
  const { data } = await api.post('/api/perf/client-render', {
    page, metric, duration_ms: durationMs, metadata: metadata || {},
  })
  return data as { ok: boolean }
}

export type SystemServiceStatus = 'online' | 'degraded' | 'offline'

export interface SystemServiceHealth {
  name: string
  status: SystemServiceStatus
  host?: string
  host_link?: string
  api_key_valid?: boolean | null
  api_key_error?: string | null
  logs?: string[]
  live_ping?: boolean
  quota_safe?: boolean
  latency_ms?: number | null
  pid?: number
  repo?: string
  branch?: string
  region?: string
  resource_group?: string
  database?: string
  username?: string
  client_id?: string
  remaining_in_window?: number | null
  [key: string]: unknown
}

export interface SystemHealthResponse {
  status: SystemServiceStatus
  timestamp: string
  quota_safe: boolean
  services: Record<string, SystemServiceHealth>
  logs: string[]
  env_variables: Record<string, string>
  environment: {
    files: Array<{ path: string; exists: boolean; keys_count: number; keys: string[] }>
    variables: Array<{ name: string; masked: string; configured: boolean }>
  }
  infrastructure: Record<string, string>
}

export async function fetchSystemHealth(): Promise<SystemHealthResponse> {
  const { data } = await api.get('/api/admin/system/health')
  return data as SystemHealthResponse
}

export async function pingSystemHealthService(serviceKey: string) {
  const { data } = await api.post(`/api/admin/system/health/ping/${serviceKey}`)
  return data as {
    service: string
    status: SystemServiceStatus
    live_ping: boolean
    message: string
    checked_by?: string
  }
}

export type DbBackupEntry = {
  filename: string
  created_at: string
  size_bytes: number
}

export async function fetchDbBackupList(): Promise<DbBackupEntry[]> {
  const { data } = await api.get('/api/admin/db/backups')
  return (data as { backups: DbBackupEntry[] }).backups ?? []
}

export async function createDbBackup(): Promise<DbBackupEntry> {
  const { data } = await api.post('/api/admin/db/backup')
  return data as DbBackupEntry
}

export async function downloadDbBackup(filename?: string) {
  const url = filename ? `/api/admin/db/backup/${encodeURIComponent(filename)}` : '/api/admin/db/backup'
  const resp = await api.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(resp.data)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `salesinsight_backup_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(blobUrl)
}

// ── Admin: Sessions, Users, Impersonation ─────────────────────────────────

export type AdminSession = {
  user_id: number
  email: string
  name: string
  role: string
  login_time: string
  last_seen: string
  expires_at: string
  ip_address: string | null
  impersonator_email: string | null
  online: boolean
}

export async function fetchAdminSessions(): Promise<AdminSession[]> {
  const { data } = await api.get('/api/admin/sessions')
  return data as AdminSession[]
}

export async function adminResetPassword(userId: number, newPassword: string) {
  const { data } = await api.post(`/api/admin/users/${userId}/password`, { new_password: newPassword })
  return data as { ok: true }
}

export async function adminImpersonate(userId: number) {
  const { data } = await api.post(`/api/admin/users/${userId}/impersonate`)
  return data as { token: string; user: AppUser; origin_token: string }
}

// Note: returning from impersonation MUST send the origin token (not the
// currently-active impersonated token) as the Authorization header — so it
// can't go through the shared `api` axios instance whose interceptor attaches
// whatever is currently in localStorage. AuthContext.stopImpersonating()
// uses raw axios with an explicit Authorization header for that reason.

export async function adminActivateUser(userId: number) {
  const { data } = await api.post(`/api/admin/users/${userId}/activate`)
  return data as { ok: true; user: AppUser }
}

// ── Users (thin wrappers around existing /api/users endpoints) ─────────────

export interface UserUpdatePayload {
  name?: string
  role?: UserRole
  department?: string | null
  password?: string
  is_active?: boolean
}

export interface UserCreatePayload {
  email: string
  name: string
  password: string
  role: UserRole
  department?: string | null
}

export async function listUsers(): Promise<AppUser[]> {
  const { data } = await api.get('/api/users')
  return data as AppUser[]
}

export async function createUser(payload: UserCreatePayload): Promise<AppUser> {
  const { data } = await api.post('/api/users', payload)
  return data as AppUser
}

export async function updateUser(userId: number, payload: UserUpdatePayload): Promise<AppUser> {
  const { data } = await api.put(`/api/users/${userId}`, payload)
  return data as AppUser
}

/** Soft-delete (backend now treats DELETE as soft-delete per new contract). */
export async function deleteUser(userId: number) {
  const { data } = await api.delete(`/api/users/${userId}`)
  return data as { ok: boolean }
}
