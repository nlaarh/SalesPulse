import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

export interface RevenueSlice {
  product: string
  pct: number    // 0-100
  value: number  // dollars
  color: string
}

interface RevenueCompositionProps {
  year1Label: string
  year1Total: number
  year1Slices: RevenueSlice[]
  year2Label: string
  year2Total: number
  year2Slices: RevenueSlice[]
}

function pieOption(label: string, total: number, slices: RevenueSlice[]) {
  return {
    title: {
      text: label,
      subtext: fmt.dollars(total),
      left: 'center',
      top: 10,
      textStyle: {
        fontSize: 10,
        color: GROWTH_COLORS.inkSoft,
        fontWeight: 600,
        fontFamily: 'inherit',
      },
      subtextStyle: {
        fontSize: 18,
        color: GROWTH_COLORS.navy,
        fontWeight: 700,
        fontFamily: 'inherit',
      },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number }
        return `<b>${p.name}</b><br/>${fmt.dollars(p.value)} · ${p.percent.toFixed(1)}%`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['38%', '72%'],
        center: ['50%', '60%'],
        roseType: false,
        startAngle: 90,
        avoidLabelOverlap: true,
        minAngle: 6,
        // Premium: per-slice metallic gradient + matching shadow (applied per-data below)
        itemStyle: {
          borderColor: '#FFFFFF',
          borderWidth: 2,
        },
        label: {
          formatter: '{b}\n{d}%',
          fontSize: 9,
          color: GROWTH_COLORS.inkSoft,
          lineHeight: 12,
        },
        labelLine: { length: 8, length2: 8 },
        animationDuration: 700,
        data: slices.map((s) => ({
          name: s.product,
          value: s.value,
          itemStyle: {
            color: metallicGradient(s.color, { direction: 'vertical', alpha: 0.95 }),
            ...metallicShadow(s.color, 0.28),
          },
        })),
      },
    ],
  }
}

export default function RevenueComposition({
  year1Label, year1Total, year1Slices,
  year2Label, year2Total, year2Slices,
}: RevenueCompositionProps) {
  return (
    <div className="rounded-xl border p-4 md:p-6 bg-white" style={{ borderColor: GROWTH_COLORS.rule }}>
      <p
        className="text-[11px] font-semibold tracking-[0.22em] uppercase mb-1"
        style={{ color: GROWTH_COLORS.teal }}
      >
        Strategic Overview · Board Book 3-Year Financial Projection (2026–2028)
      </p>
      <h3
        className="text-lg md:text-xl font-bold tracking-tight mb-1"
        style={{ color: GROWTH_COLORS.navy }}
      >
        Revenue Composition — {year1Label} vs {year2Label}
      </h3>
      <p className="text-sm mb-4" style={{ color: GROWTH_COLORS.inkSoft }}>
        Growth is earned through cross-sell depth, not new markets.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ReactECharts
          option={pieOption(year1Label, year1Total, year1Slices)}
          style={{ height: 340, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
        <ReactECharts
          option={pieOption(year2Label, year2Total, year2Slices)}
          style={{ height: 340, width: '100%' }}
          opts={{ renderer: 'svg' }}
        />
      </div>

      {/* Mix shift table */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2 text-[12.5px]">
        {year1Slices.map((s1, i) => {
          const s2 = year2Slices[i]
          if (!s2) return null
          const direction = s2.pct - s1.pct
          return (
            <div
              key={s1.product}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: GROWTH_COLORS.rule, backgroundColor: '#F8FAFB' }}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: GROWTH_COLORS.inkSoft }}>
                {s1.product}
              </p>
              <p className="mt-1.5 font-semibold" style={{ color: GROWTH_COLORS.ink }}>
                {s1.pct.toFixed(1)}%{' '}
                <span style={{ color: GROWTH_COLORS.inkSoft }}>→</span>{' '}
                <span style={{ color: direction >= 0 ? GROWTH_COLORS.green : GROWTH_COLORS.red }}>
                  {s2.pct.toFixed(1)}%
                </span>
              </p>
              <p className="text-[10.5px]" style={{ color: GROWTH_COLORS.inkSoft }}>
                {fmt.dollars(s1.value)} → {fmt.dollars(s2.value)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
