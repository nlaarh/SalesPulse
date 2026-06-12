import { useEffect, useRef, useMemo, useState } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { X, Shield, Plane, Users, TrendingUp, ZoomIn, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/MetricTip'
import type { TerritoryTotals, TerritoryZip, ZipCustomer } from '@/lib/api'
import { fetchZipCustomers } from '@/lib/api'
import { useSales } from '@/contexts/SalesContext'
import {
  type ZoomLevel, type BubbleRenderData, type ZipRenderData,
  type RegionFilter, fmt, fmtPct, fmtCurrency, getPenetration,
} from './utils'

// ── Zoom tracker ──────────────────────────────────────────────────────────────

export function ViewportTracker({ onZoomChange }: {
  onZoomChange: (zoom: number) => void
}) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  })
  useEffect(() => { onZoomChange(map.getZoom()) }, [map, onZoomChange])
  return null
}

export function MapResizer({ fullscreen }: { fullscreen: boolean }) {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [fullscreen, map])
  return null
}

export function TooltipOverflowFix() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const tooltipPane = map.getPane('tooltipPane')
    if (!tooltipPane || !container) return

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
      const mapTransform = mapPane.style.transform
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

export const REGION_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  Western:   { lat: 42.89, lng: -78.85, zoom: 11 },
  Rochester: { lat: 43.16, lng: -77.61, zoom: 11 },
  Central:   { lat: 43.05, lng: -76.15, zoom: 11 },
  All:       { lat: 43.0,  lng: -77.50, zoom: 9 },
}

export function FlyToRegion({ region }: { region: RegionFilter }) {
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

export function FlyToZip({ zip }: { zip: TerritoryZip | null }) {
  const map = useMap()
  const prevZip = useRef<string | null>(null)
  useEffect(() => {
    if (!zip || zip.zip === prevZip.current) return
    prevZip.current = zip.zip
    map.flyTo([zip.lat, zip.lng], 13, { duration: 0.8 })
  }, [zip, map])
  return null
}

export function HighlightZip({ zip }: { zip: TerritoryZip | null }) {
  const map = useMap()
  const markerRef = useRef<L.CircleMarker | null>(null)
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    if (!zip) return
    const marker = L.circleMarker([zip.lat, zip.lng], {
      radius: 22,
      fillColor: 'transparent',
      fillOpacity: 0,
      color: '#f59e0b',
      weight: 3,
      opacity: 1,
      dashArray: '6 4',
      className: 'zip-highlight-ring',
    }).addTo(map)
    markerRef.current = marker
    return () => { marker.remove() }
  }, [zip, map])
  return null
}

// ── Imperative circle layer ───────────────────────────────────────────────────

export function ImperativeCircleLayer({
  bubbleItems,
  zipItems,
  year,
  totals,
  canvasRenderer,
  onZipClick,
}: {
  bubbleItems: BubbleRenderData[]
  zipItems: ZipRenderData[]
  year: number
  totals: TerritoryTotals
  canvasRenderer: L.Canvas
  onZipClick?: (zip: TerritoryZip) => void
}) {
  const map = useMap()
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const onZipClickRef = useRef(onZipClick)
  useEffect(() => { onZipClickRef.current = onZipClick }, [onZipClick])

  useEffect(() => {
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers()
    } else {
      layerGroupRef.current = L.layerGroup().addTo(map)
    }
    const group = layerGroupRef.current

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
            <span>Housing <b>${fmt(b.housing_units)}</b></span>
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
            ${z.housing_units > 0 ? `<span>Housing <b>${fmt(z.housing_units)}</b></span>` : ''}
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
          <div style="margin-top:6px;padding-top:4px;border-top:1px solid rgba(128,128,128,0.2);font-size:10px;opacity:0.7;text-align:center">
            Click to drill down
          </div>
        </div>
      `, { sticky: true, direction: 'auto', offset: [0, -10] })
      marker.on('click', () => onZipClickRef.current?.(z))
      const el = (marker as unknown as { _path?: SVGElement })._path
      if (el) el.style.cursor = 'pointer'
      marker.on('add', () => {
        const path = (marker as unknown as { _path?: SVGElement })._path
        if (path) path.style.cursor = 'pointer'
      })
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

// ── Legend ────────────────────────────────────────────────────────────────────

export function Legend({ level, activeLayer }: { level: ZoomLevel; activeLayer: 'penetration' | 'vehicles' }) {
  const levelLabel = level === 'region' ? 'Region view' : level === 'city' ? 'City view' : 'Zip code view'
  const isVehicles = activeLayer === 'vehicles'

  return (
    <div className="absolute bottom-6 left-6 z-[1000] bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">
          {isVehicles ? 'County EV Penetration' : 'Customer Penetration'}
        </p>
        {!isVehicles && (
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium ml-2">
            {levelLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">{isVehicles ? '0%' : '0%'}</span>
        <div className="flex h-3 rounded overflow-hidden">
          {isVehicles ? (
            <>
              <div className="w-6 bg-slate-400" />
              <div className="w-6 bg-amber-300" />
              <div className="w-6 bg-amber-400" />
              <div className="w-6 bg-amber-500" />
              <div className="w-6 bg-emerald-500" />
            </>
          ) : (
            <>
              <div className="w-6 bg-red-500" />
              <div className="w-6 bg-orange-500" />
              <div className="w-6 bg-yellow-500" />
              <div className="w-6 bg-green-500" />
            </>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{isVehicles ? '5%+' : '5%+'}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        <ZoomIn className="w-3 h-3 inline mr-0.5" />
        {isVehicles ? 'Color shows % of EVs in county' : 'Zoom in for more detail'}
      </p>
    </div>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────

export function SummaryCard({
  icon: Icon, label, value, sub, accent, tip,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  accent: string
  tip?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 h-full">
      <div className={cn('p-2 rounded-lg shrink-0', accent)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex flex-col">
        <p className="text-xs text-muted-foreground h-8 flex items-end">{label}{tip && <Tip text={tip} />}</p>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub || ' '}</p>
      </div>
    </div>
  )
}

// ── Penetration ranking table ─────────────────────────────────────────────────

export function PenetrationTable({
  title, subtitle, zips, year, sort, accent, onZipClick, selectedZip,
}: {
  title: string
  subtitle: string
  zips: TerritoryZip[]
  year: number
  sort: 'asc' | 'desc'
  accent: string
  onZipClick?: (zip: TerritoryZip) => void
  selectedZip?: TerritoryZip | null
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
              <tr
                key={z.zip}
                onClick={() => onZipClick?.(z)}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  onZipClick ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-muted/20',
                  selectedZip?.zip === z.zip && 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/50',
                )}
              >
                <td className="px-3 py-2 font-mono font-medium">
                  <span className={cn(onZipClick && 'text-primary underline underline-offset-2 cursor-pointer decoration-primary/50 hover:decoration-primary')}>
                    {z.zip}
                  </span>
                </td>
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

// ── Zip Detail Panel ──────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, valueClass, icon,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {icon}{label}
      </span>
      <span className={cn('text-sm font-bold leading-tight tabular-nums', valueClass ?? 'text-foreground')}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground leading-tight">{sub}</span>}
    </div>
  )
}

function SectionHeader({ label, icon, colorClass }: { label: string; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-2', colorClass)}>
      {icon} {label}
    </div>
  )
}

export function ZipDetailPanel({
  zip, year, onClose,
}: {
  zip: TerritoryZip
  year: number
  onClose: () => void
}) {
  const { period, startDate, endDate } = useSales()
  const [drillType, setDrillType] = useState<'insurance' | 'travel' | null>(null)
  const [customers, setCustomers] = useState<ZipCustomer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [customerCount, setCustomerCount] = useState(0)

  const totalRevCy = zip.ins_rev_cy + zip.travel_rev_cy
  const totalRevPy = (zip.ins_rev_py ?? 0) + (zip.travel_rev_py ?? 0)
  const revYoY = totalRevPy > 0 ? ((totalRevCy - totalRevPy) / totalRevPy * 100) : null

  const collegePct = (zip.college_educated > 0 && zip.pop_18plus > 0)
    ? Math.round(zip.college_educated / zip.pop_18plus * 1000) / 10
    : 0

  const insPenColor = zip.ins_penetration >= 15
    ? 'text-emerald-500' : zip.ins_penetration >= 5
    ? 'text-green-500' : zip.ins_penetration >= 2
    ? 'text-yellow-500' : 'text-red-500'

  const trvPenColor = zip.travel_penetration >= 15
    ? 'text-emerald-500' : zip.travel_penetration >= 5
    ? 'text-green-500' : zip.travel_penetration >= 2
    ? 'text-yellow-500' : 'text-red-500'

  const yoyColor = (cy: number, py: number) => cy >= py ? 'text-emerald-500' : 'text-red-500'
  const yoyLabel = (cy: number, py: number) =>
    py > 0 ? `${cy >= py ? '▲' : '▼'} ${Math.abs((cy - py) / py * 100).toFixed(1)}% YoY` : undefined

  const handleDrill = async (type: 'insurance' | 'travel') => {
    if (drillType === type) {
      setDrillType(null)
      setCustomers([])
      return
    }
    setDrillType(type)
    setLoadingCustomers(true)
    try {
      const res = await fetchZipCustomers(zip.zip, type, period, startDate, endDate)
      setCustomers(res.customers)
      setCustomerCount(res.count)
    } catch {
      setCustomers([])
      setCustomerCount(0)
    } finally {
      setLoadingCustomers(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary/5 via-transparent to-transparent border-b border-border">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-2xl font-black font-mono tracking-tight text-foreground">{zip.zip}</span>
              {zip.city && <span className="text-base font-semibold text-foreground/70">{zip.city}</span>}
              <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">{zip.region}</span>
              {zip.county_name && <span className="text-xs text-muted-foreground">{zip.county_name} County</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drill-down · {year} · {fmt(zip.members)} members
              {zip.market_share > 0 && <span className="ml-1 text-orange-500 font-medium">· {fmtPct(zip.market_share)} market share</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Demographics */}
        {zip.population > 0 && (
          <div>
            <SectionHeader label="Demographics" icon={<Users className="w-3.5 h-3.5" />} colorClass="text-slate-500 dark:text-slate-400" />
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Population" value={fmt(zip.population)} />
              <MetricCard label="Adults 18+" value={fmt(zip.pop_18plus)} />
              {zip.median_income > 0 && <MetricCard label="Med. Income" value={fmtCurrency(zip.median_income)} />}
              {zip.median_age > 0 && <MetricCard label="Med. Age" value={`${zip.median_age} yrs`} />}
              {zip.housing_units > 0 && <MetricCard label="Housing Units" value={fmt(zip.housing_units)} />}
              {collegePct > 0 && <MetricCard label="College Edu." value={`${collegePct}%`} sub="of adults 18+" />}
            </div>
          </div>
        )}

        {/* Insurance */}
        <div>
          <SectionHeader label="Insurance" icon={<Shield className="w-3.5 h-3.5" />} colorClass="text-blue-500 dark:text-blue-400" />
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Customers" value={fmt(zip.ins_customers_cy)} />
            <MetricCard label="Penetration" value={fmtPct(zip.ins_penetration)} valueClass={insPenColor} />
            <MetricCard
              label={`Revenue ${year}`}
              value={fmtCurrency(zip.ins_rev_cy)}
              sub={zip.ins_rev_py > 0 ? yoyLabel(zip.ins_rev_cy, zip.ins_rev_py) : undefined}
              valueClass={zip.ins_rev_py > 0 ? yoyColor(zip.ins_rev_cy, zip.ins_rev_py) : undefined}
            />
            {zip.ins_rev_py > 0 && (
              <MetricCard label="Prior Year" value={fmtCurrency(zip.ins_rev_py)} valueClass="text-muted-foreground" />
            )}
            <MetricCard label="% of Org" value={fmtPct(zip.ins_pct_of_total)} valueClass="text-muted-foreground" />
          </div>
          <button
            onClick={() => handleDrill('insurance')}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
              drillType === 'insurance'
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'border-border hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            )}
          >
            <Shield className="w-3.5 h-3.5" />
            {drillType === 'insurance' ? 'Hide' : 'View'} Insurance Customers
            {drillType === 'insurance' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Travel */}
        <div>
          <SectionHeader label="Travel" icon={<Plane className="w-3.5 h-3.5" />} colorClass="text-emerald-500 dark:text-emerald-400" />
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Customers (3yr)" value={fmt(zip.travel_customers_3yr)} />
            <MetricCard label="Penetration" value={fmtPct(zip.travel_penetration)} valueClass={trvPenColor} />
            <MetricCard
              label={`Revenue ${year}`}
              value={fmtCurrency(zip.travel_rev_cy)}
              sub={zip.travel_rev_py > 0 ? yoyLabel(zip.travel_rev_cy, zip.travel_rev_py) : undefined}
              valueClass={zip.travel_rev_py > 0 ? yoyColor(zip.travel_rev_cy, zip.travel_rev_py) : undefined}
            />
            {zip.travel_rev_py > 0 && (
              <MetricCard label="Prior Year" value={fmtCurrency(zip.travel_rev_py)} valueClass="text-muted-foreground" />
            )}
            <MetricCard label="% of Org" value={fmtPct(zip.travel_pct_of_total)} valueClass="text-muted-foreground" />
          </div>
          <button
            onClick={() => handleDrill('travel')}
            className={cn(
              'mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors',
              drillType === 'travel'
                ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'border-border hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
            )}
          >
            <Plane className="w-3.5 h-3.5" />
            {drillType === 'travel' ? 'Hide' : 'View'} Travel Customers
            {drillType === 'travel' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* ── Customer Drill-down Table ── */}
      {drillType && (
        <div className="border-t border-border">
          {loadingCustomers ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading {drillType} customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No {drillType} customers found in {zip.zip}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Member ID</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Plan</th>
                    {drillType === 'insurance' && (
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Insurance ID</th>
                    )}
                    {drillType === 'travel' && (
                      <>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Trips</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Trip</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={c.id || i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.email || '—'}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{c.member_id || '—'}</td>
                      <td className="px-4 py-2">{c.plan || '—'}</td>
                      {drillType === 'insurance' && (
                        <td className="px-4 py-2 font-mono">{c.insurance_id || '—'}</td>
                      )}
                      {drillType === 'travel' && (
                        <>
                          <td className="px-4 py-2 text-right font-medium text-emerald-600">{fmtCurrency(c.total_rev || 0)}</td>
                          <td className="px-4 py-2 text-right">{c.trip_count || 0}</td>
                          <td className="px-4 py-2 text-muted-foreground">{c.last_trip || '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/20">
                Showing {customers.length} of {customerCount} {drillType} customers in {zip.zip}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer bar ── */}
      <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Total {year} Revenue:</span>
          <span className="font-bold text-foreground">{fmtCurrency(totalRevCy)}</span>
        </div>
        {revYoY !== null && (
          <span className={cn('font-semibold', revYoY >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {revYoY >= 0 ? '▲' : '▼'} {Math.abs(revYoY).toFixed(1)}% vs prior year
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          Rev / member: <b className="text-foreground">{fmtCurrency(zip.members > 0 ? totalRevCy / zip.members : 0)}</b>
        </span>
      </div>
    </div>
  )
}
