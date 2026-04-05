/**
 * Composition 3: Glossary (~20s at 30fps = 600 frames)
 * Animated term cards explaining sales terminology.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from 'remotion'
import { getColors } from './theme'
import { SectionTitle, GlowCard } from './common'

export type GlossaryProps = { isDark: boolean }

type Term = {
  term: string
  definition: string
  iconPath: string
  color: 'primary' | 'success' | 'warning' | 'error' | 'chart3' | 'chart5'
}

const TERMS: Term[] = [
  {
    term: 'Lead',
    definition: 'A potential customer or prospect who has shown interest. The starting point of the sales funnel.',
    iconPath: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M22 10l-4 4 M18 10l4 4',
    color: 'chart3',
  },
  {
    term: 'Opportunity',
    definition: 'A qualified sales deal with an estimated value and close date. Created when a lead is converted.',
    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    color: 'primary',
  },
  {
    term: 'Closed Won',
    definition: 'A deal that has been successfully booked. The Amount field records the total booking value.',
    iconPath: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
    color: 'success',
  },
  {
    term: 'Invoice',
    definition: 'Services delivered and billed. Commission is earned at this stage, typically 2-3 months after booking.',
    iconPath: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z M16 8H8 M16 12H8 M12 16H8',
    color: 'success',
  },
  {
    term: 'Amount (Bookings)',
    definition: 'Total booking value of a deal. Travel = gross bookings; Insurance = premium amount.',
    iconPath: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    color: 'primary',
  },
  {
    term: 'Commission',
    definition: 'Earned commission on delivered deals (Earned_Commission_Amount__c). Lags booking by 2-3 months.',
    iconPath: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 8v8 M8 12h8',
    color: 'warning',
  },
  {
    term: 'Win Rate',
    definition: 'Won deals divided by (Won + Lost). Measures conversion efficiency. Open deals are excluded.',
    iconPath: 'M6 9H4.5a2.5 2.5 0 0 1 0-5C5.71 4 7 5.18 7 6.75V11a3 3 0 0 0 6 0V4',
    color: 'success',
  },
  {
    term: 'Pipeline',
    definition: 'Total value of open opportunities closing within the next 12 months. The fuel for future revenue.',
    iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2',
    color: 'primary',
  },
  {
    term: 'Pipeline Coverage',
    definition: 'Open pipeline divided by annualized bookings. Healthy = 2x+, Moderate = 1-2x, Low = below 1x.',
    iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    color: 'chart5',
  },
  {
    term: 'Close Rate',
    definition: 'Won divided by total closed (Won + Lost) per month. Shows conversion efficiency over time.',
    iconPath: 'M3 3v18h18 M18.7 8l-5.1 5.2-2.8-2.7L7 14.3',
    color: 'chart3',
  },
  {
    term: 'At-Risk Deal',
    definition: 'An open deal past its expected close date. Needs immediate follow-up to avoid becoming lost.',
    iconPath: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
    color: 'error',
  },
  {
    term: 'Pushed Deal',
    definition: 'A deal whose close date was moved forward 2+ times. May indicate qualification or urgency issues.',
    iconPath: 'M5 12h14 M12 5l7 7-7 7',
    color: 'warning',
  },
  {
    term: 'Stale Deal',
    definition: 'Open deal with no activity (calls, emails, tasks) in the last 30 days. Needs re-engagement.',
    iconPath: 'M12 2a10 10 0 1 0 10 10H12V2z',
    color: 'warning',
  },
  {
    term: 'Conversion Rate',
    definition: 'Leads converted into opportunities divided by total leads. Measures top-of-funnel efficiency.',
    iconPath: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
    color: 'chart3',
  },
  {
    term: 'Days to Convert',
    definition: 'Average days from lead creation to opportunity creation. Shorter = more efficient qualification.',
    iconPath: 'M12 2a10 10 0 1 0 10 10 M12 6v6l4 2',
    color: 'chart5',
  },
]

/* ── SVG Icon ─────────────────────────────────────────────────────────── */

function TermIcon({ path, color, size = 18 }: { path: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

/* ── Term Card ─────────────────────────────────────────────────────────── */

function TermCard({
  term,
  delay,
  colors,
}: {
  term: Term
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

  const translateY = interpolate(progress, [0, 1], [20, 0])
  const opacity = interpolate(progress, [0, 1], [0, 1])
  const termColor = colors[term.color]

  return (
    <div style={{ transform: `translateY(${translateY}px)`, opacity }}>
      <GlowCard colors={colors} style={{ height: '100%' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: `${termColor}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            <TermIcon path={term.iconPath} color={termColor} />
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: colors.text,
                fontFamily: 'Inter, sans-serif',
                marginBottom: 4,
              }}
            >
              {term.term}
            </div>
            <div
              style={{
                fontSize: 11,
                color: colors.muted,
                fontFamily: 'Inter, sans-serif',
                lineHeight: 1.5,
              }}
            >
              {term.definition}
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  )
}

/* ── Main Composition ─────────────────────────────────────────────────── */

export function Glossary({ isDark }: GlossaryProps) {
  const colors = getColors(isDark)

  const CARDS_PER_ROW = 3
  const DELAY_PER_ROW = 50
  const DELAY_PER_CARD_IN_ROW = 8

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: 'Inter, sans-serif',
        padding: '32px 36px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Title */}
      <Sequence from={0} durationInFrames={600}>
        <SectionTitle text="Terminology & Definitions" colors={colors} delay={0} />
      </Sequence>

      <Sequence from={10} durationInFrames={590} layout="none">
        <div style={{ fontSize: 13, color: colors.muted, marginTop: 8, marginBottom: 20 }}>
          Key terms used throughout SalesInsight and Salesforce.
        </div>
      </Sequence>

      {/* Term Grid */}
      <Sequence from={25} durationInFrames={575} layout="none">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            flex: 1,
            alignContent: 'start',
          }}
        >
          {TERMS.map((term, i) => {
            const row = Math.floor(i / CARDS_PER_ROW)
            const col = i % CARDS_PER_ROW
            const delay = 25 + row * DELAY_PER_ROW + col * DELAY_PER_CARD_IN_ROW

            return (
              <TermCard key={term.term} term={term} delay={delay} colors={colors} />
            )
          })}
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}
