import { useState, useEffect, lazy, Suspense } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  AlertCircle, Check, ScrollText, Target, Zap, Database, Gauge,
  HelpCircle, Bug, Users, Server,
} from 'lucide-react'
import ActivityLogsTable from '@/components/ActivityLogsTable'
import TargetsTab from '@/pages/settings/TargetsTab'
import AIConfigTab from '@/pages/settings/AIConfigTab'
import DataSystemSection from '@/pages/settings/DataSystemSection'
import PerformanceTab from '@/pages/settings/PerformanceTab'

const HelpPage = lazy(() => import('@/pages/Help'))
const IssuesPage = lazy(() => import('@/pages/Issues'))
const CacheStatusTab = lazy(() => import('@/pages/settings/CacheStatusTab'))
const SystemHealthTab = lazy(() => import('@/pages/settings/SystemHealthTab'))
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'))

// Settings = the admin home. Superadmin sees every tab; the 'admin' role sees
// only the Users tab (user management is the one feature it owns).
type SettingsTab = 'users' | 'logs' | 'targets' | 'ai' | 'performance' | 'help' | 'issues' | 'cache' | 'system'

export default function Settings() {
  const { isAdmin, isAdminOrSuperadmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab') as SettingsTab | null
  const defaultTab: SettingsTab = isAdmin ? 'targets' : 'users'
  const [tab, setTab] = useState<SettingsTab>(urlTab ?? defaultTab)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Keep ?tab=... in the URL so deep links work (e.g. /settings?tab=users)
  useEffect(() => {
    if (tab !== urlTab) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  if (!isAdminOrSuperadmin) return <Navigate to="/dashboard" replace />

  // Tabs visible to the current role. Superadmin sees everything; admin sees Users only.
  type TabSpec = { key: SettingsTab; label: string; icon: typeof Target }
  const ALL_TABS: TabSpec[] = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'targets', label: 'Advisor Targets', icon: Target },
    { key: 'logs', label: 'Activity Logs', icon: ScrollText },
    { key: 'performance', label: 'Performance', icon: Gauge },
    { key: 'ai', label: 'AI & Integrations', icon: Zap },
    { key: 'cache', label: 'Cache', icon: Database },
    { key: 'system', label: 'System Health', icon: Server },
    { key: 'issues', label: 'Issues', icon: Bug },
    { key: 'help', label: 'Help & Guide', icon: HelpCircle },
  ]
  const VISIBLE_TABS = isAdmin ? ALL_TABS : ALL_TABS.filter(t => t.key === 'users')

  // Snap an admin (non-superadmin) onto the Users tab if they land on a hidden one
  // (e.g. via stale ?tab=cache URL).
  useEffect(() => {
    if (!VISIBLE_TABS.some(t => t.key === tab)) setTab('users')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? 'Targets, logs, integrations, user accounts, and system administration.'
              : 'Manage user accounts, roles, and active sessions.'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {VISIBLE_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px border-b-2',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'users' && <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><UserManagement embedded /></Suspense>}
      {tab === 'logs' && <ActivityLogsTable />}
      {tab === 'targets' && <TargetsTab />}
      {tab === 'ai' && <AIConfigTab />}
      {tab === 'cache' && (
        <div className="space-y-4">
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><CacheStatusTab /></Suspense>
          <DataSystemSection setSuccess={setSuccess} setError={setError} />
        </div>
      )}
      {tab === 'issues' && <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><IssuesPage /></Suspense>}
      {tab === 'help' && <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><HelpPage /></Suspense>}
      {tab === 'performance' && <PerformanceTab />}
      {tab === 'system' && <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}><SystemHealthTab /></Suspense>}

      {/* Global toasts */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-500">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-[13px] font-medium text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
