import CountyChoropleth, { type CountyMetric } from './CountyChoropleth'
import { GROWTH_COLORS, type RampKey } from './tokens'
import type { FeatureCollection } from 'geojson'

export interface MarketHealthLens {
  title: string
  subtitle: string
  ramp: RampKey
  metrics: CountyMetric[]
  unit?: string
  valueKind?: 'pct' | 'count'
}

interface MarketHealthGridProps {
  geojson: FeatureCollection | null
  lenses: MarketHealthLens[]
}

export default function MarketHealthGrid({ geojson, lenses }: MarketHealthGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {lenses.map((lens) => (
        <div
          key={lens.title}
          className="rounded-xl border bg-white overflow-hidden"
          style={{ borderColor: GROWTH_COLORS.rule }}
        >
          <div className="px-3 pt-3 pb-1">
            <p className="text-[12px] font-semibold" style={{ color: GROWTH_COLORS.navy }}>
              {lens.title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: GROWTH_COLORS.inkSoft }}>
              {lens.subtitle}
            </p>
          </div>
          <CountyChoropleth
            geojson={geojson}
            countyMetrics={lens.metrics}
            ramp={lens.ramp}
            valueKind={lens.valueKind ?? 'pct'}
            unit={lens.unit ?? '%'}
            height={260}
            showLabels={false}
          />
        </div>
      ))}
    </div>
  )
}
