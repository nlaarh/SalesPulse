/**
 * CommandPalette — ⌘K / Ctrl+K quick navigation & action launcher.
 *
 * Features:
 * - Navigate to any page instantly
 * - Search advisor by name → jump to their profile
 * - Switch division / period from keyboard
 * - Keyboard: ↑↓ navigate, Enter select, Esc close
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, Table2, GitBranch, Target,
  Megaphone, Plane, HelpCircle, Settings, User,
  ArrowRight, Command, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSales } from '@/contexts/SalesContext'
import { motion, AnimatePresence } from 'framer-motion'

/* ── Command item type ──────────────────────────────────────────────────── */
type CommandItem = {
  id: string
  label: string
  sub?: string
  icon: React.ReactNode
  action: () => void
  group: string
  keywords?: string
}

/* ── Recent items storage ────────────────────────────────────────────────── */
const RECENT_KEY = 'sp_cmd_recent'
const MAX_RECENT = 5

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function pushRecent(id: string) {
  const prev = getRecent().filter(x => x !== id)
  localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)))
}

/* ── Static nav items (used outside of hook too) ────────────────────────── */
export const NAV_COMMANDS = [
  { id: 'nav-dashboard',     label: 'Sales Dashboard',        sub: 'Bookings, KPIs & leaderboard',        to: '/dashboard',     icon: <LayoutDashboard className="w-4 h-4" />, keywords: 'home overview' },
  { id: 'nav-monthly',       label: 'Monthly Report',         sub: 'Agent × month breakdown',             to: '/monthly',       icon: <Table2    className="w-4 h-4" />, keywords: 'advisors table' },
  { id: 'nav-pipeline',      label: 'Pipeline & Forecast',    sub: 'Stages, velocity & risk',             to: '/pipeline',      icon: <GitBranch className="w-4 h-4" />, keywords: 'funnel stages forecast coverage' },
  { id: 'nav-opportunities', label: 'Top Opportunities',      sub: 'AI-scored deal ranking',              to: '/opportunities', icon: <Target    className="w-4 h-4" />, keywords: 'deals score opps' },
  { id: 'nav-leads',         label: 'Lead Funnel',            sub: 'Conversion rates & sources',          to: '/leads',         icon: <Megaphone className="w-4 h-4" />, keywords: 'leads conversion expired' },
  { id: 'nav-travel',        label: 'Travel Destinations',    sub: 'Destination & seasonal analytics',    to: '/travel',        icon: <Plane     className="w-4 h-4" />, keywords: 'destinations travel' },
  { id: 'nav-settings',      label: 'Settings',               sub: 'Users & preferences',                 to: '/settings',      icon: <Settings  className="w-4 h-4" />, keywords: 'admin users' },
  { id: 'nav-help',          label: 'Help & Documentation',   sub: 'Data model, metrics, glossary',       to: '/help',          icon: <HelpCircle className="w-4 h-4" />, keywords: 'docs guide' },
]

/* ── Hook: build full command list ──────────────────────────────────────── */
function useCommands(query: string, onClose: () => void): CommandItem[] {
  const navigate = useNavigate()
  const { setLine, setPeriod } = useSales()

  return useMemo<CommandItem[]>(() => {
    const go = (to: string, id: string) => {
      pushRecent(id)
      navigate(to)
      onClose()
    }

    const nav: CommandItem[] = NAV_COMMANDS.map(n => ({
      id: n.id,
      label: n.label,
      sub: n.sub,
      icon: n.icon,
      group: 'Pages',
      keywords: n.keywords,
      action: () => go(n.to, n.id),
    }))

    const divisions: CommandItem[] = [
      { id: 'div-travel',    label: 'Switch to Travel',    sub: 'Travel division',    icon: <Plane     className="w-4 h-4 text-cyan-500" />, group: 'Division', action: () => { setLine('Travel');    onClose() } },
      { id: 'div-insurance', label: 'Switch to Insurance', sub: 'Insurance division', icon: <Target    className="w-4 h-4 text-amber-500" />, group: 'Division', action: () => { setLine('Insurance'); onClose() } },
      { id: 'div-all',       label: 'Show All Divisions',  sub: 'Travel + Insurance', icon: <LayoutDashboard className="w-4 h-4 text-primary" />, group: 'Division', action: () => { setLine('All');      onClose() } },
    ]

    const periods: CommandItem[] = [
      { id: 'per-1m',  label: 'Last Month',     sub: '1 month window',          icon: <Clock className="w-4 h-4 text-violet-500" />, group: 'Period', action: () => { setPeriod(1);   onClose() } },
      { id: 'per-3m',  label: 'Last 3 Months',  sub: 'Quarter window',          icon: <Clock className="w-4 h-4 text-violet-500" />, group: 'Period', action: () => { setPeriod(3);   onClose() } },
      { id: 'per-6m',  label: 'Last 6 Months',  sub: 'Half-year window',        icon: <Clock className="w-4 h-4 text-violet-500" />, group: 'Period', action: () => { setPeriod(6);   onClose() } },
      { id: 'per-12m', label: 'Last 12 Months', sub: 'Rolling year (default)',  icon: <Clock className="w-4 h-4 text-violet-500" />, group: 'Period', action: () => { setPeriod(12);  onClose() } },
    ]

    // Advisor search: only when user types a name-like query
    const agentItems: CommandItem[] = []
    if (query.length >= 2) {
      // Generate a search suggestion item; actual results come from a separate effect
      agentItems.push({
        id: `search-agent-${query}`,
        label: `Search advisor "${query}"`,
        sub: 'Go to advisor profile',
        icon: <User className="w-4 h-4 text-emerald-500" />,
        group: 'Advisors',
        action: () => { go(`/agent/${encodeURIComponent(query)}`, `agent-${query}`) },
      })
    }

    return [...nav, ...divisions, ...periods, ...agentItems]
  }, [query, navigate, onClose, setLine, setPeriod])
}

/* ── Filter + group items ────────────────────────────────────────────────── */
function filterItems(items: CommandItem[], query: string, recent: string[]): { group: string; items: CommandItem[] }[] {
  const q = query.toLowerCase().trim()

  let filtered = q
    ? items.filter(item =>
        item.label.toLowerCase().includes(q) ||
        (item.sub ?? '').toLowerCase().includes(q) ||
        (item.keywords ?? '').toLowerCase().includes(q),
      )
    : items

  // When no query: show recent first, then pages only
  if (!q) {
    const recentItems = recent
      .map(id => items.find(i => i.id === id))
      .filter(Boolean) as CommandItem[]

    const pageItems = items.filter(i => i.group === 'Pages')

    const groups: { group: string; items: CommandItem[] }[] = []
    if (recentItems.length) groups.push({ group: 'Recent', items: recentItems.slice(0, 4) })
    groups.push({ group: 'Pages', items: pageItems })
    return groups
  }

  // Grouped results
  const groups: Record<string, CommandItem[]> = {}
  for (const item of filtered) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
  }

  return Object.entries(groups).map(([group, items]) => ({ group, items }))
}

/* ── Main component ──────────────────────────────────────────────────────── */
interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery]       = useState('')
  const [activeIdx, setActive]  = useState(0)
  const [recent, setRecent]     = useState<string[]>([])
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  const commands  = useCommands(query, onClose)
  const groups    = useMemo(() => filterItems(commands, query, recent), [commands, query, recent])
  const flatItems = useMemo(() => groups.flatMap(g => g.items), [groups])

  // Load recent on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setRecent(getRecent())
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // Keep active in bounds when results change
  useEffect(() => {
    setActive(i => Math.min(i, Math.max(flatItems.length - 1, 0)))
  }, [flatItems.length])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, flatItems.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && flatItems[activeIdx]) { flatItems[activeIdx].action() }
    if (e.key === 'Escape') onClose()
  }, [flatItems, activeIdx, onClose])

  // Global ⌘K / Ctrl+K listener is in CommandPaletteProvider

  let globalIdx = 0

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            className="fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{   opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' as const }}
          >
            <div className="rounded-xl border border-border bg-popover shadow-2xl overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setActive(0) }}
                  onKeyDown={handleKey}
                  placeholder="Go to page, switch division, find advisor…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/50">
                  esc
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
                {flatItems.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground/40">No results for "{query}"</p>
                ) : (
                  groups.map(({ group, items: gItems }) => (
                    <div key={group}>
                      <p className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                        {group}
                      </p>
                      {gItems.map(item => {
                        const idx = globalIdx++
                        const isActive = idx === activeIdx
                        return (
                          <button
                            key={item.id}
                            data-idx={idx}
                            onClick={() => { setActive(idx); item.action() }}
                            onMouseEnter={() => setActive(idx)}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                              isActive ? 'bg-primary/10' : 'hover:bg-secondary/30',
                            )}
                          >
                            <span className={cn('shrink-0 text-muted-foreground', isActive && 'text-primary')}>
                              {item.icon}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className={cn('block text-sm font-medium truncate', isActive ? 'text-primary' : 'text-foreground')}>
                                {item.label}
                              </span>
                              {item.sub && (
                                <span className="block text-[11px] text-muted-foreground/60 truncate">{item.sub}</span>
                              )}
                            </span>
                            {isActive && <ArrowRight className="w-3.5 h-3.5 text-primary/50 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/30">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[9px]">↑↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[9px]">↵</kbd> select
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/40">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[9px]">esc</kbd> close
                </span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/30">
                  <Command className="w-2.5 h-2.5" />K
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
