import { ArrowDown, ArrowUp } from 'lucide-react'
import { GROWTH_COLORS } from './tokens'

interface Item {
  lead: string
  body: string
}

interface HeadwindsOppsProps {
  headwinds: Item[]
  opportunities: Item[]
  bottomLine?: string
}

export default function HeadwindsOpps({ headwinds, opportunities, bottomLine }: HeadwindsOppsProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Headwinds */}
        <div>
          <p
            className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3"
            style={{ color: GROWTH_COLORS.red }}
          >
            Headwinds
          </p>
          <ul className="space-y-3">
            {headwinds.map((h, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                <ArrowDown
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: GROWTH_COLORS.red }}
                />
                <span style={{ color: GROWTH_COLORS.ink }}>
                  <span className="font-bold">{h.lead} </span>
                  <span style={{ color: GROWTH_COLORS.inkSoft }}>{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Opportunities */}
        <div>
          <p
            className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3"
            style={{ color: GROWTH_COLORS.green }}
          >
            Opportunities
          </p>
          <ul className="space-y-3">
            {opportunities.map((o, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                <ArrowUp
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: GROWTH_COLORS.green }}
                />
                <span style={{ color: GROWTH_COLORS.ink }}>
                  <span className="font-bold">{o.lead} </span>
                  <span style={{ color: GROWTH_COLORS.inkSoft }}>{o.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {bottomLine && (
        <div
          className="rounded-lg p-5 border"
          style={{ backgroundColor: '#F8FAFB', borderColor: GROWTH_COLORS.rule }}
        >
          <p
            className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2"
            style={{ color: GROWTH_COLORS.teal }}
          >
            Bottom Line
          </p>
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: GROWTH_COLORS.ink }}
          >
            {bottomLine}
          </p>
        </div>
      )}
    </div>
  )
}
