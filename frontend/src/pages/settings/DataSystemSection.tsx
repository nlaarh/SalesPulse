/**
 * DataSystemSection — Cache, Geographic, DMV, and Database admin cards.
 * Extracted from Settings.tsx to keep that file under the 600-line limit.
 */
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Database, MapPin, Car, HardDrive, Download } from 'lucide-react'
import {
  flushCache,
  refreshGeographyData,
  refreshCensusData,
  fetchGeoStatus,
  fetchDmvStatus,
  refreshDmvData,
  fetchDbInfo,
  downloadDbBackup,
} from '@/lib/api'

interface Props {
  setSuccess: (msg: string) => void
  setError: (msg: string) => void
}

export default function DataSystemSection({ setSuccess, setError }: Props) {
  const [geoRefreshing, setGeoRefreshing] = useState(false)
  const [censusRefreshing, setCensusRefreshing] = useState(false)
  const [dmvRefreshing, setDmvRefreshing] = useState(false)
  const [geoStatus, setGeoStatus] = useState<{
    seeded: boolean; counties: number; zips: number; last_refreshed: string | null; source: string
  } | null>(null)
  const [dmvStatus, setDmvStatus] = useState<{
    seeded: boolean; record_count: number; total_vehicles: number; last_refreshed: string | null; source: string
  } | null>(null)
  const [dbInfo, setDbInfo] = useState<{
    path: string; exists: boolean; size_kb: number
    backups: { name: string; size_kb: number; created: number }[]
  } | null>(null)

  const loadGeoStatus = async () => {
    try { setGeoStatus(await fetchGeoStatus()) } catch { /* ignore */ }
  }
  const loadDmvStatus = async () => {
    try { setDmvStatus(await fetchDmvStatus()) } catch { /* ignore */ }
  }
  const loadDbInfo = async () => {
    try { setDbInfo(await fetchDbInfo()) } catch { /* ignore */ }
  }

  useEffect(() => { loadGeoStatus(); loadDmvStatus(); loadDbInfo() }, [])

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <>
      {/* Data Cache */}
      <div className="card-premium overflow-hidden border-destructive/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Data Cache</h3>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[13px] font-medium">Flush All Cached Data</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Forces a fresh Salesforce reload on next page visit. Use if data looks stale or shows 0.
              Census, geography, and DMV data are preserved.
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                const r = await flushCache()
                setSuccess(`Cache flushed — ${r.flushed_l1} memory + ${r.flushed_l2} disk entries cleared`)
                setTimeout(() => setSuccess(''), 5000)
              } catch {
                setError('Cache flush failed — check permissions')
                setTimeout(() => setError(''), 5000)
              }
            }}
            className="ml-6 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-600 hover:bg-amber-500/20 transition">
            Flush Cache
          </button>
        </div>
      </div>

      {/* Geographic & Census Data */}
      <div className="card-premium overflow-hidden border-blue-500/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold">Geographic & Census Data</h3>
          </div>
          {geoStatus?.last_refreshed && (
            <span className="text-[10px] text-muted-foreground">
              Last refreshed: {fmtDate(geoStatus.last_refreshed)}
            </span>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          {geoStatus && (
            <div className="flex items-center gap-6 text-[12px]">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{geoStatus.counties}</span> counties
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{geoStatus.zips}</span> zip codes
              </span>
              <span className="text-muted-foreground">
                Source: <span className="font-medium text-foreground">{geoStatus.source}</span>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Refresh Boundaries (Geography)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Re-downloads WCNY county GeoJSON boundaries and updates ZIP-to-county assignment.
              </p>
            </div>
            <button
              disabled={geoRefreshing}
              onClick={async () => {
                setGeoRefreshing(true)
                try {
                  const r = await refreshGeographyData()
                  setSuccess(`Geography refreshed — ${r.counties} counties, ${r.zips} zips mapped`)
                  loadGeoStatus()
                  setTimeout(() => setSuccess(''), 6000)
                } catch {
                  setError('Geography refresh failed — check network availability')
                  setTimeout(() => setError(''), 5000)
                } finally {
                  setGeoRefreshing(false)
                }
              }}
              className={cn(
                'ml-6 shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[12px] font-semibold text-blue-600 transition',
                geoRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20',
              )}>
              {geoRefreshing ? 'Refreshing…' : 'Refresh Geography'}
            </button>
          </div>
          <div className="border-t border-border/60 pt-3 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Refresh Census Demographics</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Re-downloads population, income, education, age and housing metrics from US Census Bureau.
              </p>
            </div>
            <button
              disabled={censusRefreshing}
              onClick={async () => {
                setCensusRefreshing(true)
                try {
                  const r = await refreshCensusData()
                  setSuccess(`Census refreshed — ${r.counties} counties, ${r.zips} zips, pop ${(r.total_population).toLocaleString()}`)
                  loadGeoStatus()
                  setTimeout(() => setSuccess(''), 6000)
                } catch {
                  setError('Census refresh failed — check network or Census API availability')
                  setTimeout(() => setError(''), 5000)
                } finally {
                  setCensusRefreshing(false)
                }
              }}
              className={cn(
                'ml-6 shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-[12px] font-semibold text-blue-600 transition',
                censusRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20',
              )}>
              {censusRefreshing ? 'Refreshing…' : 'Refresh Census'}
            </button>
          </div>
        </div>
      </div>

      {/* DMV Vehicle Registrations */}
      <div className="card-premium overflow-hidden border-violet-500/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold">DMV Vehicle Registrations</h3>
          </div>
          {dmvStatus?.last_refreshed && (
            <span className="text-[10px] text-muted-foreground">
              Last refreshed: {fmtDate(dmvStatus.last_refreshed)}
            </span>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          {dmvStatus && (
            <div className="flex items-center gap-6 text-[12px]">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{dmvStatus.record_count.toLocaleString()}</span> records
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{dmvStatus.total_vehicles.toLocaleString()}</span> vehicles
              </span>
              <span className="text-muted-foreground">
                Source: <span className="font-medium text-foreground">{dmvStatus.source}</span>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Refresh DMV Data</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Re-fetches WCNY county vehicle registrations from NY Open Data (Socrata). Data is cached permanently until refreshed.
              </p>
            </div>
            <button
              disabled={dmvRefreshing}
              onClick={async () => {
                setDmvRefreshing(true)
                try {
                  const r = await refreshDmvData()
                  setSuccess(`DMV data refreshed — ${r.record_count.toLocaleString()} records, ${r.total_vehicles.toLocaleString()} vehicles`)
                  loadDmvStatus()
                  setTimeout(() => setSuccess(''), 6000)
                } catch {
                  setError('DMV refresh failed — check network or NY Open Data availability')
                  setTimeout(() => setError(''), 5000)
                } finally {
                  setDmvRefreshing(false)
                }
              }}
              className={cn(
                'ml-6 shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-[12px] font-semibold text-violet-600 transition',
                dmvRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-violet-500/20',
              )}>
              {dmvRefreshing ? 'Refreshing…' : 'Refresh DMV Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Database Storage */}
      <div className="card-premium overflow-hidden border-emerald-500/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Database Storage</h3>
          </div>
          {dbInfo && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {dbInfo.path}
            </span>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          {dbInfo && (
            <>
              <div className="flex items-center gap-6 text-[12px]">
                <span className="text-muted-foreground">
                  Size: <span className="font-semibold text-foreground">{dbInfo.size_kb > 1024 ? `${(dbInfo.size_kb / 1024).toFixed(1)} MB` : `${dbInfo.size_kb} KB`}</span>
                </span>
                <span className="text-muted-foreground">
                  Auto-backups: <span className="font-semibold text-foreground">{dbInfo.backups.length}</span>
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  dbInfo.exists ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive',
                )}>
                  {dbInfo.exists ? '● Healthy' : '● Missing'}
                </span>
              </div>
              {dbInfo.backups.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Latest backup: <span className="font-medium text-foreground">{dbInfo.backups[0].name}</span>
                  {' '}({dbInfo.backups[0].size_kb > 1024 ? `${(dbInfo.backups[0].size_kb / 1024).toFixed(1)} MB` : `${dbInfo.backups[0].size_kb} KB`})
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">Download Database Backup</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Download a copy of the SQLite database (users, targets, census data). Auto-backed up on every deploy.
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await downloadDbBackup()
                  setSuccess('Database backup downloaded')
                  setTimeout(() => setSuccess(''), 3000)
                } catch {
                  setError('Backup download failed')
                  setTimeout(() => setError(''), 3000)
                }
              }}
              className="ml-6 shrink-0 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-600 hover:bg-emerald-500/20 transition">
              <Download className="h-3.5 w-3.5" />
              Download .db
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
