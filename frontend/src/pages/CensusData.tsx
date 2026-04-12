import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCensusData, type CensusZipRow, type CensusCountyRow } from '@/lib/api'
import { exportToExcel } from '@/lib/exportExcel'
import { cn } from '@/lib/utils'
import {
  Download, Search, BarChart3, Users, Home, GraduationCap,
  DollarSign, ChevronUp, ChevronDown,
} from 'lucide-react'

type Level = 'zip' | 'county'
type SortField = 'population' | 'pop_18plus' | 'median_income' | 'median_age' |
  'housing_units' | 'median_home_value' | 'college_educated' | 'college_pct' |
  'zip' | 'city' | 'county' | 'fips'
type SortDir = 'asc' | 'desc'

const fmt = (n: number) => n.toLocaleString()
const fmtDollar = (n: number) => n > 0 ? `$${n.toLocaleString()}` : '—'

export default function CensusData() {
  const [level, setLevel] = useState<Level>('zip')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('population')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data, isLoading, error } = useQuery({
    queryKey: ['census-data', level],
    queryFn: () => fetchCensusData(level),
    staleTime: Infinity, // static until admin geo refresh
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const filteredRows = useMemo(() => {
    if (!data?.rows) return []
    const q = search.toLowerCase().trim()
    let rows = data.rows as (CensusZipRow | CensusCountyRow)[]
    if (q) {
      rows = rows.filter(r => {
        if (level === 'zip') {
          const zr = r as CensusZipRow
          return zr.zip.includes(q) || zr.city.toLowerCase().includes(q) || zr.county.toLowerCase().includes(q)
        } else {
          const cr = r as CensusCountyRow
          return cr.county.toLowerCase().includes(q) || cr.fips.includes(q)
        }
      })
    }
    // Sort
    rows = [...rows].sort((a, b) => {
      const av = (a as any)[sortField] ?? 0
      const bv = (b as any)[sortField] ?? 0
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [data, search, sortField, sortDir, level])

  const handleExport = () => {
    if (!filteredRows.length) return
    const exportRows = filteredRows.map(r => {
      if (level === 'zip') {
        const zr = r as CensusZipRow
        return {
          'Zip Code': zr.zip,
          'City': zr.city,
          'County': zr.county,
          'Population': zr.population,
          'Pop 18+': zr.pop_18plus,
          'Median Income': zr.median_income,
          'Median Age': zr.median_age,
          'Housing Units': zr.housing_units,
          'Median Home Value': zr.median_home_value,
          'College Educated': zr.college_educated,
          'College %': zr.college_pct,
        }
      } else {
        const cr = r as CensusCountyRow
        return {
          'County': cr.county,
          'FIPS': cr.fips,
          'Population': cr.population,
          'Pop 18+': cr.pop_18plus,
          'Median Income': cr.median_income,
          'Median Age': cr.median_age,
          'Housing Units': cr.housing_units,
          'Median Home Value': cr.median_home_value,
          'College Educated': cr.college_educated,
          'College %': cr.college_pct,
        }
      }
    })
    exportToExcel(exportRows, `WCNY_Census_${level === 'zip' ? 'Zip' : 'County'}_Data`)
  }

  // Summary cards
  const totals = data?.totals

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Census Data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            US Census Bureau ACS 2022 — population, income, education & housing for WCNY territory
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!filteredRows.length}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2',
            'bg-primary text-primary-foreground text-[13px] font-semibold',
            'transition-all duration-200 hover:opacity-90',
            !filteredRows.length && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Download className="h-4 w-4" />
          Export to Excel
        </button>
      </div>

      {/* Level toggle + Search */}
      <div className="flex items-center gap-4">
        <div className="flex items-center rounded-lg bg-secondary/50 p-0.5">
          {(['zip', 'county'] as Level[]).map(l => (
            <button
              key={l}
              onClick={() => { setLevel(l); setSearch(''); setSortField('population'); setSortDir('desc') }}
              className={cn(
                'px-4 py-1.5 rounded-md text-[13px] font-medium transition-all',
                level === l
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l === 'zip' ? 'By Zip Code' : 'By County'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={level === 'zip' ? 'Search zip, city, or county…' : 'Search county…'}
            className="w-full rounded-lg border border-border bg-secondary/40 pl-10 pr-4 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <span className="text-[12px] text-muted-foreground">
          {filteredRows.length} of {data?.count ?? 0} {level === 'zip' ? 'zips' : 'counties'}
        </span>
      </div>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Population', value: fmt(totals.population), icon: Users, color: 'text-blue-500' },
            { label: 'Adults 18+', value: fmt(totals.pop_18plus), icon: Users, color: 'text-indigo-500' },
            { label: 'Avg Median Income', value: fmtDollar(totals.avg_median_income), icon: DollarSign, color: 'text-emerald-500' },
            { label: 'Avg Median Age', value: `${totals.avg_median_age}`, icon: BarChart3, color: 'text-amber-500' },
            { label: 'Housing Units', value: fmt(totals.housing_units), icon: Home, color: 'text-rose-500' },
            { label: 'College Educated', value: fmt(totals.college_educated), icon: GraduationCap, color: 'text-purple-500' },
          ].map(s => (
            <div key={s.label} className="card-premium px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={cn('h-3.5 w-3.5', s.color)} />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-lg font-bold text-foreground">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading census data…</div>
      ) : error ? (
        <div className="flex items-center justify-center py-20 text-destructive">Failed to load census data</div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {level === 'zip' ? (
                    <>
                      <Th field="zip" label="Zip" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <Th field="city" label="City" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <Th field="county" label="County" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </>
                  ) : (
                    <>
                      <Th field="county" label="County" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                      <Th field="fips" label="FIPS" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    </>
                  )}
                  <Th field="population" label="Population" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="pop_18plus" label="18+" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="median_income" label="Med. Income" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="median_age" label="Med. Age" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="housing_units" label="Housing" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="median_home_value" label="Home Value" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="college_educated" label="College Ed." sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                  <Th field="college_pct" label="College %" sortField={sortField} sortDir={sortDir} onSort={handleSort} right />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, _i) => {
                  const isZip = level === 'zip'
                  const row = r as any
                  return (
                    <tr key={isZip ? row.zip : row.fips} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                      {isZip ? (
                        <>
                          <td className="px-3 py-2 font-mono font-medium text-foreground">{row.zip}</td>
                          <td className="px-3 py-2 text-foreground">{row.city}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.county}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-medium text-foreground">{row.county}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{row.fips}</td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right font-medium">{fmt(row.population)}</td>
                      <td className="px-3 py-2 text-right">{fmt(row.pop_18plus)}</td>
                      <td className="px-3 py-2 text-right">{fmtDollar(row.median_income)}</td>
                      <td className="px-3 py-2 text-right">{row.median_age > 0 ? row.median_age : '—'}</td>
                      <td className="px-3 py-2 text-right">{fmt(row.housing_units)}</td>
                      <td className="px-3 py-2 text-right">{fmtDollar(row.median_home_value)}</td>
                      <td className="px-3 py-2 text-right">{fmt(row.college_educated)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn(
                          'inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-center text-[11px] font-semibold',
                          row.college_pct >= 40 ? 'bg-emerald-500/15 text-emerald-500' :
                          row.college_pct >= 25 ? 'bg-blue-500/15 text-blue-500' :
                          row.college_pct >= 15 ? 'bg-amber-500/15 text-amber-500' :
                          'bg-muted text-muted-foreground',
                        )}>
                          {row.college_pct}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Source attribution */}
      <p className="text-[10px] text-muted-foreground text-center">
        Source: U.S. Census Bureau, American Community Survey 5-Year Estimates (2022) •
        Data covers {data?.count ?? 0} {level === 'zip' ? 'zip codes' : 'counties'} in WCNY territory
      </p>
    </div>
  )
}

/* ── Sortable Table Header ─────────────────────────────────────────────────── */

function Th({ field, label, sortField, sortDir, onSort, right }: {
  field: SortField
  label: string
  sortField: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  right?: boolean
}) {
  const active = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        'px-3 py-2.5 cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground',
        right && 'text-right',
        active && 'text-foreground',
      )}
    >
      {label}
      {active && (sortDir === 'asc'
        ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
        : <ChevronDown className="inline h-3 w-3 ml-0.5" />
      )}
    </th>
  )
}
