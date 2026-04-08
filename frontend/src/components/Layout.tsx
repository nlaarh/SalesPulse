import { NavLink, Outlet } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useSales } from '@/contexts/SalesContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  Users, GitBranch, Plane, Megaphone, Table2, Target, UserCheck,
  Sun, Moon, Calendar, Command,
  ArrowRight, X, HelpCircle, Settings, LogOut, Bug,
} from 'lucide-react'
import SalesPulseLogo from '@/components/SalesPulseLogo'
import CommandPalette from '@/components/CommandPalette'
import ReportIssue from '@/components/ReportIssue'
import Dropdown from '@/components/Dropdown'
import DateRangeSummary from '@/components/DateRangeSummary'
import { useState, useEffect, useCallback } from 'react'

const NAV_ANALYTICS = [
  { to: '/dashboard', label: 'Sales Performance', icon: Users, desc: 'Revenue, pipeline & team' },
  { to: '/customers', label: 'Top Customers', icon: UserCheck, desc: 'Highest revenue accounts' },
  { to: '/monthly', label: 'Advisor Monthly Report', icon: Table2, desc: 'Agent × month breakdown' },
  { to: '/pipeline', label: 'Pipeline & Forecast', icon: GitBranch, desc: 'Stages, velocity & risk' },
  { to: '/opportunities', label: 'Top Opportunities', icon: Target, desc: 'AI-scored deal ranking' },
  { to: '/leads', label: 'Lead Funnel', icon: Megaphone, desc: 'Conversion & sources' },
  { to: '/travel', label: 'Destinations', icon: Plane, desc: 'Travel analytics' },
]

const NAV_RESOURCES = [
  { to: '/help', label: 'Help & Guide', icon: HelpCircle, desc: 'Lifecycle & terminology' },
]

const LINES = ['Travel', 'Insurance', 'All'] as const

const PRESETS = [
  { key: 'month' as const, label: '1M', title: 'Last month' },
  { key: 'quarter' as const, label: '3M', title: 'Last 3 months' },
  { key: '6m' as const, label: '6M', title: 'Last 6 months' },
  { key: 'ytd' as const, label: 'YTD', title: 'Year to date' },
  { key: 'year' as const, label: '1Y', title: 'Last 12 months' },
  { key: 'last-year' as const, label: 'PY', title: 'Prior year' },
]

/* ── Layout ──────────────────────────────────────────────────────────────── */

export default function Layout() {
  const { line, setLine, viewMode, setViewMode, startDate, endDate, setDateRange } = useSales()
  const { isDark, toggle } = useTheme()
  const { user, logout, isAdmin } = useAuth()

  // ── Command Palette ──
  const [cmdOpen, setCmdOpen] = useState(false)
  const openPalette = useCallback(() => setCmdOpen(true), [])

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
  const [showCustom, setShowCustom] = useState(false)
  const [tempStart, setTempStart] = useState(startDate || '')
  const [tempEnd, setTempEnd] = useState(endDate || '')

  // Force line for role-locked users
  useEffect(() => {
    if ((user?.role === 'travel_manager' || user?.role === 'travel_director') && line !== 'Travel') setLine('Travel')
    if (user?.role === 'insurance_manager' && line !== 'Insurance') setLine('Insurance')
  }, [user?.role, line, setLine])

  // Sync temp dates when custom mode opens or context changes
  useEffect(() => {
    if (viewMode === 'custom') {
      setShowCustom(true)
      setTempStart(startDate || '')
      setTempEnd(endDate || '')
    }
  }, [viewMode, startDate, endDate])

  const handlePresetClick = (key: typeof PRESETS[number]['key']) => {
    setShowCustom(false)
    setViewMode(key)
  }

  const handleCustomToggle = () => {
    if (showCustom) {
      // Closing custom — revert to year
      setShowCustom(false)
      setViewMode('year')
    } else {
      setShowCustom(true)
      // Pre-fill with last 30 days if empty
      if (!tempStart || !tempEnd) {
        const now = new Date()
        const past = new Date(now)
        past.setDate(past.getDate() - 30)
        setTempStart(past.toISOString().split('T')[0])
        setTempEnd(now.toISOString().split('T')[0])
      }
    }
  }

  const applyCustomRange = () => {
    if (tempStart && tempEnd) {
      setDateRange(tempStart, tempEnd)
    }
  }

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

          {/* Resources */}
          <span className="mb-2 mt-4 block px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
            Resources
          </span>
          {NAV_RESOURCES.map(({ to, label, icon: Icon, desc }) => (
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

          {/* Settings + Issues — admin only */}
          {isAdmin && (
            <>
            <NavLink
              to="/issues"
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
                  <Bug className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <div className="flex flex-col">
                    <span>Issues</span>
                    <span className={cn(
                      'text-[10px] font-normal leading-tight',
                      isActive ? 'text-primary/60' : 'text-muted-foreground/40',
                    )}>
                      Bug reports & triage
                    </span>
                  </div>
                </>
              )}
            </NavLink>
            <NavLink
              to="/settings"
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
                  <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <div className="flex flex-col">
                    <span>Settings</span>
                    <span className={cn(
                      'text-[10px] font-normal leading-tight',
                      isActive ? 'text-primary/60' : 'text-muted-foreground/40',
                    )}>
                      User management
                    </span>
                  </div>
                </>
              )}
            </NavLink>
            </>
          )}
        </nav>

        {/* Filters + Theme */}
        <div className="space-y-4 border-t border-sidebar-border p-4">
          {lineLocked ? (
            <div className="space-y-1.5">
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

          {/* Date Range Section */}
          <div className="space-y-2">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
              Time period
            </span>

            {/* Preset Chips */}
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  title={p.title}
                  onClick={() => handlePresetClick(p.key)}
                  className={cn(
                    'rounded-md py-1.5 text-[11px] font-semibold transition-all duration-200',
                    viewMode === p.key && !showCustom
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range Toggle */}
            <button
              onClick={handleCustomToggle}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-md py-1.5',
                'text-[11px] font-medium transition-all duration-200',
                showCustom
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-secondary/50 text-muted-foreground border border-transparent hover:bg-secondary hover:text-foreground',
              )}
            >
              <Calendar className="h-3 w-3" />
              Custom Range
              {showCustom && <X className="h-3 w-3 ml-1 opacity-60" />}
            </button>

            {/* Custom Date Inputs */}
            {showCustom && (
              <div className="animate-enter space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-muted-foreground/80">From</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      type="date"
                      value={tempStart}
                      onChange={(e) => setTempStart(e.target.value)}
                      className={cn(
                        'w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5',
                        'text-[12px] font-medium text-foreground',
                        'outline-none transition-all duration-200',
                        'focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                      )}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-medium text-muted-foreground/80">To</label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                      type="date"
                      value={tempEnd}
                      onChange={(e) => setTempEnd(e.target.value)}
                      className={cn(
                        'w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2.5',
                        'text-[12px] font-medium text-foreground',
                        'outline-none transition-all duration-200',
                        'focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                      )}
                    />
                  </div>
                </div>
                <button
                  onClick={applyCustomRange}
                  disabled={!tempStart || !tempEnd}
                  className={cn(
                    'mt-1 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5',
                    'text-[11px] font-semibold transition-all duration-200',
                    tempStart && tempEnd
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-secondary/60 text-muted-foreground/40 cursor-not-allowed',
                  )}
                >
                  Apply Range
                </button>
              </div>
            )}

            {/* Active Range Summary */}
            <DateRangeSummary viewMode={viewMode} startDate={startDate} endDate={endDate} />
          </div>

        </div>{/* end filters */}
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
      </aside>

      {/* ── Main ── */}
      <main className="ambient-glow relative flex-1 overflow-y-auto bg-background">
        {/* Top-right controls */}
        <div className="sticky top-0 z-20 flex items-center justify-end gap-2 px-8 pt-4 pb-0">
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
        </div>
        <div className="relative z-10 mx-auto max-w-[1360px] px-8 pb-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
