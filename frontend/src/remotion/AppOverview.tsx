/**
 * Composition 1: App Overview (~10s at 30fps = 300 frames)
 * Shows what SalesInsight is, its modules, and key capabilities.
 */
import { AbsoluteFill, Sequence } from 'remotion'
import { getColors } from './theme'
import { SlideUp, GlowCard, FadeIn } from './common'

export type AppOverviewProps = { isDark: boolean }

const MODULES = [
  { icon: '📊', label: 'Sales Dashboard', desc: 'Revenue, leads & team ranking' },
  { icon: '📅', label: 'Monthly Report', desc: 'Agent × month breakdown' },
  { icon: '🎯', label: 'Top Opportunities', desc: 'AI-scored deal ranking' },
  { icon: '🔀', label: 'Pipeline', desc: 'Forecasting & velocity' },
  { icon: '✈️', label: 'Destinations', desc: 'Travel analytics' },
  { icon: '📣', label: 'Lead Funnel', desc: 'Conversion & sources' },
]

const CAPABILITIES = [
  'Real-time Salesforce data sync',
  'AI-powered performance insights',
  'Travel + Insurance divisions',
  'Commission & booking analytics',
]

/* ── SVG Icons (inline to avoid lucide dependency inside Remotion) ────── */

function ActivityIcon({ color, size = 32 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  )
}

function CheckIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/* ── Module Card ──────────────────────────────────────────────────────── */

function ModuleCard({
  mod,
  index,
  colors,
}: {
  mod: typeof MODULES[number]
  index: number
  colors: ReturnType<typeof getColors>
}) {
  return (
    <SlideUp delay={index * 8}>
      <GlowCard colors={colors} style={{ width: 240, minHeight: 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `${colors.primary}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            {mod.icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: 'Inter, sans-serif' }}>
              {mod.label}
            </div>
            <div style={{ fontSize: 11, color: colors.muted, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {mod.desc}
            </div>
          </div>
        </div>
      </GlowCard>
    </SlideUp>
  )
}

/* ── Main Composition ─────────────────────────────────────────────────── */

export function AppOverview({ isDark }: AppOverviewProps) {
  const colors = getColors(isDark)

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: 'Inter, sans-serif',
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {/* Logo + Title */}
      <Sequence from={0} durationInFrames={300}>
        <FadeIn delay={0} duration={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: `${colors.primary}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ActivityIcon color={colors.primary} size={24} />
            </div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, color: colors.text, letterSpacing: -1 }}>
                SalesInsight
              </div>
            </div>
          </div>
        </FadeIn>
      </Sequence>

      {/* Tagline */}
      <Sequence from={15} durationInFrames={285} layout="none">
        <FadeIn delay={0} duration={20}>
          <div style={{ fontSize: 15, color: colors.muted, marginBottom: 32, lineHeight: 1.5 }}>
            Salesforce-powered sales analytics for AAA WCNY.
            <br />
            Built for VPs and managers who need answers fast.
          </div>
        </FadeIn>
      </Sequence>

      {/* Module Grid */}
      <Sequence from={45} durationInFrames={255} layout="none">
        <div style={{ marginBottom: 8 }}>
          <FadeIn delay={0} duration={15}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.muted, marginBottom: 14 }}>
              Modules
            </div>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {MODULES.map((mod, i) => (
              <ModuleCard key={mod.label} mod={mod} index={i} colors={colors} />
            ))}
          </div>
        </div>
      </Sequence>

      {/* Capabilities */}
      <Sequence from={120} durationInFrames={180} layout="none">
        <div style={{ marginTop: 24 }}>
          <FadeIn delay={0} duration={15}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.muted, marginBottom: 12 }}>
              Key Capabilities
            </div>
          </FadeIn>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {CAPABILITIES.map((cap, i) => (
              <SlideUp key={cap} delay={i * 10}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: `${colors.success}12`,
                    border: `1px solid ${colors.success}30`,
                    borderRadius: 8,
                    padding: '8px 14px',
                  }}
                >
                  <CheckIcon color={colors.success} />
                  <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>{cap}</span>
                </div>
              </SlideUp>
            ))}
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
