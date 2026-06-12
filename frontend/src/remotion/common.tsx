/**
 * Shared Remotion animation primitives.
 * No CSS animations or Tailwind animation classes — all driven by useCurrentFrame().
 */
import type { ReactNode } from 'react'
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import type { ThemeColors } from './theme'

/* ── FadeIn ────────────────────────────────────────────────────────────── */

export function FadeIn({
  children,
  delay = 0,
  duration = 20,
}: {
  children: ReactNode
  delay?: number
  duration?: number
}) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [delay, delay + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return <div style={{ opacity }}>{children}</div>
}

/* ── SlideUp ───────────────────────────────────────────────────────────── */

export function SlideUp({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode
  delay?: number
  style?: React.CSSProperties
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  })

  const translateY = interpolate(progress, [0, 1], [30, 0])
  const opacity = interpolate(progress, [0, 1], [0, 1])

  return (
    <div style={{ transform: `translateY(${translateY}px)`, opacity, ...style }}>
      {children}
    </div>
  )
}

/* ── ScaleIn ───────────────────────────────────────────────────────────── */

export function ScaleIn({
  children,
  delay = 0,
}: {
  children: ReactNode
  delay?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 200 },
  })

  const scale = interpolate(progress, [0, 1], [0.8, 1])
  const opacity = interpolate(progress, [0, 1], [0, 1])

  return (
    <div style={{ transform: `scale(${scale})`, opacity }}>
      {children}
    </div>
  )
}

/* ── GlowCard ──────────────────────────────────────────────────────────── */

export function GlowCard({
  children,
  colors,
  style,
}: {
  children: ReactNode
  colors: ThemeColors
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: `0 0 20px ${colors.primary}08`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* ── SectionTitle ──────────────────────────────────────────────────────── */

export function SectionTitle({
  text,
  colors,
  delay = 0,
}: {
  text: string
  colors: ThemeColors
  delay?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  })

  const underlineWidth = interpolate(progress, [0, 1], [0, 100])
  const opacity = interpolate(progress, [0, 1], [0, 1])

  return (
    <div style={{ opacity }}>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: colors.text,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: -0.5,
        }}
      >
        {text}
      </div>
      <div
        style={{
          height: 3,
          width: `${underlineWidth}px`,
          background: `linear-gradient(90deg, ${colors.primary}, transparent)`,
          borderRadius: 2,
          marginTop: 6,
        }}
      />
    </div>
  )
}

/* ── ProgressBar ───────────────────────────────────────────────────────── */

export function ProgressBar({
  progress,
  color,
  bgColor,
}: {
  progress: number
  color: string
  bgColor: string
}) {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: bgColor,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, progress * 100))}%`,
          background: color,
          borderRadius: 3,
        }}
      />
    </div>
  )
}
