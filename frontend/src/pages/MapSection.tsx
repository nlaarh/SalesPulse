import { useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import * as L from 'leaflet'
import { type PathOptions } from 'leaflet'
import {
  Map as MapIcon, Users, Download, Maximize2, Minimize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TerritoryZip, TerritoryTotals, CountyBoundaryData } from '@/lib/api'
import { exportTerritoryMapData } from './territoryMapExport'
import {
  ViewportTracker, MapResizer, TooltipOverflowFix, FlyToRegion, FlyToZip, HighlightZip,
  ImperativeCircleLayer, Legend,
} from './TerritoryMap/MapComponents'
import {
  type RegionFilter, type BubbleRenderData, type ZipRenderData,
  type ZoomLevel,
} from './TerritoryMap/utils'

interface MapSectionProps {
  fullscreen: boolean
  setFullscreen: (fn: (f: boolean) => boolean) => void
  region: RegionFilter
  setRegion: (r: RegionFilter) => void
  showBoundaries: boolean
  setShowBoundaries: (fn: (b: boolean) => boolean) => void
  tileUrl: string
  handleZoomChange: (zoom: number) => void
  selectedZip: TerritoryZip | null
  boundaries: CountyBoundaryData | undefined
  level: ZoomLevel
  bubbleRenderItems: BubbleRenderData[]
  zipRenderItems: ZipRenderData[]
  year: number
  totals: TerritoryTotals
  canvasRenderer: L.Canvas
  handleZipSelect: (zip: TerritoryZip) => void
  regionFilteredZips: TerritoryZip[]
  theme: string
}

export function MapSection({
  fullscreen,
  setFullscreen,
  region,
  setRegion,
  showBoundaries,
  setShowBoundaries,
  tileUrl,
  handleZoomChange,
  selectedZip,
  boundaries,
  level,
  bubbleRenderItems,
  zipRenderItems,
  year,
  totals,
  canvasRenderer,
  handleZipSelect,
  regionFilteredZips,
  theme,
}: MapSectionProps) {

  const countyBoundaryStyleFn = useCallback((_feature?: { properties?: { [key: string]: unknown } | null }) => {
    const base: PathOptions = {
      color: theme === 'dark' ? 'rgba(148,163,184,0.5)' : 'rgba(71,85,105,0.45)',
      weight: 1.5,
      dashArray: '4 3',
    }
    return { ...base, fillColor: 'transparent', fillOpacity: 0 }
  }, [theme])

  const onCountyFeature = useCallback((feature: { properties?: { [key: string]: unknown } | null }, leafletLayer: L.Layer) => {
    const p = feature.properties
    if (p?.name && 'bindTooltip' in leafletLayer) {
      const countyName = String(p.name)
      const pop = Number(p.population || 0)
      ;(leafletLayer as L.Path).bindTooltip(
        `<div style="font-size:12px;padding:2px">
          <b style="font-size:14px">${countyName} County</b><br/>
          <div style="margin-top:4px;border-top:1px solid rgba(0,0,0,0.1);padding-top:4px">
            Pop: <b>${pop.toLocaleString()}</b>
          </div>
        </div>`,
        { sticky: true, direction: 'auto', className: 'county-tooltip' }
      )
    }
  }, [])

  return (
    <div className="relative rounded-xl border border-border overflow-hidden" style={{ height: fullscreen ? 'calc(100vh - 120px)' : 'calc(100vh - 340px)', minHeight: '500px' }}>
      {/* Overlay controls — top-right corner of map */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        {/* Layer label */}
        <div className="flex items-center bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md border border-border">
          <Users className="w-3 h-3 mr-1.5 text-primary" />
          <span className="text-[11px] font-semibold text-foreground">Penetration</span>
        </div>

        <div className="flex items-center gap-2">
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

        {/* Excel export */}
        <button
          onClick={() => exportTerritoryMapData(regionFilteredZips, year, region)}
          disabled={!regionFilteredZips.length}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg',
            'bg-card/90 backdrop-blur-sm shadow-md border border-border transition-colors',
            'text-foreground hover:bg-muted/80',
            !regionFilteredZips.length && 'opacity-60 cursor-not-allowed'
          )}
          title="Export zip-level data to Excel"
        >
          <Download className="h-3.5 w-3.5" />
          Excel
        </button>

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
        <FlyToZip zip={selectedZip} />
        <HighlightZip zip={selectedZip} />
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

        <ImperativeCircleLayer
          bubbleItems={level !== 'zip' ? bubbleRenderItems : []}
          zipItems={level === 'zip' ? zipRenderItems : []}
          year={year}
          totals={totals}
          canvasRenderer={canvasRenderer}
          onZipClick={handleZipSelect}
        />
      </MapContainer>

      <Legend level={level} />
    </div>
  )
}
