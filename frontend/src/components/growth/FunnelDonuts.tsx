import ReactECharts from 'echarts-for-react'
import { GROWTH_COLORS, fmt, metallicGradient, metallicShadow } from './tokens'

export interface FunnelDonut {
  title: string
  centerLabel: string  // e.g. "Members ÷ Adults 18+"
  /** Filled value (0..1) — e.g. 0.28 for 28% */
  value: number
  /** Numerator absolute count (for legend) */
  num: number
  /** Denominator absolute count (for legend) */
  denom: number
  /** Numerator legend label, e.g. "AAA Members" */
  numLabel: string
  /** Denominator legend label, e.g. "Adults 18+" */
  denomLabel: string
  color: string
}

interface FunnelDonutsProps {
  donuts: [FunnelDonut, FunnelDonut, FunnelDonut]
}

function makeOption(d: FunnelDonut) {
  const filled = Math.max(0, Math.min(1, d.value))
  const remainder = 1 - filled
  return {
    title: {
      text: d.title,
      left: 'center',
      top: 6,
      textStyle: {
        fontSize: 11,
        fontWeight: 600,
        color: GROWTH_COLORS.navy,
        fontFamily: 'inherit',
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '82%'],
        center: ['50%', '54%'],
        avoidLabelOverlap: false,
        startAngle: 90,
        emphasis: { scale: false, scaleSize: 0 },
        label: {
          show: true,
          position: 'center',
          formatter: () => `{v|${fmt.pctPlain(filled * 100, 1)}}\n{l|${d.centerLabel}}`,
          rich: {
            v: {
              fontSize: 24,
              fontWeight: 700,
              color: GROWTH_COLORS.ink,
              fontFamily: 'inherit',
              lineHeight: 28,
            },
            l: {
              fontSize: 9,
              color: GROWTH_COLORS.inkSoft,
              fontFamily: 'inherit',
              padding: [3, 0, 0, 0],
            },
          },
        },
        labelLine: { show: false },
        animationDuration: 700,
        data: [
          {
            value: filled,
            name: d.numLabel,
            itemStyle: {
              color: metallicGradient(d.color, { direction: 'vertical', alpha: 0.95 }),
              borderColor: '#fff',
              borderWidth: 2,
              ...metallicShadow(d.color, 0.32),
            },
          },
          {
            value: remainder,
            name: d.denomLabel,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: '#F3F4F6' },
                  { offset: 1, color: '#D1D5DB' },
                ],
              },
              borderColor: '#fff',
              borderWidth: 2,
            },
          },
        ],
      },
    ],
  }
}

export default function FunnelDonuts({ donuts }: FunnelDonutsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {donuts.map((d, i) => (
        <div
          key={i}
          className="rounded-xl border p-3 bg-white"
          style={{ borderColor: GROWTH_COLORS.rule }}
        >
          <ReactECharts
            option={makeOption(d)}
            style={{ height: 260, width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
          <div className="mt-1 px-2 flex justify-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5" style={{ color: GROWTH_COLORS.ink }}>
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              {d.numLabel} ({fmt.num(d.num)})
            </span>
            <span className="flex items-center gap-1.5" style={{ color: GROWTH_COLORS.inkSoft }}>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300" />
              {d.denomLabel} ({fmt.num(d.denom)})
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
