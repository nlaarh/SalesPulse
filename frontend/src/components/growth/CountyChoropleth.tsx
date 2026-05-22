import { useMemo } from 'react'
import { MapContainer, GeoJSON } from 'react-leaflet'
import type { LatLngBoundsExpression, PathOptions, Layer } from 'leaflet'
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import { GROWTH_COLORS, RAMPS, rampColor, fmt, type RampKey } from './tokens'
import 'leaflet/dist/leaflet.css'
import './CountyChoropleth.css'

export interface CountyMetric {
  countyName: string
  value: number
}

interface CountyChoroplethProps {
  geojson: FeatureCollection | null
  countyMetrics: CountyMetric[]
  ramp?: RampKey
  valueKind?: 'pct' | 'count'
  unit?: string
  height?: number
  title?: string
  /** Show small county-name labels on each polygon (auto-off for heights < 320) */
  showLabels?: boolean
}

const WCNY_BOUNDS: LatLngBoundsExpression = [
  [41.95, -79.95],
  [44.05, -75.20],
]

function normalizeName(s: string): string {
  return (s || '').toLowerCase().replace(/\s+county/i, '').trim()
}

export default function CountyChoropleth({
  geojson,
  countyMetrics,
  ramp = 'membership',
  valueKind = 'pct',
  unit = '%',
  height = 380,
  title,
  showLabels,
}: CountyChoroplethProps) {
  const colors = RAMPS[ramp]
  // Auto-hide labels on small maps where they'd overlap
  const labelsOn = showLabels ?? height >= 360
  // Use compact horizontal gradient bar for small map panels
  const compactLegend = height < 320

  const { byCounty, lo, hi } = useMemo(() => {
    const byCounty = new Map<string, number>()
    let lo = Infinity
    let hi = -Infinity
    for (const m of countyMetrics) {
      byCounty.set(normalizeName(m.countyName), m.value)
      if (Number.isFinite(m.value)) {
        if (m.value < lo) lo = m.value
        if (m.value > hi) hi = m.value
      }
    }
    if (!Number.isFinite(lo)) lo = 0
    if (!Number.isFinite(hi)) hi = 1
    if (lo === hi) hi = lo + 1
    return { byCounty, lo, hi }
  }, [countyMetrics])

  const styleFn = (feature?: Feature<Geometry, GeoJsonProperties>): PathOptions => {
    const name = ((feature?.properties as Record<string, unknown> | null)?.['NAME']
      ?? (feature?.properties as Record<string, unknown> | null)?.['name']
      ?? '') as string
    const v = byCounty.get(normalizeName(name))
    const fillColor = v == null ? '#F3F4F6' : rampColor(v, colors, lo, hi)
    return {
      fillColor,
      fillOpacity: v == null ? 0.5 : 0.92,
      color: '#FFFFFF',
      weight: 1.4,
      opacity: 1,
    }
  }

  const onEachFeature = (feature: Feature<Geometry, GeoJsonProperties>, layer: Layer) => {
    const name = ((feature.properties as Record<string, unknown> | null)?.['NAME']
      ?? (feature.properties as Record<string, unknown> | null)?.['name']
      ?? 'County') as string
    const v = byCounty.get(normalizeName(name))
    const valStr =
      v == null ? 'No data' :
      valueKind === 'pct' ? fmt.pctPlain(v, 1) :
      fmt.num(v)

    // Hover tooltip (always on)
    layer.bindTooltip(`<b>${name}</b><br/>${valStr}`, {
      sticky: true,
      direction: 'top',
      className: 'cc-hover-tip',
    })

    // Permanent county label centered on polygon — only when labelsOn
    if (labelsOn) {
      // L.tooltip uses an html element; we render a tiny styled span.
      const html = `<span class="cc-label">${name}</span>`
      // Use Leaflet's native polygon centroid (handles MultiPolygon edge cases)
      // by binding a *non-hover* tooltip with permanent + center.
      // We render this via setTooltipContent + openTooltip on the layer.
      const Lmod = (window as unknown as { L?: { tooltip: (...args: unknown[]) => unknown } }).L
      // Avoid relying on dynamic Leaflet import; use a separate permanent tooltip
      // by re-binding once.
      void Lmod  // keep linter happy
      ;(layer as unknown as { bindTooltip: (c: string, o: object) => unknown }).bindTooltip(html, {
        permanent: true,
        direction: 'center',
        className: 'cc-perm-label',
        opacity: 1,
      })
    }
  }

  // Build legend stops
  const legendStops = useMemo(() => {
    const stops = colors.length
    const step = (hi - lo) / stops
    return Array.from({ length: stops }, (_, i) => ({
      color: colors[i],
      from: lo + i * step,
    }))
  }, [colors, lo, hi])

  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: GROWTH_COLORS.rule }}>
      {title && (
        <p
          className="px-4 pt-3 pb-1 text-[12.5px] font-semibold text-center"
          style={{ color: GROWTH_COLORS.navy }}
        >
          {title}
        </p>
      )}
      <div className="relative">
        <MapContainer
          style={{ height, width: '100%', background: '#FFFFFF' }}
          bounds={WCNY_BOUNDS}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
        >
          {geojson && (
            <GeoJSON
              key={`${ramp}-${countyMetrics.length}-${lo.toFixed(3)}-${hi.toFixed(3)}-${labelsOn ? 'L' : 'NL'}`}
              data={geojson}
              style={styleFn}
              onEachFeature={onEachFeature}
            />
          )}
        </MapContainer>

        {/* Full vertical legend — only on larger maps (>= 320px tall) */}
        {!compactLegend && (
          <div
            className="cc-legend absolute right-3 top-3 rounded-md border px-2.5 py-2 shadow-md"
            style={{
              borderColor: GROWTH_COLORS.rule,
              backgroundColor: '#FFFFFF',
              zIndex: 1000,
            }}
          >
            <p
              className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: GROWTH_COLORS.inkSoft }}
            >
              {unit === '%' ? 'Pen %' : unit}
            </p>
            <div className="flex flex-col-reverse gap-[3px]">
              {legendStops.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[9.5px]">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: s.color }}
                  />
                  <span style={{ color: GROWTH_COLORS.inkSoft }}>
                    {valueKind === 'pct' ? fmt.pctPlain(s.from, hi < 5 ? 1 : 0) : fmt.num(s.from)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compact horizontal gradient bar — used on small grid maps */}
      {compactLegend && (
        <div className="px-3 py-2 flex items-center gap-2 border-t" style={{ borderColor: GROWTH_COLORS.rule }}>
          <span className="text-[9px]" style={{ color: GROWTH_COLORS.inkSoft }}>
            {valueKind === 'pct' ? fmt.pctPlain(lo, hi < 5 ? 2 : 1) : fmt.num(lo)}
          </span>
          <div
            className="flex-1 h-2 rounded"
            style={{
              background: `linear-gradient(to right, ${colors[0]} 0%, ${colors[Math.floor(colors.length / 2)]} 50%, ${colors[colors.length - 1]} 100%)`,
            }}
          />
          <span className="text-[9px]" style={{ color: GROWTH_COLORS.inkSoft }}>
            {valueKind === 'pct' ? fmt.pctPlain(hi, hi < 5 ? 2 : 1) : fmt.num(hi)}
          </span>
          <span
            className="text-[9px] font-semibold uppercase tracking-wider ml-1"
            style={{ color: GROWTH_COLORS.inkSoft }}
          >
            {unit === '%' ? '%' : unit}
          </span>
        </div>
      )}
    </div>
  )
}
