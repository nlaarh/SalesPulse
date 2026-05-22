import { GROWTH_COLORS } from './tokens'

interface PunchlineCardProps {
  punchline: string
  action?: string
}

export default function PunchlineCard({ punchline, action }: PunchlineCardProps) {
  return (
    <div
      className="mt-5 rounded-lg p-5 border"
      style={{
        backgroundColor: '#F8FAFB',
        borderColor: GROWTH_COLORS.rule,
      }}
    >
      <p
        className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-2"
        style={{ color: GROWTH_COLORS.teal }}
      >
        Punchline
      </p>
      <p
        className="text-[15px] font-semibold leading-snug"
        style={{ color: GROWTH_COLORS.ink }}
      >
        {punchline}
      </p>
      {action && (
        <p
          className="mt-3 text-[13px] leading-relaxed"
          style={{ color: GROWTH_COLORS.inkSoft }}
        >
          <span
            className="font-bold"
            style={{ color: GROWTH_COLORS.teal }}
          >
            → Action:{' '}
          </span>
          {action}
        </p>
      )}
    </div>
  )
}
