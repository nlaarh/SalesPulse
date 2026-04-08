export interface ProgressRingProps {
  pct: number
}

export default function ProgressRing({ pct }: ProgressRingProps) {
  const clamped = Math.min(pct, 200) // cap visual at 200%
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(clamped, 100) / 100) * circ
  const color = pct >= 100 ? '#16A34A' : pct >= 80 ? '#D97706' : '#EF4444'

  return (
    <div className="relative flex h-[110px] w-[110px] shrink-0 items-center justify-center">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none"
          stroke="currentColor" strokeWidth="8" className="text-secondary" />
        <circle cx="55" cy="55" r={r} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tabular-nums" style={{ color }}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[9px] text-muted-foreground">of target</span>
      </div>
    </div>
  )
}
