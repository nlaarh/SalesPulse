import { GROWTH_COLORS } from './tokens'

interface Play {
  index: number
  label: string  // e.g. "DEEPEN", "EXPAND"
  title: string
  body: string
  color: string  // accent color for top stripe
}

interface ProductRow {
  product: string
  metric: string
  currentRate: string
  gap: string
  primaryLever: string
}

interface GrowthOpportunityMapProps {
  thesis: string
  plays: Play[]
  productRows: ProductRow[]
}

export default function GrowthOpportunityMap({ thesis, plays, productRows }: GrowthOpportunityMapProps) {
  return (
    <div className="space-y-6">
      {/* Core thesis */}
      <div
        className="rounded-xl p-6 border"
        style={{ backgroundColor: '#F8FAFB', borderColor: GROWTH_COLORS.rule }}
      >
        <p
          className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2"
          style={{ color: GROWTH_COLORS.teal }}
        >
          The Core Thesis
        </p>
        <p
          className="text-[18px] md:text-xl font-semibold leading-snug"
          style={{ color: GROWTH_COLORS.ink }}
        >
          {thesis}
        </p>
      </div>

      {/* 3 play cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plays.map((p) => (
          <div
            key={p.index}
            className="rounded-xl bg-white border overflow-hidden"
            style={{ borderColor: GROWTH_COLORS.rule }}
          >
            <div className="h-1.5" style={{ backgroundColor: p.color }} />
            <div className="p-4">
              <p
                className="text-[10px] font-semibold tracking-[0.22em] uppercase"
                style={{ color: GROWTH_COLORS.inkSoft }}
              >
                Play {p.index} — {p.label}
              </p>
              <h4
                className="mt-1.5 text-lg font-bold leading-snug"
                style={{ color: GROWTH_COLORS.navy }}
              >
                {p.title}
              </h4>
              <p
                className="mt-2 text-[13px] leading-relaxed"
                style={{ color: GROWTH_COLORS.inkSoft }}
              >
                {p.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Product gap table */}
      <div
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: GROWTH_COLORS.rule }}
      >
        <table className="w-full text-[12.5px]">
          <thead style={{ backgroundColor: '#F1F5F9' }}>
            <tr className="text-left" style={{ color: GROWTH_COLORS.navy }}>
              <th className="px-4 py-2.5 font-semibold uppercase text-[10px] tracking-wider">Product</th>
              <th className="px-4 py-2.5 font-semibold uppercase text-[10px] tracking-wider">Metric</th>
              <th className="px-4 py-2.5 font-semibold uppercase text-[10px] tracking-wider">Current Rate</th>
              <th className="px-4 py-2.5 font-semibold uppercase text-[10px] tracking-wider">Gap (Opportunity)</th>
              <th className="px-4 py-2.5 font-semibold uppercase text-[10px] tracking-wider">Primary Lever</th>
            </tr>
          </thead>
          <tbody>
            {productRows.map((r) => (
              <tr key={r.product} className="border-t" style={{ borderColor: GROWTH_COLORS.rule }}>
                <td className="px-4 py-2.5 font-semibold" style={{ color: GROWTH_COLORS.navy }}>{r.product}</td>
                <td className="px-4 py-2.5" style={{ color: GROWTH_COLORS.inkSoft }}>{r.metric}</td>
                <td className="px-4 py-2.5 font-semibold" style={{ color: GROWTH_COLORS.ink }}>{r.currentRate}</td>
                <td className="px-4 py-2.5 font-semibold" style={{ color: GROWTH_COLORS.red }}>{r.gap}</td>
                <td className="px-4 py-2.5" style={{ color: GROWTH_COLORS.ink }}>{r.primaryLever}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
