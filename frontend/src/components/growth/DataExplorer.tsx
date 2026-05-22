import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, RefreshCw,
  Map, Car, Users as UsersIcon, Layers,
} from 'lucide-react'
import {
  type TerritoryZip,
  type VehicleRegistrationRow,
  type AgeCohortRow,
  type CoverageTierRow,
  fetchTerritoryVehicleData,
  fetchCustomersByAge,
  fetchCoverageTiers,
  refreshDataset,
} from '@/lib/api'
import { GROWTH_COLORS, fmt } from './tokens'
import DownloadButton from './DownloadButton'

interface DataExplorerProps {
  zips: TerritoryZip[]
  /** Called after refresh — parent can refetch the ZIP data it owns */
  onRefreshZips?: () => void
}

type DatasetKey = 'zips' | 'vehicles' | 'age' | 'coverage'

interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: string
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => number | string
}

type SortDir = 'asc' | 'desc'

// ── Column configs per dataset ───────────────────────────────────────────────

const ZIP_COLUMNS: Column<TerritoryZip>[] = [
  { key: 'zip', label: 'ZIP', width: '72px' },
  { key: 'city', label: 'City' },
  { key: 'county_name', label: 'County' },
  { key: 'region', label: 'Region', width: '90px' },
  { key: 'members', label: 'Members', align: 'right', render: (r) => fmt.num(r.members) },
  { key: 'ins_customers_cy', label: 'Ins Cust', align: 'right', render: (r) => fmt.num(r.ins_customers_cy) },
  { key: 'travel_customers_3yr', label: 'Travel (3yr)', align: 'right', render: (r) => fmt.num(r.travel_customers_3yr) },
  { key: 'pop_18plus', label: 'Adults 18+', align: 'right', render: (r) => fmt.num(r.pop_18plus) },
  {
    key: 'penetration_pct',
    label: 'Member Pen %',
    align: 'right',
    sortValue: (r) => (r.pop_18plus > 0 ? r.members / r.pop_18plus : 0),
    render: (r) => fmt.pctPlain(r.pop_18plus > 0 ? (r.members / r.pop_18plus) * 100 : 0, 1),
  },
  { key: 'median_income', label: 'Median Income', align: 'right', render: (r) => fmt.dollars(r.median_income) },
]

const VEHICLE_COLUMNS: Column<VehicleRegistrationRow>[] = [
  { key: 'county', label: 'County' },
  { key: 'model_year', label: 'Model Year', width: '110px' },
  { key: 'fuel_type', label: 'Fuel Type', width: '110px' },
  { key: 'vehicle_count', label: 'Vehicle Count', align: 'right', render: (r) => fmt.num(r.vehicle_count) },
]

const AGE_COLUMNS: Column<AgeCohortRow>[] = [
  { key: 'cohort', label: 'Age Cohort', width: '110px' },
  { key: 'min_age', label: 'Min Age', align: 'right', width: '80px', render: (r) => (r.min_age == null ? '—' : String(r.min_age)) },
  { key: 'max_age', label: 'Max Age', align: 'right', width: '80px', render: (r) => (r.max_age == null ? '—' : String(r.max_age)) },
  { key: 'count', label: 'Active Members', align: 'right', render: (r) => fmt.num(r.count) },
  { key: 'pct_of_total', label: '% of Total', align: 'right', render: (r) => fmt.pctPlain(r.pct_of_total, 2) },
]

const COVERAGE_COLUMNS: Column<CoverageTierRow>[] = [
  { key: 'tier', label: 'Coverage Tier' },
  { key: 'count', label: 'Active Members', align: 'right', render: (r) => fmt.num(r.count) },
  { key: 'pct_of_total', label: '% of Total', align: 'right', render: (r) => fmt.pctPlain(r.pct_of_total, 2) },
]

const DATASETS = [
  { key: 'zips' as const, label: 'ZIP Penetration', icon: Map, desc: 'Members, insurance, travel per ZIP' },
  { key: 'vehicles' as const, label: 'DMV Vehicles', icon: Car, desc: 'Vehicle registrations by county/year/fuel' },
  { key: 'age' as const, label: 'Members by Age', icon: UsersIcon, desc: 'Active members by age cohort' },
  { key: 'coverage' as const, label: 'Coverage Tiers', icon: Layers, desc: 'Premier / Plus / Basic breakdown' },
]

// Filter predicates per dataset
function matchesQuery(dataset: DatasetKey, row: unknown, q: string): boolean {
  if (!q) return true
  const norm = q.toLowerCase()
  const r = row as Record<string, unknown>
  switch (dataset) {
    case 'zips': {
      const z = r as unknown as TerritoryZip
      return (
        z.zip.toLowerCase().includes(norm) ||
        (z.city || '').toLowerCase().includes(norm) ||
        (z.county_name || '').toLowerCase().includes(norm) ||
        (z.region || '').toLowerCase().includes(norm)
      )
    }
    case 'vehicles': {
      const v = r as unknown as VehicleRegistrationRow
      return (
        (v.county || '').toLowerCase().includes(norm) ||
        (v.model_year || '').toLowerCase().includes(norm) ||
        (v.fuel_type || '').toLowerCase().includes(norm)
      )
    }
    case 'age': {
      const a = r as unknown as AgeCohortRow
      return (a.cohort || '').toLowerCase().includes(norm)
    }
    case 'coverage': {
      const c = r as unknown as CoverageTierRow
      return (c.tier || '').toLowerCase().includes(norm)
    }
  }
}

export default function DataExplorer({ zips, onRefreshZips }: DataExplorerProps) {
  const [dataset, setDataset] = useState<DatasetKey>('zips')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string>('members')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [pageSize, setPageSize] = useState<number>(25)
  const qc = useQueryClient()

  // ── Fetch each dataset (lazy via enabled) ─────────────────────────────────
  const vehiclesQ = useQuery({
    queryKey: ['ds-vehicles'],
    queryFn: fetchTerritoryVehicleData,
    enabled: dataset === 'vehicles',
    staleTime: 30 * 60_000,
  })
  const ageQ = useQuery({
    queryKey: ['ds-age'],
    queryFn: fetchCustomersByAge,
    enabled: dataset === 'age',
    staleTime: 30 * 60_000,
  })
  const coverageQ = useQuery({
    queryKey: ['ds-coverage'],
    queryFn: fetchCoverageTiers,
    enabled: dataset === 'coverage',
    staleTime: 30 * 60_000,
  })

  const [refreshing, setRefreshing] = useState(false)
  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const backendName = (
        dataset === 'age' ? 'customers-by-age' :
        dataset === 'coverage' ? 'coverage-tiers' :
        dataset
      ) as 'zips' | 'vehicles' | 'customers-by-age' | 'coverage-tiers'
      await refreshDataset(backendName)
      // Invalidate the relevant react-query cache so next read fetches fresh
      if (dataset === 'zips') {
        await qc.invalidateQueries({ queryKey: ['growth-plan-map'] })
        onRefreshZips?.()
      } else if (dataset === 'vehicles') {
        await qc.invalidateQueries({ queryKey: ['ds-vehicles'] })
      } else if (dataset === 'age') {
        await qc.invalidateQueries({ queryKey: ['ds-age'] })
      } else if (dataset === 'coverage') {
        await qc.invalidateQueries({ queryKey: ['ds-coverage'] })
      }
    } finally {
      setRefreshing(false)
    }
  }

  // ── Active rows / columns / loading / row link ─────────────────────────────
  const { rows, columns, loading, drillBuilder, csvRows, asOf } = useMemo(() => {
    if (dataset === 'zips') {
      return {
        rows: zips as unknown[],
        columns: ZIP_COLUMNS as Column<unknown>[],
        loading: false,
        drillBuilder: (r: unknown) => `/territory/${(r as TerritoryZip).zip}`,
        csvRows: (zips as TerritoryZip[]).map((z) => ({
          zip: z.zip, city: z.city, county: z.county_name, region: z.region,
          members: z.members, insurance_customers: z.ins_customers_cy,
          travel_customers_3yr: z.travel_customers_3yr,
          population: z.population, population_18plus: z.pop_18plus,
          median_income: z.median_income, median_age: z.median_age,
          housing_units: z.housing_units, median_home_value: z.median_home_value,
          member_penetration_pct: z.pop_18plus > 0 ? ((z.members / z.pop_18plus) * 100).toFixed(2) : '0',
          ins_revenue_cy: z.ins_rev_cy, travel_revenue_cy: z.travel_rev_cy,
        })),
        asOf: undefined as string | undefined,
      }
    }
    if (dataset === 'vehicles') {
      const r = vehiclesQ.data?.rows ?? []
      return {
        rows: r as unknown[],
        columns: VEHICLE_COLUMNS as Column<unknown>[],
        loading: vehiclesQ.isLoading,
        drillBuilder: null,
        csvRows: r,
        asOf: undefined,
      }
    }
    if (dataset === 'age') {
      const r = ageQ.data?.rows ?? []
      return {
        rows: r as unknown[],
        columns: AGE_COLUMNS as Column<unknown>[],
        loading: ageQ.isLoading,
        drillBuilder: null,
        csvRows: r,
        asOf: ageQ.data?.as_of,
      }
    }
    // coverage
    const r = coverageQ.data?.rows ?? []
    return {
      rows: r as unknown[],
      columns: COVERAGE_COLUMNS as Column<unknown>[],
      loading: coverageQ.isLoading,
      drillBuilder: null,
      csvRows: r,
      asOf: coverageQ.data?.as_of,
    }
  }, [dataset, zips, vehiclesQ.data, vehiclesQ.isLoading, ageQ.data, ageQ.isLoading, coverageQ.data, coverageQ.isLoading])

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim()
    let r = q ? rows.filter((row) => matchesQuery(dataset, row, q)) : [...rows]
    const col = columns.find((c) => c.key === sortKey)
    r.sort((a, b) => {
      const va = col?.sortValue
        ? col.sortValue(a)
        : (a as Record<string, unknown>)[sortKey] as number | string | undefined
      const vb = col?.sortValue
        ? col.sortValue(b)
        : (b as Record<string, unknown>)[sortKey] as number | string | undefined
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va ?? '').toLowerCase()
      const sb = String(vb ?? '').toLowerCase()
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return r
  }, [rows, columns, query, sortKey, sortDir, dataset])

  const visible = filtered.slice(0, pageSize)

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  // Reset state when switching dataset
  function selectDataset(k: DatasetKey) {
    setDataset(k)
    setQuery('')
    setPageSize(25)
    setSortDir('desc')
    if (k === 'zips') setSortKey('members')
    else if (k === 'vehicles') setSortKey('vehicle_count')
    else setSortKey('count')
  }

  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: GROWTH_COLORS.rule }}
    >
      {/* ── Dataset selector tabs ────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-stretch gap-1 px-3 pt-3 border-b"
        style={{ borderColor: GROWTH_COLORS.rule, backgroundColor: '#FFFFFF' }}
      >
        {DATASETS.map((d) => {
          const Icon = d.icon
          const active = dataset === d.key
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => selectDataset(d.key)}
              className="px-3 py-2 -mb-px text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 transition-colors"
              style={{
                color: active ? GROWTH_COLORS.navy : GROWTH_COLORS.inkSoft,
                borderColor: active ? GROWTH_COLORS.teal : 'transparent',
                backgroundColor: active ? '#F8FAFB' : 'transparent',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {d.label}
            </button>
          )
        })}
      </div>

      {/* ── Toolbar (search · count · refresh · page · download) ─────────── */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: GROWTH_COLORS.rule, backgroundColor: '#F8FAFB' }}
      >
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: GROWTH_COLORS.inkSoft }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={DATASETS.find((d) => d.key === dataset)?.desc ?? 'Search…'}
            className="w-full pl-8 pr-8 py-1.5 text-[12.5px] rounded-md border bg-white outline-none focus:border-[#00838F]"
            style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.ink }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Clear">
              <X className="w-3.5 h-3.5" style={{ color: GROWTH_COLORS.inkSoft }} />
            </button>
          )}
        </div>

        <span className="text-[11.5px]" style={{ color: GROWTH_COLORS.inkSoft }}>
          {fmt.num(filtered.length)}{rows.length !== filtered.length ? ` of ${fmt.num(rows.length)}` : ''} rows
          {asOf && <span className="ml-2 text-[10.5px] opacity-70">· as of {asOf}</span>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
            style={{ color: GROWTH_COLORS.navy, borderColor: GROWTH_COLORS.rule }}
            title={`Invalidate cache and refetch ${dataset}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>

          <label className="text-[11px]" style={{ color: GROWTH_COLORS.inkSoft }}>Show</label>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="text-[11.5px] py-1 px-2 rounded border bg-white"
            style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.ink }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={Math.max(rows.length, 1)}>All</option>
          </select>

          <DownloadButton
            filename={`${dataset}-${query ? `filtered-${query.replace(/\s+/g, '_')}` : 'all'}`}
            rows={csvRows as Record<string, unknown>[]}
            label={`Download ${query ? 'filtered' : 'all'}`}
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="overflow-auto">
        <table className="w-full text-[12px]">
          <thead style={{ backgroundColor: '#F1F5F9' }}>
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key
                const Arrow = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
                return (
                  <th
                    key={c.key}
                    className="px-3 py-2 font-semibold uppercase text-[9.5px] tracking-wider select-none cursor-pointer hover:bg-[#E4ECF3]"
                    style={{
                      color: GROWTH_COLORS.navy,
                      textAlign: c.align ?? 'left',
                      width: c.width,
                      whiteSpace: 'nowrap',
                    }}
                    onClick={() => toggleSort(c.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <Arrow className="w-3 h-3" style={{ color: active ? GROWTH_COLORS.navy : GROWTH_COLORS.inkSoft, opacity: active ? 1 : 0.5 }} />
                    </span>
                  </th>
                )
              })}
              {drillBuilder && <th className="px-2 py-2 w-8" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (drillBuilder ? 1 : 0)} className="px-3 py-8 text-center text-[12px]" style={{ color: GROWTH_COLORS.inkSoft }}>
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (drillBuilder ? 1 : 0)} className="px-3 py-8 text-center text-[12px]" style={{ color: GROWTH_COLORS.inkSoft }}>
                  {query ? `No rows match "${query}". Try a different search.` : 'No data.'}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr key={i} className="border-t hover:bg-[#F8FAFB] transition-colors" style={{ borderColor: GROWTH_COLORS.rule }}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-2 whitespace-nowrap"
                      style={{
                        textAlign: c.align ?? 'left',
                        color: c.key === 'zip' || c.key === 'cohort' || c.key === 'tier' || c.key === 'county' ? GROWTH_COLORS.navy : GROWTH_COLORS.ink,
                        fontWeight: c.key === 'zip' || c.key === 'cohort' || c.key === 'tier' ? 600 : 400,
                      }}
                    >
                      {c.render
                        ? c.render(row)
                        : String((row as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                  {drillBuilder && (
                    <td className="px-2 py-2 text-right">
                      <Link
                        to={drillBuilder(row)}
                        className="inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline"
                        style={{ color: GROWTH_COLORS.teal }}
                      >
                        Drill <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length && (
        <div className="px-4 py-2 text-[11.5px] border-t text-center" style={{ borderColor: GROWTH_COLORS.rule, color: GROWTH_COLORS.inkSoft }}>
          Showing {fmt.num(visible.length)} of {fmt.num(filtered.length)}. Increase "Show" to see more, or download the full set.
        </div>
      )}
    </div>
  )
}
