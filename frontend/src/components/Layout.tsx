import { NavLink, Outlet } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useSales } from '@/contexts/SalesContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  Users, GitBranch, Megaphone, Table2, Target, DollarSign,
  Sun, Moon, Command, Radio, Map, BarChart3,
  Settings, LogOut, Lightbulb, RefreshCw,
  TrendingUp,
} from 'lucide-react'
import SalesPulseLogo from '@/components/SalesPulseLogo'
import CommandPalette from '@/components/CommandPalette'
import ReportIssue from '@/components/ReportIssue'
import Dropdown from '@/components/Dropdown'
import ImpersonationBanner from '@/components/ImpersonationBanner'
// AI chatbot hidden until ready for production
// import AIAssistantChat from '@/components/AIAssistantChat'

const APP_VERSION = __APP_VERSION__
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'

const NAV_ANALYTICS = [
  { to: '/dashboard', label: 'Advisor Performance', icon: Users, desc: 'Bookings, pipeline & team' },
  { to: '/revenue', label: 'Revenue Contributions', icon: DollarSign, desc: 'Customers, destinations & regions' },
  { to: '/monthly', label: 'Monthly Breakdown', icon: Table2, desc: 'Agent or branch monthly breakdown' },
  { to: '/projection', label: 'Manage Targets', icon: Target, desc: 'Stretch goals & thresholds' },
  { to: '/pipeline', label: 'Sales Pipeline', icon: GitBranch, desc: 'Stages, velocity & risk' },
  { to: '/opportunities', label: 'AI-Ranked Deals', icon: Target, desc: 'AI-scored deal ranking' },
  { to: '/leads', label: 'Lead Funnel & Conversion', icon: Megaphone, desc: 'Conversion & sources' },
  { to: '/insights', label: 'Cross-Sell Opportunities', icon: Lightbulb, desc: 'Who to call & why' },
  { to: '/territory', label: 'Market Penetration Map', icon: Map, desc: 'Penetration heatmap' },
]

// Note: `Strategic Growth Plan` is admin/superadmin-only — filtered at render time.
const NAV_EXTERNAL = [
  { to: '/growth-plan', label: 'Strategic Growth Plan', icon: TrendingUp, desc: 'Board-grade growth plan with maps & analysis', adminOnly: true },
  { to: '/census', label: 'Market Demographics', icon: BarChart3, desc: 'Population & demographics' },
  { to: '/market-pulse', label: 'Advisories & Alerts', icon: Radio, desc: 'Advisories & intelligence' },
] as const

const LINES = ['Travel', 'Insurance', 'All'] as const

/* ── Layout ──────────────────────────────────────────────────────────────── */

export default function Layout() {
  const { line, setLine } = useSales()
  const { isDark, toggle } = useTheme()
  const { user, logout, isAdminOrSuperadmin } = useAuth()
  // Filter nav entries that are tagged adminOnly (e.g. Strategic Growth Plan)
  // so managers don't see them. Backend remains authoritative.
  const externalNav = NAV_EXTERNAL.filter(
    (n) => !('adminOnly' in n && n.adminOnly) || isAdminOrSuperadmin || user?.role === 'executive',
  )
  const navigate = useNavigate()

  // ── Command Palette ──
  const [cmdOpen, setCmdOpen] = useState(false)
  const openPalette = useCallback(() => setCmdOpen(true), [])

  // ── Refresh (flush live cache + reload current route) ──
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await api.post('/api/cache/flush-live')
    } catch {
      // proceed even if flush fails — still reload
    } finally {
      setRefreshing(false)
      navigate(0)  // soft-reload current route, triggers re-fetch
    }
  }, [refreshing, navigate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Role-based line lock
  const lineLocked = user?.role === 'travel_manager' || user?.role === 'travel_director' || user?.role === 'insurance_manager'
  const effectiveLine = (user?.role === 'travel_manager' || user?.role === 'travel_director') ? 'Travel'
    : user?.role === 'insurance_manager' ? 'Insurance'
    : line
  // Force line for role-locked users
  useEffect(() => {
    if ((user?.role === 'travel_manager' || user?.role === 'travel_director') && line !== 'Travel') setLine('Travel')
    if (user?.role === 'insurance_manager' && line !== 'Insurance') setLine('Insurance')
  }, [user?.role, line, setLine])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Command Palette ── */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* ── Floating Bug Report Button ── */}
      <ReportIssue />

      {/* ── Sidebar ── */}
      <aside className="flex w-[240px] flex-col border-r border-sidebar-border bg-sidebar">
        {/* Brand */}
        <div className="flex h-[56px] items-center px-5">
          <SalesPulseLogo size={28} showText />
        </div>

        {/* Business line — top of sidebar, always visible */}
        <div className="border-b border-sidebar-border px-4 pb-3 pt-2">
          {lineLocked ? (
            <div className="space-y-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                Business line
              </span>
              <div className="flex items-center rounded-lg bg-secondary/60 px-3 py-2 text-[13px] font-medium text-foreground border border-border opacity-70">
                {effectiveLine}
              </div>
            </div>
          ) : (
            <Dropdown
              label="Business line"
              value={line}
              options={LINES.map(l => ({ key: l, label: l }))}
              onSelect={(k) => setLine(k as typeof line)}
            />
          )}
        </div>

        {/* Nav + Filters — scrollable middle section */}
        <div className="flex-1 overflow-y-auto">
        <nav className="space-y-0.5 px-3 pt-3">
          {/* Analytics */}
          <span className="mb-2 block px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            Analytics
          </span>
          {NAV_ANALYTICS.map(({ to, label, icon: Icon, desc }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'group relative flex items-center gap-3 rounded-lg px-2.5 py-2',
                'text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <div className="flex flex-col">
                    <span>{label}</span>
                    <span className={cn(
                      'text-[10px] font-normal leading-tight',
                      isActive ? 'text-primary/60' : 'text-muted-foreground/40',
                    )}>
                      {desc}
                    </span>
                  </div>
                </>
              )}
            </NavLink>
          ))}

          {/* External Data */}
          <span className="mb-2 mt-4 block px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            External Data
          </span>
          {externalNav.map(({ to, label, icon: Icon, desc }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'group relative flex items-center gap-3 rounded-lg px-2.5 py-2',
                'text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <div className="flex flex-col">
                    <span>{label}</span>
                    <span className={cn(
                      'text-[10px] font-normal leading-tight',
                      isActive ? 'text-primary/60' : 'text-muted-foreground/40',
                    )}>
                      {desc}
                    </span>
                  </div>
                </>
              )}
            </NavLink>
          ))}

          {/* User Management lives inside Settings → "Users" tab, gated to admin+superadmin */}

          {/* Settings — admin or superadmin (Users tab lives here) */}
          {isAdminOrSuperadmin && (
            <NavLink
              to="/settings"
              className={({ isActive }) => cn(
                'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 mt-2',
                'text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                  )}
                  <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <div className="flex flex-col">
                    <span>Settings</span>
                    <span className={cn(
                      'text-[10px] font-normal leading-tight',
                      isActive ? 'text-primary/60' : 'text-muted-foreground/40',
                    )}>
                      Admin & configuration
                    </span>
                  </div>
                </>
              )}
            </NavLink>
          )}
        </nav>

        </div>{/* end scrollable wrapper */}

        {/* User info + Logout */}
        {user && (
          <div className="border-t border-sidebar-border px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[12px] font-bold text-primary">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[12px] font-medium text-foreground">{user.name}</div>
                <div className="truncate text-[10px] text-muted-foreground/60">{user.role.replace('_', ' ')}</div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Version */}
        <div className="px-4 pb-3 pt-1 text-center">
          <span className="text-[10px] text-muted-foreground/40">
            v{APP_VERSION.replace('-beta', '')}
          </span>
          {APP_VERSION.includes('beta') && (
            <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-500">
              Beta
            </span>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ambient-glow relative flex-1 overflow-y-auto bg-background">
        {/* Impersonation banner — sticky at top of scroll container */}
        <ImpersonationBanner />
        {/* Top-right controls */}
        <div className="sticky top-0 z-20 flex items-center justify-end gap-2 px-8 pt-4 pb-0">
          {/* Refresh button — flushes backend cache and reloads page */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh live data from Salesforce"
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5',
              'text-[11px] font-medium backdrop-blur-sm transition-all shadow-sm',
              refreshing
                ? 'cursor-not-allowed text-muted-foreground/30'
                : 'text-muted-foreground/50 hover:bg-secondary hover:text-foreground',
            )}
          >
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          {/* ⌘K hint badge */}
          <button
            onClick={openPalette}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground/50 backdrop-blur-sm transition-all hover:bg-secondary hover:text-foreground shadow-sm"
            title="Open command palette (⌘K)"
          >
            <Command className="h-3 w-3" />
            <span className="hidden sm:inline">⌘K</span>
          </button>
          <button
            onClick={toggle}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5',
              'border border-border bg-card/80 backdrop-blur-sm',
              'text-[12px] font-medium text-muted-foreground',
              'transition-all duration-200 hover:bg-secondary hover:text-foreground',
              'shadow-sm',
            )}
          >
            {isDark ? (
              <><Sun className="h-3.5 w-3.5 text-primary" /> Light</>
            ) : (
              <><Moon className="h-3.5 w-3.5 text-primary" /> Dark</>
            )}
          </button>
          <button
            onClick={logout}
            title="Sign out"
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5',
              'border border-destructive/30 bg-card/80 backdrop-blur-sm',
              'text-[11px] font-medium text-destructive/70',
              'transition-all duration-200 hover:bg-destructive/10 hover:text-destructive',
              'shadow-sm',
            )}
          >
            <LogOut className="h-3 w-3" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
        <div className="relative z-10 mx-auto max-w-[1360px] px-8 pb-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* AI Assistant Chat — hidden until ready for production */}
      {/* <AIAssistantChat /> */}
    </div>
  )
}
