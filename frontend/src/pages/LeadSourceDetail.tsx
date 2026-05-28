import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSales } from '@/contexts/SalesContext'
import { fetchLeadsList, type LeadItem } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'
import { ArrowLeft, Loader2, ExternalLink } from 'lucide-react'

type SortField = 'name' | 'created_date' | 'status' | 'owner' | 'opp_amount'

const PAGE_SIZE = 25

export default function LeadSourceDetail() {
  const { source: encodedSource } = useParams<{ source: string }>()
  const source = encodedSource ? decodeURIComponent(encodedSource) : ''
  const navigate = useNavigate()
  const { line, startDate, endDate } = useSales()

  const [leads, setLeads] = useState<LeadItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('created_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (!source) return
    setLoading(true)
    fetchLeadsList(line, source, null, startDate, endDate)
      .then(res => setLeads(res.leads || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [source, line, startDate, endDate])

  const requestSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
    setCurrentPage(1)
  }

  const processedLeads = useMemo(() => {
    let list = leads
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.owner.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let valA: any = sortField === 'opp_amount' ? (a.opp_amount || 0) : (a as any)[sortField] ?? ''
      let valB: any = sortField === 'opp_amount' ? (b.opp_amount || 0) : (b as any)[sortField] ?? ''
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [leads, searchQuery, sortField, sortOrder])

  const totalPages = Math.ceil(processedLeads.length / PAGE_SIZE)
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return processedLeads.slice(start, start + PAGE_SIZE)
  }, [processedLeads, currentPage])

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? <span className="ml-1">{sortOrder === 'asc' ? '▲' : '▼'}</span> : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-enter flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground shadow-sm transition-all hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div>
          <p className="text-[12px] font-medium text-muted-foreground">{line} Division · Lead Source</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{source || '(blank)'}</h1>
        </div>
      </div>

      {/* Card */}
      <div className="card-premium animate-enter overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Leads from "{source || '(blank)'}"</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Up to 500 leads created in the selected date range</p>
          </div>
          <input
            type="text"
            placeholder="Filter leads…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1) }}
            className="w-52 rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-[11px] outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:bg-secondary/40"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
            <span className="text-[11px] text-muted-foreground">Loading leads…</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/10 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="cursor-pointer select-none px-6 py-3 hover:text-foreground w-1/4" onClick={() => requestSort('name')}>
                      Name<SortIcon field="name" />
                    </th>
                    <th className="cursor-pointer select-none px-6 py-3 hover:text-foreground" onClick={() => requestSort('created_date')}>
                      Created<SortIcon field="created_date" />
                    </th>
                    <th className="cursor-pointer select-none px-6 py-3 hover:text-foreground" onClick={() => requestSort('status')}>
                      Status<SortIcon field="status" />
                    </th>
                    <th className="cursor-pointer select-none px-6 py-3 hover:text-foreground" onClick={() => requestSort('owner')}>
                      Owner<SortIcon field="owner" />
                    </th>
                    <th className="cursor-pointer select-none px-6 py-3 text-right hover:text-foreground" onClick={() => requestSort('opp_amount')}>
                      Opp Value<SortIcon field="opp_amount" />
                    </th>
                    <th className="w-16 px-6 py-3 text-center">SF</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        No leads found{searchQuery ? ' matching your filter' : ''}.
                      </td>
                    </tr>
                  ) : (
                    paginatedLeads.map(lead => (
                      <tr key={lead.id} className="border-b border-border/40 transition-colors hover:bg-secondary/5">
                        <td className="px-6 py-3 font-medium text-foreground">{lead.name || 'Unnamed Lead'}</td>
                        <td className="tabular-nums px-6 py-3 text-muted-foreground">
                          {lead.created_date ? lead.created_date.slice(0, 10) : '—'}
                        </td>
                        <td className="px-6 py-3">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                            lead.status === 'Converted' ? 'bg-emerald-500/10 text-emerald-500' :
                            lead.status === 'Expired' ? 'bg-rose-500/10 text-rose-500' :
                            'bg-amber-500/10 text-amber-500'
                          )}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">{lead.owner || '—'}</td>
                        <td className="tabular-nums px-6 py-3 text-right font-semibold">
                          {lead.opp_amount != null ? formatCurrency(lead.opp_amount, true) : '—'}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <a
                            href={`https://aaawcny.my.salesforce.com/${lead.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                            title="Open in Salesforce"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border/40 px-6 py-4">
                <p className="text-[11px] text-muted-foreground">
                  Page <span className="font-semibold text-foreground">{currentPage}</span> of{' '}
                  <span className="font-semibold text-foreground">{totalPages}</span>{' '}
                  ({processedLeads.length} leads)
                </p>
                <div className="flex gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    className="rounded-md border border-border bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-all hover:bg-secondary/40 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    className="rounded-md border border-border bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-all hover:bg-secondary/40 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
