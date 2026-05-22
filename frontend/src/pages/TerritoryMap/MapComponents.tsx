import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { ZoomIn } from 'lucide-react'
import type { TerritoryTotals, TerritoryZip } from '@/lib/api'
import {
  type ZoomLevel, type BubbleRenderData, type ZipRenderData,
  type RegionFilter, fmt, fmtPct, fmtCurrency,
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
