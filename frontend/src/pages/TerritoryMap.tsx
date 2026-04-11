/**
 * TerritoryMap — Zip-code-level heatmap of customer penetration.
 *
 * Multi-level: zoom out → region bubbles, medium → city clusters,
 * zoom in → individual zip code circles. Layer toggles for
 * insurance / travel / combined penetration.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { fetchTerritoryMapData, type TerritoryZip, type TerritoryMapData } from '@/lib/api'
import { useTheme } from '@/contexts/ThemeContext'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import {
  Loader2, Map as MapIcon, Shield, Plane, Users, Layers,
  TrendingUp, Minus, Info, ZoomIn, BarChart3,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

/* ── Types ───────────────────────────────────────────────────────────────── */

type LayerMode = 'insurance' | 'travel' | 'combined'
type RegionFilter = 'All' | 'Western' | 'Rochester' | 'Central'
type ZoomLevel = 'region' | 'city' | 'zip'

/** Aggregated bubble — represents a region, city, or single zip */
interface MapBubble {
  key: string
  label: string
  sublabel: string
  lat: number
  lng: number
  members: number
  ins_customers_cy: number
  ins_customers_py: number
  ins_penetration: number
  travel_customers_3yr: number
  travel_bookings_cy: number
  travel_bookings_py: number
  travel_penetration: number
  travel_rev_cy: number
  travel_rev_py: number
  zip_count: number
  region: string
  // Census
  population: number
  pop_18plus: number
  median_income: number
  median_age: number
  housing_units: number
  market_share: number
  rev_pct_of_total: number
}

/* ── Color helpers ───────────────────────────────────────────────────────── */

function penetrationColor(pct: number, mode: LayerMode): string {
  const max = mode === 'insurance' ? 1.0 : mode === 'travel' ? 8.0 : 5.0
  const ratio = Math.min(pct / max, 1)
  if (ratio < 0.25) return '#ef4444'
  if (ratio < 0.5) return '#f97316'
  if (ratio < 0.75) return '#eab308'
  return '#22c55e'
}

function penetrationOpacity(pct: number, mode: LayerMode): number {
  const max = mode === 'insurance' ? 1.0 : mode === 'travel' ? 8.0 : 5.0
  return Math.max(0.35, Math.min(0.85, pct / max))
}

function getBubblePenetration(b: MapBubble, mode: LayerMode): number {
  if (mode === 'insurance') return b.ins_penetration
  if (mode === 'travel') return b.travel_penetration
  return (b.ins_penetration + b.travel_penetration) / 2
}

function getPenetration(z: TerritoryZip, mode: LayerMode): number {
  if (mode === 'insurance') return z.ins_penetration
  if (mode === 'travel') return z.travel_penetration
  return (z.ins_penetration + z.travel_penetration) / 2
}

function bubbleRadius(members: number, level: ZoomLevel): number {
  if (level === 'region') {
    if (members >= 300000) return 45
    if (members >= 200000) return 38
    return 30
  }
  if (level === 'city') {
    if (members >= 15000) return 22
    if (members >= 5000) return 17
    if (members >= 2000) return 13
    if (members >= 500) return 10
    return 7
  }
  // zip
  if (members >= 3000) return 14
  if (members >= 1500) return 11
  if (members >= 500) return 9
  if (members >= 200) return 7
  return 5
}

/* ── Aggregation helpers ─────────────────────────────────────────────────── */

function aggregateZips(zips: TerritoryZip[], groupBy: 'region' | 'city', totalRevCy: number): MapBubble[] {
  const groups = new Map<string, TerritoryZip[]>()
  for (const z of zips) {
    const key = groupBy === 'region' ? z.region : `${z.city}|${z.region}`
    const arr = groups.get(key) || []
    arr.push(z)
    groups.set(key, arr)
  }

  const bubbles: MapBubble[] = []
  for (const [key, group] of groups) {
    const members = group.reduce((s, z) => s + z.members, 0)
    const ins_cy = group.reduce((s, z) => s + z.ins_customers_cy, 0)
    const ins_py = group.reduce((s, z) => s + z.ins_customers_py, 0)
    const travel_3yr = group.reduce((s, z) => s + z.travel_customers_3yr, 0)
    const tb_cy = group.reduce((s, z) => s + z.travel_bookings_cy, 0)
    const tb_py = group.reduce((s, z) => s + z.travel_bookings_py, 0)
    const tr_cy = group.reduce((s, z) => s + z.travel_rev_cy, 0)
    const tr_py = group.reduce((s, z) => s + z.travel_rev_py, 0)
    const pop = group.reduce((s, z) => s + (z.population || 0), 0)
    const pop18 = group.reduce((s, z) => s + (z.pop_18plus || 0), 0)
    const housing = group.reduce((s, z) => s + (z.housing_units || 0), 0)

    // Weighted average for median fields
    const totalPop = pop || 1
    const wIncome = group.reduce((s, z) => s + (z.median_income || 0) * (z.population || 0), 0) / totalPop
    const wAge = group.reduce((s, z) => s + (z.median_age || 0) * (z.population || 0), 0) / totalPop

    // Weighted average lat/lng
    const lat = group.reduce((s, z) => s + z.lat * z.members, 0) / members
    const lng = group.reduce((s, z) => s + z.lng * z.members, 0) / members

    const cityName = groupBy === 'city' ? key.split('|')[0] : ''
    const regionName = groupBy === 'region' ? key : group[0].region

    bubbles.push({
      key,
      label: groupBy === 'region' ? `${regionName} Region` : (cityName || 'Unknown'),
      sublabel: groupBy === 'region'
        ? `${group.length} zips`
        : `${regionName} · ${group.length} zip${group.length > 1 ? 's' : ''}`,
      lat, lng,
      members,
      ins_customers_cy: ins_cy,
      ins_customers_py: ins_py,
      ins_penetration: members ? Math.round(ins_cy / members * 1000) / 10 : 0,
      travel_customers_3yr: travel_3yr,
      travel_bookings_cy: tb_cy,
      travel_bookings_py: tb_py,
      travel_penetration: members ? Math.round(travel_3yr / members * 1000) / 10 : 0,
      travel_rev_cy: tr_cy,
      travel_rev_py: tr_py,
      zip_count: group.length,
      region: regionName,
      population: pop,
      pop_18plus: pop18,
      median_income: Math.round(wIncome),
      median_age: Math.round(wAge * 10) / 10,
      housing_units: housing,
      market_share: pop ? Math.round(members / pop * 10000) / 100 : 0,
      rev_pct_of_total: totalRevCy ? Math.round(tr_cy / totalRevCy * 10000) / 100 : 0,
    })
  }
  return bubbles.sort((a, b) => b.members - a.members)
}

function zoomToLevel(zoom: number): ZoomLevel {
  if (zoom <= 9) return 'region'
  if (zoom <= 11) return 'city'
  return 'zip'
}

/* ── Formatters ──────────────────────────────────────────────────────────── */

const fmt = (n: number) => n.toLocaleString()
const fmtPct = (n: number) => `${n.toFixed(1)}%`
const fmtCurrency = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n.toFixed(0)}`

function yoyBadge(cy: number, py: number) {
  if (!py) return null
  const delta = ((cy - py) / py) * 100
  if (Math.abs(delta) < 1) return <Minus className="w-3 h-3 text-muted-foreground inline" />
  if (delta > 0)
    return <span className="text-green-600 dark:text-green-400 text-xs font-medium">+{delta.toFixed(0)}%</span>
  return <span className="text-red-600 dark:text-red-400 text-xs font-medium">{delta.toFixed(0)}%</span>
}

/* ── Zoom tracker ────────────────────────────────────────────────────────── */

function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  })
  useEffect(() => { onZoom(map.getZoom()) }, [map, onZoom])
  return null
}

const REGION_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  Western:   { lat: 42.89, lng: -78.85, zoom: 11 },
  Rochester: { lat: 43.16, lng: -77.61, zoom: 11 },
  Central:   { lat: 43.05, lng: -76.15, zoom: 11 },
  All:       { lat: 43.0,  lng: -77.50, zoom: 10 },
}

function FlyToRegion({ region, zips }: { region: RegionFilter; zips: TerritoryZip[] }) {
  const map = useMap()
  const prevRegion = useRef(region)
  useEffect(() => {
    if (region === prevRegion.current) return
    prevRegion.current = region
    if (region !== 'All') {
      const regionZips = zips.filter((z) => z.region === region)
      if (regionZips.length) {
        const bounds: [number, number][] = regionZips.map((z) => [z.lat, z.lng])
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
        return
      }
    }
    const center = REGION_CENTERS[region] || REGION_CENTERS.All
    map.flyTo([center.lat, center.lng], center.zoom, { duration: 0.8 })
  }, [region, zips, map])
  return null
}

/* ── Legend ───────────────────────────────────────────────────────────────── */

function Legend({ mode, level }: { mode: LayerMode; level: ZoomLevel }) {
  const label = mode === 'insurance' ? 'Insurance' : mode === 'travel' ? 'Travel' : 'Combined'
  const max = mode === 'insurance' ? '1%+' : mode === 'travel' ? '8%+' : '5%+'
  const levelLabel = level === 'region' ? 'Region view' : level === 'city' ? 'City view' : 'Zip code view'
  return (
    <div className="absolute bottom-6 left-6 z-[1000] bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">{label} Penetration</p>
        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium ml-2">
          {levelLabel}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">0%</span>
        <div className="flex h-3 rounded overflow-hidden">
          <div className="w-6 bg-red-500" />
          <div className="w-6 bg-orange-500" />
          <div className="w-6 bg-yellow-500" />
          <div className="w-6 bg-green-500" />
        </div>
        <span className="text-[10px] text-muted-foreground">{max}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        <ZoomIn className="w-3 h-3 inline mr-0.5" />
        Zoom in for more detail
      </p>
    </div>
  )
}

/* ── Summary Card ────────────────────────────────────────────────────────── */

function SummaryCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: typeof Users
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg', accent)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Bubble Tooltip (region/city level) ───────────────────────────────────── */

function BubbleTooltipContent({ b, year }: { b: MapBubble; year: number }) {
  return (
    <div className="min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-sm">{b.label}</span>
        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{b.sublabel}</span>
      </div>

      {/* Census + Market Share — compact grid */}
      {b.population > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-1.5 pb-1.5 border-b border-border">
          <div className="flex justify-between"><span className="text-muted-foreground">Population</span><span className="font-semibold">{fmt(b.population)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Adults 18+</span><span className="font-medium">{fmt(b.pop_18plus)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Med. Income</span><span className="font-medium">{fmtCurrency(b.median_income)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Med. Age</span><span className="font-medium">{b.median_age}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Housing</span><span className="font-medium">{fmt(b.housing_units)}</span></div>
          <div className="flex justify-between"><span className="text-orange-600 font-semibold">Mkt Share</span><span className="font-bold text-orange-600">{fmtPct(b.market_share)}</span></div>
        </div>
      )}

      {/* Members + Revenue */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-1.5 pb-1.5 border-b border-border">
        <div className="flex justify-between"><span className="text-muted-foreground">AAA Members</span><span className="font-semibold">{fmt(b.members)}</span></div>
        {b.rev_pct_of_total > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">% Total Rev</span><span className="font-bold text-amber-600">{fmtPct(b.rev_pct_of_total)}</span></div>
        )}
      </div>

      {/* Insurance + Travel side by side */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div>
          <p className="font-semibold text-blue-600 mb-0.5">🛡 Insurance</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Cust ({year})</span><span className="font-medium">{fmt(b.ins_customers_cy)} {yoyBadge(b.ins_customers_cy, b.ins_customers_py)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Penetration</span><span className="font-medium">{fmtPct(b.ins_penetration)}</span></div>
        </div>
        <div>
          <p className="font-semibold text-emerald-600 mb-0.5">✈ Travel</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Cust (3yr)</span><span className="font-medium">{fmt(b.travel_customers_3yr)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Rev ({year})</span><span className="font-medium">{fmtCurrency(b.travel_rev_cy)} {yoyBadge(b.travel_rev_cy, b.travel_rev_py)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Penetration</span><span className="font-medium">{fmtPct(b.travel_penetration)}</span></div>
        </div>
      </div>
    </div>
  )
}

/* ── ZIP Tooltip ─────────────────────────────────────────────────────────── */

function ZipTooltipContent({ z, year }: { z: TerritoryZip; year: number }) {
  return (
    <div className="min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-sm">{z.zip}</span>
        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
          {z.city ? `${z.city} · ` : ''}{z.region}
        </span>
      </div>

      {/* Census + Market Share — compact grid */}
      {z.population > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-1.5 pb-1.5 border-b border-border">
          <div className="flex justify-between"><span className="text-muted-foreground">Population</span><span className="font-semibold">{fmt(z.population)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Adults 18+</span><span className="font-medium">{fmt(z.pop_18plus)}</span></div>
          {z.median_income > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Med. Income</span><span className="font-medium">{fmtCurrency(z.median_income)}</span></div>}
          {z.median_age > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Med. Age</span><span className="font-medium">{z.median_age}</span></div>}
          {z.median_home_value > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Home Value</span><span className="font-medium">{fmtCurrency(z.median_home_value)}</span></div>}
          <div className="flex justify-between"><span className="text-orange-600 font-semibold">Mkt Share</span><span className="font-bold text-orange-600">{fmtPct(z.market_share)}</span></div>
        </div>
      )}

      {/* Members + Revenue */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] mb-1.5 pb-1.5 border-b border-border">
        <div className="flex justify-between"><span className="text-muted-foreground">AAA Members</span><span className="font-semibold">{fmt(z.members)}</span></div>
        {z.rev_pct_of_total > 0 && (
          <div className="flex justify-between"><span className="text-muted-foreground">% Total Rev</span><span className="font-bold text-amber-600">{fmtPct(z.rev_pct_of_total)}</span></div>
        )}
        {z.county_name && (
          <div className="flex justify-between col-span-2"><span className="text-muted-foreground">County</span><span className="font-medium">{z.county_name}</span></div>
        )}
      </div>

      {/* Insurance + Travel side by side */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        <div>
          <p className="font-semibold text-blue-600 mb-0.5">🛡 Insurance</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Cust ({year})</span><span className="font-medium">{fmt(z.ins_customers_cy)} {yoyBadge(z.ins_customers_cy, z.ins_customers_py)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Penetration</span><span className="font-medium">{fmtPct(z.ins_penetration)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">% of Org</span><span className="font-medium">{fmtPct(z.ins_pct_of_total)}</span></div>
        </div>
        <div>
          <p className="font-semibold text-emerald-600 mb-0.5">✈ Travel</p>
          <div className="flex justify-between"><span className="text-muted-foreground">Cust (3yr)</span><span className="font-medium">{fmt(z.travel_customers_3yr)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Rev ({year})</span><span className="font-medium">{fmtCurrency(z.travel_rev_cy)} {yoyBadge(z.travel_rev_cy, z.travel_rev_py)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Penetration</span><span className="font-medium">{fmtPct(z.travel_penetration)}</span></div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function TerritoryMap() {
  const { theme } = useTheme()
  const [layer, setLayer] = useState<LayerMode>('combined')
  const [region, setRegion] = useState<RegionFilter>('All')
  const [zoom, setZoom] = useState(10)

  const level = zoomToLevel(zoom)

  const { period, startDate, endDate } = useSales()

  const { data, isLoading, error } = useQuery<TerritoryMapData>({
    queryKey: ['territory-map', period, startDate, endDate],
    queryFn: () => fetchTerritoryMapData(period, startDate, endDate),
    staleTime: 5 * 60_000,
  })

  const handleZoom = useCallback((z: number) => setZoom(z), [])

  const filteredZips = useMemo(() => {
    if (!data) return []
    let zips = data.zips
    if (region !== 'All') {
      zips = zips.filter((z) => z.region === region)
    }
    return zips
  }, [data, region])

  // Aggregated bubbles for region/city views
  const bubbles = useMemo(() => {
    if (level === 'zip') return []
    return aggregateZips(filteredZips, level === 'region' ? 'region' : 'city', data?.totals.travel_rev_cy ?? 0)
  }, [filteredZips, level, data])

  // Tile layer URL based on theme
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

  // Region stats for filtered view
  const filteredStats = region === 'All'
    ? totals
    : (() => {
        const r = regionData[region]
        if (!r) return totals
        return {
          members: r.members,
          ins_customers_cy: r.ins_cy,
          travel_customers_3yr: r.travel_3yr,
          travel_rev_cy: r.travel_rev_cy,
          zip_count: r.zip_count,
          population: r.population || 0,
          market_share: r.population ? Math.round(r.members / r.population * 10000) / 100 : 0,
        }
      })()

  return (
    <div className="space-y-4">
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

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Layer toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['insurance', 'travel', 'combined'] as LayerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setLayer(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  layer === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m === 'insurance' && <Shield className="w-3 h-3 inline mr-1" />}
                {m === 'travel' && <Plane className="w-3 h-3 inline mr-1" />}
                {m === 'combined' && <Layers className="w-3 h-3 inline mr-1" />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Region filter */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['All', 'Western', 'Rochester', 'Central'] as RegionFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  region === r
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {filteredStats.population > 0 && (
          <SummaryCard
            icon={BarChart3}
            label="Census Population"
            value={fmt(filteredStats.population)}
            sub={`Market share: ${fmtPct(filteredStats.market_share)}`}
            accent="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
          />
        )}
        <SummaryCard
          icon={Users}
          label="AAA Members"
          value={fmt(filteredStats.members)}
          sub={`${filteredStats.zip_count} zip codes`}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <SummaryCard
          icon={Shield}
          label={`Insurance (${year})`}
          value={fmt(filteredStats.ins_customers_cy)}
          sub={`${((filteredStats.ins_customers_cy / filteredStats.members) * 100).toFixed(2)}% penetration`}
          accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
        />
        <SummaryCard
          icon={Plane}
          label="Travel (3yr)"
          value={fmt(filteredStats.travel_customers_3yr)}
          sub={`${((filteredStats.travel_customers_3yr / filteredStats.members) * 100).toFixed(1)}% penetration`}
          accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <SummaryCard
          icon={TrendingUp}
          label={`Revenue (${year})`}
          value={fmtCurrency(filteredStats.travel_rev_cy)}
          sub={totals.travel_rev_py ? `PY: ${fmtCurrency(totals.travel_rev_py)}` : undefined}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          Showing {level === 'region' ? '3 regions' : level === 'city' ? `${bubbles.length} cities` : `${filteredZips.length} zip codes`}.
          {' '}Color = {layer} penetration (red = weak, green = strong).
          {level !== 'zip' && ' Zoom in for more detail.'}
        </span>
      </div>

      {/* Map */}
      <div className="relative rounded-xl border border-border" style={{ height: 'calc(100vh - 340px)', minHeight: '500px' }}>
        <MapContainer
          center={[43.1, -77.75]}
          zoom={10}
          className="h-full w-full"
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url={tileUrl} />
          <ZoomTracker onZoom={handleZoom} />
          <FlyToRegion region={region} zips={data?.zips ?? []} />

          {/* Region / City bubbles */}
          {level !== 'zip' && bubbles.map((b) => {
            const pct = getBubblePenetration(b, layer)
            return (
              <CircleMarker
                key={b.key}
                center={[b.lat, b.lng]}
                radius={bubbleRadius(b.members, level)}
                pathOptions={{
                  fillColor: penetrationColor(pct, layer),
                  fillOpacity: penetrationOpacity(pct, layer),
                  color: penetrationColor(pct, layer),
                  weight: 2,
                  opacity: 0.9,
                }}
              >
                <Tooltip sticky direction="auto" offset={[0, -10]}>
                  <BubbleTooltipContent b={b} year={year} />
                </Tooltip>
              </CircleMarker>
            )
          })}

          {/* Zip-level circles */}
          {level === 'zip' && filteredZips.map((z) => {
            const pct = getPenetration(z, layer)
            return (
              <CircleMarker
                key={z.zip}
                center={[z.lat, z.lng]}
                radius={bubbleRadius(z.members, 'zip')}
                pathOptions={{
                  fillColor: penetrationColor(pct, layer),
                  fillOpacity: penetrationOpacity(pct, layer),
                  color: penetrationColor(pct, layer),
                  weight: 1.5,
                  opacity: 0.8,
                }}
              >
                <Tooltip sticky direction="auto" offset={[0, -10]}>
                  <ZipTooltipContent z={z} year={year} />
                </Tooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>

        <Legend mode={layer} level={level} />
      </div>

      {/* Top penetration / lowest penetration tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PenetrationTable
          title="Highest Penetration"
          subtitle="Strong market presence"
          zips={filteredZips}
          mode={layer}
          year={year}
          sort="desc"
          accent="text-green-600 dark:text-green-400"
        />
        <PenetrationTable
          title="Lowest Penetration"
          subtitle="Growth opportunity zones"
          zips={filteredZips}
          mode={layer}
          year={year}
          sort="asc"
          accent="text-red-600 dark:text-red-400"
        />
      </div>
    </div>
  )
}

/* ── Penetration ranking table ───────────────────────────────────────────── */

function PenetrationTable({
  title, subtitle, zips, mode, year, sort, accent,
}: {
  title: string
  subtitle: string
  zips: TerritoryZip[]
  mode: LayerMode
  year: number
  sort: 'asc' | 'desc'
  accent: string
}) {
  const sorted = useMemo(() => {
    // Only include zips with enough members to be meaningful
    const meaningful = zips.filter((z) => z.members >= 200)
    return [...meaningful]
      .sort((a, b) => {
        const pa = getPenetration(a, mode)
        const pb = getPenetration(b, mode)
        return sort === 'desc' ? pb - pa : pa - pb
      })
      .slice(0, 10)
  }, [zips, mode, sort])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className={cn('font-semibold text-sm', accent)}>{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Zip</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">City</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pop.</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Members</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Mkt %</th>
              {(mode === 'insurance' || mode === 'combined') && (
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ins %</th>
              )}
              {(mode === 'travel' || mode === 'combined') && (
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Travel %</th>
              )}
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rev ({year})</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rev %</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((z) => (
              <tr key={z.zip} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2 font-mono font-medium">{z.zip}</td>
                <td className="px-3 py-2 text-muted-foreground">{z.city || z.region}</td>
                <td className="px-3 py-2 text-right">{z.population ? fmt(z.population) : '—'}</td>
                <td className="px-3 py-2 text-right">{fmt(z.members)}</td>
                <td className="px-3 py-2 text-right font-medium text-orange-600">{z.market_share ? fmtPct(z.market_share) : '—'}</td>
                {(mode === 'insurance' || mode === 'combined') && (
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtPct(z.ins_penetration)}
                  </td>
                )}
                {(mode === 'travel' || mode === 'combined') && (
                  <td className="px-3 py-2 text-right font-medium">
                    {fmtPct(z.travel_penetration)}
                  </td>
                )}
                <td className="px-3 py-2 text-right">
                  {fmtCurrency(z.travel_rev_cy)}
                  {' '}{yoyBadge(z.travel_rev_cy, z.travel_rev_py)}
                </td>
                <td className="px-3 py-2 text-right font-medium text-amber-600">
                  {z.rev_pct_of_total ? fmtPct(z.rev_pct_of_total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
