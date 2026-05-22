import type { ReactNode } from 'react'
import { GROWTH_COLORS } from './tokens'
import SectionHeader from './SectionHeader'

export interface ProductKpi {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | 'flat'
}

interface ProductDeepDiveProps {
  page: string
  productName: string
  subtitle: string
  accentColor: string
  kpis: ProductKpi[]
  rightSlot?: ReactNode
  children: ReactNode
}

const TREND_ARROW = { up: '↑', down: '↓', flat: '→' } as const
const TREND_COLOR = {
  up: GROWTH_COLORS.green,
  down: GROWTH_COLORS.red,
  flat: GROWTH_COLORS.inkSoft,
} as const

export default function ProductDeepDive({
  page, productName, subtitle, accentColor, kpis, rightSlot, children,
}: ProductDeepDiveProps) {
  return (
    <section>
      <SectionHeader
        page={page}
        title={`${productName} Deep Dive`}
        subtitle={subtitle}
        rightSlot={rightSlot}
      />

      {/* Product accent bar */}
      <div className="h-1 w-full mb-5 rounded" style={{ backgroundColor: accentColor }} />

      {/* KPI strip */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-xl border bg-white px-4 py-3"
              style={{ borderColor: GROWTH_COLORS.rule }}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: GROWTH_COLORS.inkSoft }}>
                {k.label}
              </p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight" style={{ color: GROWTH_COLORS.navy }}>
                {k.value}
                {k.trend && (
                  <span
                    className="ml-1.5 text-sm align-middle"
                    style={{ color: TREND_COLOR[k.trend] }}
                  >
                    {TREND_ARROW[k.trend]}
                  </span>
                )}
              </p>
              {k.sub && (
                <p className="text-[11px] mt-0.5" style={{ color: GROWTH_COLORS.inkSoft }}>
                  {k.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Section content */}
      <div className="space-y-4">{children}</div>
    </section>
  )
}
