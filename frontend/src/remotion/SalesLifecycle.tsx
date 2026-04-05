/**
 * Composition 2: Sales Lifecycle (~16s at 30fps = 480 frames)
 * Animated flowchart: Lead → Qualified → Opportunity → Proposal → Closed Won → Invoice
 * With a branching "Lost" path.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from 'remotion'
import { getColors } from './theme'
import { SectionTitle } from './common'

export type SalesLifecycleProps = { isDark: boolean }

type Stage = {
  label: string
  desc: string
  color: 'primary' | 'success' | 'warning' | 'error' | 'chart3' | 'chart5'
  iconPath: string
}

const STAGES: Stage[] = [
  {
    label: 'Lead Created',
    desc: 'New prospect enters the system',
    color: 'chart3',
    iconPath: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M22 10l-4 4 M18 10l4 4',
  },
  {
    label: 'Lead Qualified',
    desc: 'Sales team evaluates fit',
    color: 'chart3',
    iconPath: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  },
  {
    label: 'Opportunity Created',
    desc: 'Lead converts to a deal',
    color: 'primary',
    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  },
  {
    label: 'Proposal / Negotiation',
    desc: 'Deal terms being discussed',
    color: 'warning',
    iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  },
  {
    label: 'Closed Won',
    desc: 'Deal is booked — Amount recorded',
    color: 'success',
    iconPath: 'M6 9H4.5a2.5 2.5 0 0 1 0-5C5.71 4 7 5.18 7 6.75V11a3 3 0 0 0 6 0V4 M17 9l-3-3 3-3',
  },
  {
    label: 'Invoice',
    desc: 'Commission earned on delivery',
    color: 'success',
    iconPath: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M16 8H8 M16 12H8 M12 16H8',
  },
]

const LOST_STAGE: Stage = {
  label: 'Lost / Expired',
  desc: 'Deal did not close',
  color: 'error',
  iconPath: 'M18 6L6 18 M6 6l12 12',
}

/* ── SVG Icon ─────────────────────────────────────────────────────────── */

function StageIcon({ path, color, size = 20 }: { path: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

/* ── Arrow ─────────────────────────────────────────────────────────────── */

function Arrow({ progress, color, vertical = false }: { progress: number; color: string; vertical?: boolean }) {
  const length = interpolate(progress, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  if (vertical) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', height: 32, position: 'relative' }}>
        <div
          style={{
            width: 2,
            height: `${length * 100}%`,
            background: color,
            borderRadius: 1,
          }}
        />
        {length > 0.8 && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${color}`,
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: 50, position: 'relative' }}>
      <div
        style={{
          height: 2,
          width: `${length * 100}%`,
          background: color,
          borderRadius: 1,
        }}
      />
      {length > 0.8 && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: `6px solid ${color}`,
          }}
        />
      )}
    </div>
  )
}

/* ── Stage Node ────────────────────────────────────────────────────────── */

function StageNode({
  stage,
  delay,
  colors,
}: {
  stage: Stage
  delay: number
  colors: ReturnType<typeof getColors>
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  })

  const scale = interpolate(progress, [0, 1], [0.7, 1])
  const opacity = interpolate(progress, [0, 1], [0, 1])
  const stageColor = colors[stage.color]

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 120,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: `${stageColor}18`,
          border: `2px solid ${stageColor}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <StageIcon path={stage.iconPath} color={stageColor} />
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.text,
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.3,
        }}
      >
        {stage.label}
      </div>
      <div
        style={{
          fontSize: 10,
          color: colors.muted,
          textAlign: 'center',
          fontFamily: 'Inter, sans-serif',
          marginTop: 4,
          lineHeight: 1.4,
          maxWidth: 110,
        }}
      >
        {stage.desc}
      </div>
    </div>
  )
}

/* ── Main Composition ─────────────────────────────────────────────────── */

export function SalesLifecycle({ isDark }: SalesLifecycleProps) {
  const colors = getColors(isDark)
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const DELAY_PER_STAGE = 35

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: 'Inter, sans-serif',
        padding: '36px 40px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title */}
      <Sequence from={0} durationInFrames={480}>
        <SectionTitle text="The Sales Lifecycle" colors={colors} delay={0} />
      </Sequence>

      {/* Subtitle */}
      <Sequence from={10} durationInFrames={470} layout="none">
        <div style={{ opacity: interpolate(frame - 10, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 8, marginBottom: 28 }}>
            How a lead becomes revenue — from first contact to commission.
          </div>
        </div>
      </Sequence>

      {/* Main Flow — Top Row (stages 0-2) */}
      <Sequence from={30} durationInFrames={450} layout="none">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
          {STAGES.slice(0, 3).map((stage, i) => {
            const stageDelay = i * DELAY_PER_STAGE
            const arrowDelay = stageDelay + 15

            const arrowProgress = spring({
              frame: frame - 30 - arrowDelay,
              fps,
              config: { damping: 200 },
            })

            return (
              <div key={stage.label} style={{ display: 'flex', alignItems: 'center' }}>
                <StageNode stage={stage} delay={30 + stageDelay} colors={colors} />
                {i < 2 && <Arrow progress={arrowProgress} color={`${colors.primary}60`} />}
              </div>
            )
          })}
        </div>
      </Sequence>

      {/* Connecting vertical arrow from stage 2 to stage 3 */}
      <Sequence from={30 + 2 * DELAY_PER_STAGE + 15} durationInFrames={400} layout="none">
        <div style={{ display: 'flex', justifyContent: 'center', marginRight: -260 }}>
          {(() => {
            const arrowP = spring({
              frame: frame - (30 + 2 * DELAY_PER_STAGE + 15),
              fps,
              config: { damping: 200 },
            })
            return <Arrow progress={arrowP} color={`${colors.primary}60`} vertical />
          })()}
        </div>
      </Sequence>

      {/* Bottom Row (stages 3-5, reversed direction) */}
      <Sequence from={30 + 3 * DELAY_PER_STAGE} durationInFrames={380} layout="none">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, flexDirection: 'row-reverse' }}>
          {STAGES.slice(3).map((stage, i) => {
            const stageDelay = (3 + i) * DELAY_PER_STAGE
            const arrowDelay = stageDelay + 15

            const arrowProgress = spring({
              frame: frame - 30 - arrowDelay,
              fps,
              config: { damping: 200 },
            })

            return (
              <div key={stage.label} style={{ display: 'flex', alignItems: 'center', flexDirection: 'row-reverse' }}>
                <StageNode stage={stage} delay={30 + stageDelay} colors={colors} />
                {i < 2 && <Arrow progress={arrowProgress} color={`${colors.success}60`} />}
              </div>
            )
          })}
        </div>
      </Sequence>

      {/* Lost Branch */}
      <Sequence from={30 + 4 * DELAY_PER_STAGE + 20} durationInFrames={300} layout="none">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12 }}>
          {(() => {
            const branchDelay = 30 + 4 * DELAY_PER_STAGE + 20
            const arrowP = spring({
              frame: frame - branchDelay,
              fps,
              config: { damping: 200 },
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: interpolate(arrowP, [0, 1], [0, 1]) }}>
                  <div style={{ fontSize: 10, color: colors.error, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                    Can happen at any stage
                  </div>
                  <div style={{ width: 20, height: 2, background: `${colors.error}50`, borderRadius: 1 }} />
                </div>
                <div style={{ marginTop: 8 }}>
                  <StageNode stage={LOST_STAGE} delay={branchDelay + 10} colors={colors} />
                </div>
              </>
            )
          })()}
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
