import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { fetchActivityLogs, fetchActivityLogFilters, type ActivityLogEntry } from '@/lib/api'
import {
  ChevronLeft, ChevronRight, Filter, RefreshCw,
  LogIn, UserPlus, Pencil, Trash2, Database, AlertTriangle,
} from 'lucide-react'

const CATEGORY_STYLE: Record<string, string> = {
  auth: 'text-blue-400 bg-blue-400/10',
  user_mgmt: 'text-amber-400 bg-amber-400/10',
  data_access: 'text-emerald-400 bg-emerald-400/10',
}

const CATEGORY_LABEL: Record<string, string> = {
  auth: 'Auth',
  user_mgmt: 'User Mgmt',
  data_access: 'Data Access',
}

const ACTION_ICON: Record<string, typeof LogIn> = {
  login: LogIn,
  login_failed: AlertTriangle,
  user_created: UserPlus,
  user_updated: Pencil,
  user_deleted: Trash2,
  sf_query: Database,
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function ActivityLogsTable() {
  const [items, setItems] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [filterEmail, setFilterEmail] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterOptions, setFilterOptions] = useState<{ emails: string[]; categories: string[]; actions: string[] }>({ emails: [], categories: [], actions: [] })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchActivityLogFilters().then(setFilterOptions).catch(() => {})
  }, [])

  const load = async (p = page) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, per_page: 50 }
      if (filterEmail) params.user_email = filterEmail
      if (filterCategory) params.category = filterCategory
      if (filterAction) params.action = filterAction
      const res = await fetchActivityLogs(params)
      setItems(res.items)
      setPages(res.pages)
      setTotal(res.total)
      setPage(res.page)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1) }, [filterEmail, filterCategory, filterAction])

  const clearFilters = () => {
    setFilterEmail('')
    setFilterCategory('')
    setFilterAction('')
  }

  const hasFilters = filterEmail || filterCategory || filterAction

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {total} event{total !== 1 ? 's' : ''} logged
        </p>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors',
              showFilters ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/20 px-4 py-3">
          <select
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-[12px] text-foreground outline-none"
          >
            <option value="">All users</option>
            {filterOptions.emails.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-[12px] text-foreground outline-none"
          >
            <option value="">All categories</option>
            {filterOptions.categories.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>
            ))}
          </select>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-[12px] text-foreground outline-none"
          >
            <option value="">All actions</option>
            {filterOptions.actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      )}

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Time</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Action</th>
              <th className="px-5 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No activity logs found</td></tr>
            ) : items.map((item) => {
              const Icon = ACTION_ICON[item.action] || Database
              return (
                <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {formatDate(item.created_at)}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">
                    {item.user_email || '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', CATEGORY_STYLE[item.category] || 'text-muted-foreground bg-muted')}>
                      {CATEGORY_LABEL[item.category] || item.category}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-5 py-3 text-muted-foreground" title={item.detail || ''}>
                    {item.detail || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">
            Page {page} of {pages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1}
              className={cn(
                'rounded-md p-1.5 text-muted-foreground transition-colors',
                page > 1 ? 'hover:bg-secondary hover:text-foreground' : 'cursor-not-allowed opacity-40',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= pages}
              className={cn(
                'rounded-md p-1.5 text-muted-foreground transition-colors',
                page < pages ? 'hover:bg-secondary hover:text-foreground' : 'cursor-not-allowed opacity-40',
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
