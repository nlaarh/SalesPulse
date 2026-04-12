import { ScrollReveal } from './ScrollReveal'

const cards = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Demographics',
    desc: 'Population & age breakdowns by zip',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: 'Median Income',
    desc: 'Household economics by zip',
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    title: 'Market Signals',
    desc: 'Advisories & enrollment windows',
  },
]

export function CensusMarketSection() {
  return (
    <section
      style={{
        padding: 'clamp(60px, 10vw, 120px) clamp(24px, 5vw, 80px)',
        background: '#f8f9fa',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 64,
          alignItems: 'center',
        }}
        className="landing-grid landing-grid-reverse"
      >
        {/* 3D tilt cards */}
        <ScrollReveal delay={100} direction="left">
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', perspective: 1000 }}>
            {cards.map((card, i) => (
              <div
                key={i}
                className="tilt-card"
                style={{
                  width: 160,
                  padding: '28px 18px',
                  borderRadius: 18,
                  background: '#0f1729',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 12,
                  transform: `rotateY(${(i - 1) * 6}deg)`,
                  transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                  boxShadow: '0 4px 30px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(6,182,212,0.1)',
                }}
              >
                {card.icon}
                <span style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>{card.title}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {card.desc}
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>

        {/* Text */}
        <div>
          <ScrollReveal delay={0} direction="right">
            <span style={labelStyle}>EXTERNAL INTELLIGENCE</span>
          </ScrollReveal>
          <ScrollReveal delay={100} direction="right">
            <h2 style={headlineStyle}>
              Data That Lives
              <br />
              Outside Your CRM.
            </h2>
          </ScrollReveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28 }}>
            {[
              'Census demographics by zip code & county',
              'Medicare enrollment windows & travel advisories',
              'Seasonal patterns that trigger proactive outreach',
            ].map((text, i) => (
              <ScrollReveal key={i} delay={200 + i * 150} direction="right">
                <p style={bodyStyle}>{text}</p>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={700} direction="up">
            <div style={statCardStyle}>
              <span style={statNumberStyle}>26</span>
              <span style={statLabelStyle}>counties of demographic coverage</span>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.15em',
  color: '#3b82f6',
  textTransform: 'uppercase',
}

const headlineStyle: React.CSSProperties = {
  fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
  fontWeight: 700,
  color: '#0f172a',
  lineHeight: 1.2,
  marginTop: 12,
}

const bodyStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  color: '#475569',
  lineHeight: 1.6,
  margin: 0,
  paddingLeft: 16,
  borderLeft: '3px solid #3b82f6',
}

const statCardStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  padding: '20px 28px',
  marginTop: 32,
  borderRadius: 16,
  background: 'rgba(59,130,246,0.06)',
  border: '1px solid rgba(59,130,246,0.15)',
}

const statNumberStyle: React.CSSProperties = {
  fontSize: '2.5rem',
  fontWeight: 800,
  color: '#3b82f6',
  lineHeight: 1,
}

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#64748b',
  marginTop: 4,
}
