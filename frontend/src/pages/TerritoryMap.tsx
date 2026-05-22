/**
 * TerritoryMap — Zip-code-level heatmap of customer penetration.
 *
 * Multi-level: zoom out → region bubbles, medium → city clusters,
 * zoom in → individual zip code circles. Layer toggles for
 * insurance / travel / combined penetration.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchTerritoryMapData, fetchTerritoryBoundaries,
  flushCache, reportClientRenderMetric,
  type TerritoryMapData, type CountyBoundaryData,
} from '@/lib/api'
import { useTheme } from '@/contexts/ThemeContext'
import { useSales } from '@/contexts/SalesContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import * as L from 'leaflet'
import {
  Loader2, Map as MapIcon, Shield, Plane, Users,
  TrendingUp, Info, BarChart3, RefreshCw, Search, X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import {
  aggregateZips, zoomToLevel, penetrationColor, penetrationOpacity,
  getBubblePenetration, getPenetration, bubbleRadius,
  fmt, fmtPct, fmtCurrency,
  type RegionFilter,
  type BubbleRenderData, type ZipRenderData,
} from './TerritoryMap/utils'
import { SummaryCard, PenetrationTable } from './TerritoryMap/index'
import { MapSection } from './MapSection'

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function TerritoryMap() {
  const mountStartRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const renderMetricSentRef = useRef(false)
  const { theme } = useTheme()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [region, setRegion] = useState<RegionFilter>('All')
  const [zoom, setZoom] = useState(9)
  const [fullscreen, setFullscreen] = useState(false)
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [selectedZip, setSelectedZip] = useState<import('@/lib/api').TerritoryZip | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const level = zoomToLevel(zoom)

  const { period, startDate, endDate } = useSales()

  const { data, isLoading, error, refetch: refetchMap } = useQuery<TerritoryMapData>({
    queryKey: ['territory-map', period, startDate, endDate],
    queryFn: () => fetchTerritoryMapData(period, startDate, endDate),
    staleTime: 55 * 60_000,
    gcTime: 120 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data: boundaries, refetch: refetchBoundaries } = useQuery<CountyBoundaryData>({
    queryKey: ['territory-boundaries', false],
    queryFn: () => fetchTerritoryBoundaries(false),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })

  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom((z) => (z === nextZoom ? z : nextZoom))
  }, [])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !data) return []
    return data.zips
      .filter((z) =>
        z.zip.startsWith(q) ||
        z.city?.toLowerCase().includes(q) ||
        z.county_name?.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [searchQuery, data])

  const nav = useNavigate()

  const handleZipSelect = useCallback((zip: import('@/lib/api').TerritoryZip) => {
    // Navigate to dedicated zip detail page
    nav(`/territory/${zip.zip}`)
  }, [nav])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMsg('')
    try {
      if (isAdmin) {
        await flushCache()
      }
      await queryClient.invalidateQueries({ queryKey: ['territory-map'] })
      await queryClient.invalidateQueries({ queryKey: ['territory-boundaries'] })
      await Promise.all([refetchMap(), refetchBoundaries()])
      setRefreshMsg(isAdmin ? 'Data refreshed from source' : 'Map refreshed')
    } catch {
      setRefreshMsg('Refresh failed')
    } finally {
      setRefreshing(false)
      window.setTimeout(() => setRefreshMsg(''), 3000)
    }
  }, [isAdmin, queryClient, refetchMap, refetchBoundaries, refreshing])

  const canvasRenderer = useMemo(() => L.canvas({ padding: 0.5 }), [])

  useEffect(() => {
    if (renderMetricSentRef.current) return
    if (!data || !boundaries?.county_geojson) return
    renderMetricSentRef.current = true
    const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - mountStartRef.current
    void reportClientRenderMetric(
      'territory_map',
      'initial_render_ms',
      Math.max(0, elapsedMs),
      {
        zip_count: data.zips.length,
        county_count: boundaries.county_geojson.features?.length ?? 0,
      }
    ).catch(() => {})
  }, [data, boundaries])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // Zips filtered by region only (for penetration tables — always show full list)
  const regionFilteredZips = useMemo(() => {
    if (!data) return []
    let zips = data.zips
    if (region !== 'All') {
      zips = zips.filter((z) => z.region === region)
    }
    return zips
  }, [data, region])

  // Zips for map rendering — narrows to searched zip when selected
  const filteredZips = useMemo(() => {
    if (selectedZip) {
      return regionFilteredZips.filter((z) => z.zip === selectedZip.zip)
    }
    return regionFilteredZips
  }, [regionFilteredZips, selectedZip])

  const bubbles = useMemo(() => {
    if (level === 'zip') return []
    return aggregateZips(filteredZips, level === 'region' ? 'region' : 'city', data?.totals.travel_rev_cy ?? 0)
  }, [filteredZips, level, data])

  const bubbleRenderItems = useMemo<BubbleRenderData[]>(() => {
    if (level === 'zip') return []
    return bubbles.map((b) => {
      const pct = getBubblePenetration(b)
      const color = penetrationColor(pct)
      return {
        key: b.key,
        lat: b.lat,
        lng: b.lng,
        radius: bubbleRadius(b.members, level),
        pathOptions: {
          renderer: canvasRenderer,
          fillColor: color,
          fillOpacity: penetrationOpacity(pct),
          color,
          weight: 2,
          opacity: 0.9,
        },
        bubble: b,
      }
    })
  }, [bubbles, level, canvasRenderer])

  const zipRenderItems = useMemo<ZipRenderData[]>(() => {
    if (level !== 'zip') return []
    return filteredZips.map((z) => {
      const pct = getPenetration(z)
      const color = penetrationColor(pct)
      return {
        key: z.zip,
        lat: z.lat,
        lng: z.lng,
        radius: bubbleRadius(z.members, 'zip'),
        pathOptions: {
          renderer: canvasRenderer,
          fillColor: color,
          fillOpacity: penetrationOpacity(pct),
          color,
          weight: 1.5,
          opacity: 0.8,
        },
        zip: z,
      }
    })
  }, [filteredZips, level, canvasRenderer])

  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading territory data…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <p className="text-destructive">Failed to load territory data</p>
      </div>
    )
  }

  const { totals, regions: regionData, year } = data

  const filteredStats = selectedZip
    ? {
        members: selectedZip.members,
        ins_customers: selectedZip.ins_customers_cy,
        ins_rev_cy: selectedZip.ins_rev_cy || 0,
        travel_customers_3yr: selectedZip.travel_customers_3yr,
        travel_rev_cy: selectedZip.travel_rev_cy,
        zip_count: 1,
        population: selectedZip.population || 0,
        market_share: selectedZip.population ? Math.round(selectedZip.members / selectedZip.population * 10000) / 100 : 0,
      }
    : region === 'All'
    ? totals
    : (() => {
        const r = regionData[region]
        if (!r) return totals
        return {
          members: r.members,
          ins_customers: r.ins_cy,
          ins_rev_cy: r.ins_rev_cy,
          travel_customers_3yr: r.travel_3yr,
          travel_rev_cy: r.travel_rev_cy,
          zip_count: r.zip_count,
          population: r.population || 0,
          market_share: r.population ? Math.round(r.members / r.population * 10000) / 100 : 0,
        }
      })()

  return (
    <div className={cn(
      fullscreen
        ? 'fixed inset-0 z-50 bg-background overflow-auto p-4'
        : 'space-y-4'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Territory Map</h1>
            <p className="text-sm text-muted-foreground">Customer penetration heatmap by zip code</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Zip search — in header, always visible */}
          <div ref={searchRef} className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (searchResults.length > 0) {
                    handleZipSelect(searchResults[0])
                  } else if (data) {
                    // Direct lookup by exact zip code
                    const q = searchQuery.trim()
                    const match = data.zips.find((z) => z.zip === q)
                    if (match) handleZipSelect(match)
                  }
                }
                if (e.key === 'Escape') { setSearchOpen(false) }
              }}
              placeholder="Search zip or city…"
              className={cn(
                'w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border',
                'bg-card text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/40',
              )}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchOpen(false); setSelectedZip(null) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 z-[2000] bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                {searchResults.map((z) => (
                  <button
                    key={z.zip}
                    onMouseDown={() => handleZipSelect(z)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-primary/5 transition-colors border-b border-border/40 last:border-0"
                  >
                    <span className="font-mono font-semibold text-primary underline underline-offset-2">{z.zip}</span>
                    <span className="text-muted-foreground truncate">{z.city || z.region}</span>
                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground shrink-0">{fmt(z.members)} mbrs</span>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && searchQuery.trim().length > 0 && searchResults.length === 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 z-[2000] bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs text-muted-foreground">
                No zips found
              </div>
            )}
          </div>

          {refreshMsg && (
            <span className={cn(
              'text-xs font-medium',
              refreshMsg === 'Refresh failed' ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {refreshMsg}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium',
              'bg-card text-foreground hover:bg-muted/50 transition-colors',
              refreshing && 'opacity-60 cursor-not-allowed'
            )}
            title={isAdmin ? 'Force refresh from source data' : 'Refresh map data'}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards — hidden in fullscreen */}
      {!fullscreen && <div className={cn('grid gap-3 grid-cols-2 md:grid-cols-3', filteredStats.population > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {filteredStats.population > 0 && (
          <SummaryCard
            icon={BarChart3}
            label="Census Population"
            value={fmt(filteredStats.population)}
            sub={`Market share: ${fmtPct(filteredStats.market_share)}`}
            accent="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
            tip="Total population from US Census Bureau ACS 5-Year estimates across AAA WCNY zip codes. Market share = AAA members ÷ census population."
          />
        )}
        <SummaryCard
          icon={Users}
          label="AAA Members"
          value={fmt(filteredStats.members)}
          sub={`${filteredStats.zip_count} zip codes`}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          tip="Active AAA members: PersonAccounts with Status = Active, non-expired membership, known tier (Basic/Plus/Premier), and in-territory. Excludes out-of-territory and members without a recognized plan."
        />
        <SummaryCard
          icon={Shield}
          label="Insurance Customers"
          value={fmt(filteredStats.ins_customers)}
          sub={`${filteredStats.members > 0 ? ((filteredStats.ins_customers / filteredStats.members) * 100).toFixed(1) : 0}% penetration`}
          accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
          tip="Active members with an Insurance Customer ID (Insuance_Customer_ID__c) in Salesforce. Only counts members with active status. Penetration = insurance customers ÷ total members."
        />
        <SummaryCard
          icon={Plane}
          label="Travel (3yr)"
          value={fmt(filteredStats.travel_customers_3yr)}
          sub={`${filteredStats.members > 0 ? ((filteredStats.travel_customers_3yr / filteredStats.members) * 100).toFixed(1) : 0}% penetration`}
          accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          tip="Unique accounts with at least one won Travel opportunity (Closed Won or Invoice) in the last 3 years. Counts people, not trips — a customer with 10 trips counts as 1. Penetration = travel customers ÷ total members."
        />
        <SummaryCard
          icon={TrendingUp}
          label={`Revenue (${year})`}
          value={fmtCurrency((filteredStats.ins_rev_cy || 0) + filteredStats.travel_rev_cy)}
          sub={totals.travel_rev_py || totals.ins_rev_py ? `PY: ${fmtCurrency((totals.ins_rev_py || 0) + (totals.travel_rev_py || 0))}` : undefined}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          tip="Combined Insurance + Travel revenue from won opportunities (Closed Won + Invoice) in the current year. PY = same period in the prior year for comparison."
        />
      </div>}

      {/* Info banner — hidden in fullscreen */}
      {!fullscreen && <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          {selectedZip
            ? <>Showing zip <strong>{selectedZip.zip}</strong> ({selectedZip.city || selectedZip.region}). Metrics reflect this zip only.</>
            : <>Showing {level === 'city' ? `${bubbles.length} cities` : `${regionFilteredZips.length} zip codes`}.
              {' '}Color = customer penetration (red = weak, green = strong).
              {level !== 'zip' && ' Zoom in for more detail.'}</>
          }
        </span>
      </div>}

      {/* Top penetration / lowest penetration tables — ABOVE the map for faster access */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PenetrationTable
          title="Highest Penetration"
          subtitle="Strong market presence"
          zips={regionFilteredZips}
          year={year}
          sort="desc"
          accent="text-green-600 dark:text-green-400"
          onZipClick={handleZipSelect}
          selectedZip={selectedZip}
        />
        <PenetrationTable
          title="Lowest Penetration"
          subtitle="Growth opportunity zones"
          zips={regionFilteredZips}
          year={year}
          sort="asc"
          accent="text-red-600 dark:text-red-400"
          onZipClick={handleZipSelect}
          selectedZip={selectedZip}
        />
      </div>

      {/* Map — at the end of the page */}
      <MapSection
        fullscreen={fullscreen}
        setFullscreen={setFullscreen}
        region={region}
        setRegion={setRegion}
        showBoundaries={showBoundaries}
        setShowBoundaries={setShowBoundaries}
        tileUrl={tileUrl}
        handleZoomChange={handleZoomChange}
        selectedZip={selectedZip}
        boundaries={boundaries}
        level={level}
        bubbleRenderItems={bubbleRenderItems}
        zipRenderItems={zipRenderItems}
        year={year}
        totals={totals}
        canvasRenderer={canvasRenderer}
        handleZipSelect={handleZipSelect}
        regionFilteredZips={regionFilteredZips}
        theme={theme}
      />
    </div>
  )
}
