import { cn } from '@/lib/utils'

interface SalesPulseLogoProps {
  size?: number
  className?: string
  showText?: boolean
  textClassName?: string
}

/**
 * SalesPulse brand logo — a pulse/heartbeat line morphing into an upward trend arrow,
 * rendered as an inline SVG so it works everywhere without external assets.
 */
export default function SalesPulseLogo({
  size = 32,
  className,
  showText = false,
  textClassName,
}: SalesPulseLogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Background circle with gradient */}
        <defs>
          <linearGradient id="sp-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--si-primary)" />
            <stop offset="100%" stopColor="var(--si-accent)" />
          </linearGradient>
          <linearGradient id="sp-pulse" x1="4" y1="24" x2="44" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" stopOpacity="0.7" />
            <stop offset="50%" stopColor="white" />
            <stop offset="100%" stopColor="white" />
          </linearGradient>
        </defs>

        {/* Rounded square background */}
        <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#sp-bg)" />

        {/* Pulse line: flat → heartbeat → rising arrow */}
        <path
          d="M8 28 L14 28 L17 34 L21 16 L25 30 L28 24 L32 24 L36 18 L40 12"
          stroke="url(#sp-pulse)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Arrow head at the end of the trend line */}
        <path
          d="M36 12 L40 12 L40 16"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Subtle dot at the peak */}
        <circle cx="40" cy="12" r="2" fill="white" opacity="0.9" />
      </svg>

      {showText && (
        <div className={cn('flex flex-col', textClassName)}>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            SalesPulse
          </span>
          <span className="text-[10px] text-muted-foreground">AAA WCNY</span>
        </div>
      )}
    </div>
  )
}
