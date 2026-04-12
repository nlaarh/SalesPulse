/**
 * TerritoryMap — Zip-code-level heatmap of customer penetration.
 *
 * Multi-level: zoom out → region bubbles, medium → city clusters,
 * zoom in → individual zip code circles. Layer toggles for
 * insurance / travel / combined penetration.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import { fetchTerritoryMapData, fetchTerritoryBoundaries, flushCache, reportClientRenderMetric, type TerritoryZip, type TerritoryMapData, type CountyBoundaryData } from '@/lib/api'
import { useTheme } from '@/contexts/ThemeContext'
import { useSales } from '@/contexts/SalesContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import * as L from 'leaflet'
import { type PathOptions } from 'leaflet'
import {
  Loader2, Map as MapIcon, Shield, Plane, Users,
  TrendingUp, Info, ZoomIn, BarChart3, Maximize2, Minimize2, RefreshCw,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import type { TerritoryTotals } from '@/lib/api'

/* ── Types ───────────────────────────────────────────────────────────────── */

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
  ins_penetration: number
  ins_rev_cy: number
  ins_rev_py: number
  travel_customers_3yr: number
  travel_customers_cy: number
  travel_customers_py: number
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

function penetrationColor(pct: number): string {
  const max = 5.0
  const ratio = Math.min(pct / max, 1)
  if (ratio < 0.25) return '#ef4444'
  if (ratio < 0.5) return '#f97316'
  if (ratio < 0.75) return '#eab308'
  return '#22c55e'
}

function penetrationOpacity(pct: number): number {
  return Math.max(0.35, Math.min(0.85, pct / 5.0))
}

function getBubblePenetration(b: MapBubble): number {
  return (b.ins_penetration + b.travel_penetration) / 2
}

function getPenetration(z: TerritoryZip): number {
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
    const travel_3yr = group.reduce((s, z) => s + z.travel_customers_3yr, 0)
    const tc_cy = group.reduce((s, z) => s + z.travel_customers_cy, 0)
    const tc_py = group.reduce((s, z) => s + z.travel_customers_py, 0)
    const tr_cy = group.reduce((s, z) => s + z.travel_rev_cy, 0)
    const tr_py = group.reduce((s, z) => s + z.travel_rev_py, 0)
    const ir_cy = group.reduce((s, z) => s + z.ins_rev_cy, 0)
    const ir_py = group.reduce((s, z) => s + z.ins_rev_py, 0)
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
      ins_penetration: members ? Math.round(ins_cy / members * 1000) / 10 : 0,
      ins_rev_cy: ir_cy,
      ins_rev_py: ir_py,
      travel_customers_3yr: travel_3yr,
      travel_customers_cy: tc_cy,
      travel_customers_py: tc_py,
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
  // Always show city-level bubbles (never region) — one big circle is unhelpful
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

/* ── Zoom tracker ────────────────────────────────────────────────────────── */

function ViewportTracker({ onZoomChange }: {
  onZoomChange: (zoom: number) => void
}) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  })
  useEffect(() => { onZoomChange(map.getZoom()) }, [map, onZoomChange])
  return null
}

function MapResizer({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap()
  useEffect(() => {
    // Leaflet needs to recalculate when container size changes
    setTimeout(() => map.invalidateSize(), 100)
  }, [fullscreen, map])
  return null
}

/** Move the tooltip pane to document.body so it escapes all overflow:hidden ancestors */
function TooltipOverflowFix() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const tooltipPane = map.getPane('tooltipPane')
    if (!tooltipPane || !container) return

    // Reparent to body
    document.body.appendChild(tooltipPane)
    tooltipPane.style.position = 'fixed'
    tooltipPane.style.zIndex = '10000'
    tooltipPane.style.pointerEvents = 'none'
    tooltipPane.style.top = '0'
    tooltipPane.style.left = '0'

    const sync = () => {
      const mapPane = map.getPane('mapPane')
      if (!mapPane) return
      const rect = container.getBoundingClientRect()
      // Combine container screen position + map pane internal transform
      const mapTransform = mapPane.style.transform
      // Extract translate values from "translate3d(Xpx, Ypx, 0px)"
      const match = mapTransform.match(/translate3d\(([^,]+),\s*([^,]+)/)
      const tx = match ? parseFloat(match[1]) : 0
      const ty = match ? parseFloat(match[2]) : 0
      tooltipPane.style.transform = `translate3d(${rect.left + tx}px, ${rect.top + ty}px, 0px)`
    }
    map.on('move zoom viewreset moveend zoomend', sync)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    sync()

    return () => {
      map.off('move zoom viewreset moveend zoomend', sync)
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
      // Move tooltip pane back to map pane on cleanup
      const mapPane = map.getPane('mapPane')
      if (mapPane && tooltipPane.parentElement === document.body) {
        mapPane.appendChild(tooltipPane)
        tooltipPane.style.position = ''
        tooltipPane.style.zIndex = ''
        tooltipPane.style.pointerEvents = ''
        tooltipPane.style.top = ''
        tooltipPane.style.left = ''
        tooltipPane.style.transform = ''
      }
    }
  }, [map])
  return null
}

const REGION_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  Western:   { lat: 42.89, lng: -78.85, zoom: 11 },
  Rochester: { lat: 43.16, lng: -77.61, zoom: 11 },
  Central:   { lat: 43.05, lng: -76.15, zoom: 11 },
  All:       { lat: 43.0,  lng: -77.50, zoom: 9 },
}

function FlyToRegion({ region }: { region: RegionFilter }) {
  const map = useMap()
  const prevRegion = useRef(region)
  useEffect(() => {
    if (region === prevRegion.current) return
    prevRegion.current = region
    const center = REGION_CENTERS[region] || REGION_CENTERS.All
    map.flyTo([center.lat, center.lng], center.zoom, { duration: 0.8 })
  }, [region, map])
  return null
}

type BubbleRenderData = {
  key: string
  lat: number
  lng: number
  radius: number
  pathOptions: PathOptions
  bubble: MapBubble
}

type ZipRenderData = {
  key: string
  lat: number
  lng: number
  radius: number
  pathOptions: PathOptions
  zip: TerritoryZip
}

/** Imperative circle layer — bypasses React reconciliation for 400+ markers */
function ImperativeCircleLayer({
  bubbleItems,
  zipItems,
  year,
  totals,
  canvasRenderer,
}: {
  bubbleItems: BubbleRenderData[]
  zipItems: ZipRenderData[]
  year: number
  totals: TerritoryTotals
  canvasRenderer: L.Canvas
}) {
  const map = useMap()
  const layerGroupRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    // Clear previous markers
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers()
    } else {
      layerGroupRef.current = L.layerGroup().addTo(map)
    }
    const group = layerGroupRef.current

    // Draw bubble markers
    for (const item of bubbleItems) {
      const marker = L.circleMarker([item.lat, item.lng], {
        ...item.pathOptions,
        renderer: canvasRenderer,
        radius: item.radius,
      })
      const b = item.bubble
      const insPct = totals.ins_customers ? (b.ins_customers_cy / totals.ins_customers * 100).toFixed(1) : '0.0'
      const travelPct = totals.travel_customers_3yr ? (b.travel_customers_3yr / totals.travel_customers_3yr * 100).toFixed(1) : '0.0'
      marker.bindTooltip(`
        <div style="min-width:260px;font-size:11px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <b style="font-size:13px">${b.label}</b>
            <span style="opacity:0.6;font-size:10px">${b.sublabel}</span>
          </div>
          ${b.population > 0 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(128,128,128,0.2)">
            <span>Population <b>${fmt(b.population)}</b></span>
            <span>Adults 18+ <b>${fmt(b.pop_18plus)}</b></span>
            <span>Med. Income <b>${fmtCurrency(b.median_income)}</b></span>
            <span>Med. Age <b>${b.median_age}</b></span>
            <span style="color:#ea580c;font-weight:600">Mkt Share <b>${fmtPct(b.market_share)}</b></span>
          </div>` : ''}
          <div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(128,128,128,0.2)">
            <span>AAA Members <b>${fmt(b.members)}</b></span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px">
            <div><b style="color:#2563eb">🛡 Insurance</b></div>
            <div><b style="color:#059669">✈ Travel</b></div>
            <span>Customers <b>${fmt(b.ins_customers_cy)}</b></span>
            <span>Cust (3yr) <b>${fmt(b.travel_customers_3yr)}</b></span>
            <span>% of Org <b style="color:#2563eb">${insPct}%</b></span>
            <span>% of Org <b style="color:#059669">${travelPct}%</b></span>
            <span>Rev (${year}) <b>${fmtCurrency(b.ins_rev_cy)}</b></span>
            <span>Rev (${year}) <b>${fmtCurrency(b.travel_rev_cy)}</b></span>
            <span>Penetration <b>${fmtPct(b.ins_penetration)}</b></span>
            <span>Penetration <b>${fmtPct(b.travel_penetration)}</b></span>
          </div>
        </div>
      `, { sticky: true, direction: 'auto', offset: [0, -10] })
      group.addLayer(marker)
    }

    // Draw zip markers
    for (const item of zipItems) {
      const marker = L.circleMarker([item.lat, item.lng], {
        ...item.pathOptions,
        renderer: canvasRenderer,
        radius: item.radius,
      })
      const z = item.zip
      const insPct = totals.ins_customers ? (z.ins_customers_cy / totals.ins_customers * 100).toFixed(1) : '0.0'
      const travelPct = totals.travel_customers_3yr ? (z.travel_customers_3yr / totals.travel_customers_3yr * 100).toFixed(1) : '0.0'
      marker.bindTooltip(`
        <div style="min-width:260px;font-size:11px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <b style="font-size:13px">${z.zip}</b>
            <span style="opacity:0.6;font-size:10px">${z.city ? z.city + ' · ' : ''}${z.region}</span>
          </div>
          ${z.population > 0 ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(128,128,128,0.2)">
            <span>Population <b>${fmt(z.population)}</b></span>
            <span>Adults 18+ <b>${fmt(z.pop_18plus)}</b></span>
            ${z.median_income > 0 ? `<span>Med. Income <b>${fmtCurrency(z.median_income)}</b></span>` : ''}
            ${z.median_age > 0 ? `<span>Med. Age <b>${z.median_age}</b></span>` : ''}
            <span style="color:#ea580c;font-weight:600">Mkt Share <b>${fmtPct(z.market_share)}</b></span>
          </div>` : ''}
          <div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(128,128,128,0.2)">
            <span>AAA Members <b>${fmt(z.members)}</b></span>
            ${z.county_name ? `<span style="margin-left:12px">County <b>${z.county_name}</b></span>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 12px">
            <div><b style="color:#2563eb">🛡 Insurance</b></div>
            <div><b style="color:#059669">✈ Travel</b></div>
            <span>Customers <b>${fmt(z.ins_customers_cy)}</b> <b style="color:#2563eb">(${insPct}%)</b></span>
            <span>Cust (3yr) <b>${fmt(z.travel_customers_3yr)}</b> <b style="color:#059669">(${travelPct}%)</b></span>
            <span>Rev (${year}) <b>${fmtCurrency(z.ins_rev_cy)}</b></span>
            <span>Rev (${year}) <b>${fmtCurrency(z.travel_rev_cy)}</b></span>
            <span>Penetration <b>${fmtPct(z.ins_penetration)}</b></span>
            <span>Penetration <b>${fmtPct(z.travel_penetration)}</b></span>
          </div>
        </div>
      `, { sticky: true, direction: 'auto', offset: [0, -10] })
      group.addLayer(marker)
    }

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers()
      }
    }
  }, [map, bubbleItems, zipItems, year, totals, canvasRenderer])

  return null
}

/* ── Legend ───────────────────────────────────────────────────────────────── */

function Legend({ level }: { level: ZoomLevel }) {
  const levelLabel = level === 'region' ? 'Region view' : level === 'city' ? 'City view' : 'Zip code view'
  return (
    <div className="absolute bottom-6 left-6 z-[1000] bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">Customer Penetration</p>
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
        <span className="text-[10px] text-muted-foreground">5%+</span>
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

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function TerritoryMap() {
  const mountStartRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const renderMetricSentRef = useRef(false)
  const { theme } = useTheme()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [region, setRegion] = useState<RegionFilter>('All')
  const [zoom, setZoom] = useState(9)
  // viewBounds removed — canvas renderer handles clipping natively
  const [fullscreen, setFullscreen] = useState(false)
  const [showBoundaries, setShowBoundaries] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

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
    staleTime: Infinity, // never stale until explicit invalidation/refresh
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  })

  const handleZoomChange = useCallback((nextZoom: number) => {
    setZoom((z) => (z === nextZoom ? z : nextZoom))
  }, [])
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMsg('')
    try {
      // Admins can force backend cache refresh; non-admins still force local refetch.
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
  // paddedViewBounds removed — no longer filtering markers by viewport

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

  // Escape exits fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

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

  // No viewport filtering — canvas renderer handles clipping natively.
  // Filtering on every pan/zoom was causing full marker teardown + rebuild.
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

  // Tile layer URL based on theme
  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  const countyBoundaryStyle = useMemo<PathOptions>(() => ({
    color: theme === 'dark' ? 'rgba(148,163,184,0.5)' : 'rgba(71,85,105,0.45)',
    weight: 1.5,
    fillColor: 'transparent',
    fillOpacity: 0,
    dashArray: '4 3',
  }), [theme])
  const countyBoundaryStyleFn = useCallback(() => countyBoundaryStyle, [countyBoundaryStyle])
  const onCountyFeature = useCallback((feature: { properties?: { [key: string]: unknown } | null }, leafletLayer: L.Layer) => {
    const p = feature.properties
    if (p?.name && 'bindTooltip' in leafletLayer) {
      const countyName = String(p.name)
      const pop = Number(p.population || 0)
      ;(leafletLayer as L.Path).bindTooltip(
        `<strong>${countyName} County</strong><br/>Pop: ${pop.toLocaleString()}`,
        { sticky: true, direction: 'auto', className: 'county-tooltip' }
      )
    }
  }, [])

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
      {!fullscreen && <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
          label="Insurance Customers"
          value={fmt(filteredStats.ins_customers)}
          sub={`${((filteredStats.ins_customers / filteredStats.members) * 100).toFixed(2)}% penetration`}
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
          value={fmtCurrency((filteredStats.ins_rev_cy || 0) + filteredStats.travel_rev_cy)}
          sub={totals.travel_rev_py || totals.ins_rev_py ? `PY: ${fmtCurrency((totals.ins_rev_py || 0) + (totals.travel_rev_py || 0))}` : undefined}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>}

      {/* Info banner — hidden in fullscreen */}
      {!fullscreen && <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>
          Showing {level === 'city' ? `${bubbles.length} cities` : `${filteredZips.length} zip codes`}.
          {' '}Color = customer penetration (red = weak, green = strong).
          {level !== 'zip' && ' Zoom in for more detail.'}
        </span>
      </div>}

      {/* Map */}
      <div className="relative rounded-xl border border-border overflow-hidden" style={{ height: fullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 340px)', minHeight: '500px' }}>
        {/* Overlay controls — top-right corner of map */}
        <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
          {/* Region filter */}
          <div className="flex items-center bg-card/90 backdrop-blur-sm rounded-lg p-0.5 shadow-md border border-border">
            {(['All', 'Western', 'Rochester', 'Central'] as RegionFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors',
                  region === r
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {/* County boundaries toggle */}
          <button
            onClick={() => setShowBoundaries(b => !b)}
            className={cn(
              'px-2.5 py-1.5 text-[11px] font-medium rounded-lg backdrop-blur-sm shadow-md border border-border transition-colors',
              showBoundaries
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/90 text-muted-foreground hover:text-foreground'
            )}
            title={showBoundaries ? 'Hide county boundaries' : 'Show county boundaries'}
          >
            <MapIcon className="w-3 h-3 inline mr-1" />
            Counties
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(f => !f)}
            className="p-2 rounded-lg bg-card/90 backdrop-blur-sm hover:bg-card text-foreground transition-colors shadow-md border border-border"
            title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen map'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <MapContainer
          center={[43.1, -77.75]}
          zoom={9}
          minZoom={8}
          className="h-full w-full"
          zoomControl={true}
          attributionControl={false}
          preferCanvas={true}
        >
          <TileLayer url={tileUrl} />
          <ViewportTracker onZoomChange={handleZoomChange} />
          <MapResizer fullscreen={fullscreen} />
          <FlyToRegion region={region} />
          <TooltipOverflowFix />

          {/* County boundary polygons */}
          {showBoundaries && boundaries?.county_geojson && (
            <GeoJSON
              key="county-boundaries"
              data={boundaries.county_geojson}
              style={countyBoundaryStyleFn}
              onEachFeature={onCountyFeature}
            />
          )}

          {/* Region / City bubbles */}
          {/* Single imperative layer — bypasses React reconciliation for 400+ markers */}
          <ImperativeCircleLayer
            bubbleItems={level !== 'zip' ? bubbleRenderItems : []}
            zipItems={level === 'zip' ? zipRenderItems : []}
            year={year}
            totals={totals}
            canvasRenderer={canvasRenderer}
          />
        </MapContainer>

        <Legend level={level} />
      </div>

      {/* Top penetration / lowest penetration tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PenetrationTable
          title="Highest Penetration"
          subtitle="Strong market presence"
          zips={filteredZips}
          year={year}
          sort="desc"
          accent="text-green-600 dark:text-green-400"
        />
        <PenetrationTable
          title="Lowest Penetration"
          subtitle="Growth opportunity zones"
          zips={filteredZips}
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
  title, subtitle, zips, year, sort, accent,
}: {
  title: string
  subtitle: string
  zips: TerritoryZip[]
  year: number
  sort: 'asc' | 'desc'
  accent: string
}) {
  const sorted = useMemo(() => {
    const meaningful = zips.filter((z) => z.members >= 200)
    return [...meaningful]
      .sort((a, b) => {
        const pa = getPenetration(a)
        const pb = getPenetration(b)
        return sort === 'desc' ? pb - pa : pa - pb
      })
      .slice(0, 10)
  }, [zips, sort])

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
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ins Cust</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ins %</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Travel</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Travel %</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rev ({year})</th>
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
                <td className="px-3 py-2 text-right">{fmt(z.ins_customers_cy)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtPct(z.ins_penetration)}</td>
                <td className="px-3 py-2 text-right">{fmt(z.travel_customers_3yr)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtPct(z.travel_penetration)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(z.ins_rev_cy + z.travel_rev_cy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
