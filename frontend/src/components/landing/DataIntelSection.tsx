import { ScrollReveal } from './ScrollReveal'

const capabilities = [
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round">
        <polygon points="1 6 12 2 23 6 23 18 12 22 1 18" />
        <line x1="12" y1="22" x2="12" y2="10" />
        <polyline points="23 6 12 10 1 6" />
      </svg>
    ),
    title: 'Territory Maps',
    desc: 'Zip-code heatmaps with county boundaries and Insurance/Travel layer toggles',
    stat: '1,107 zip codes',
  },
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Census Demographics',
    desc: 'Population, income, education, and housing data by zip code and county',
    stat: '26 counties',
  },
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    title: 'Market Pulse',
    desc: 'Travel advisories, Medicare enrollment windows, and seasonal outreach triggers',
    stat: 'Real-time',
  },
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
    title: 'Cross-Sell Engine',
    desc: 'Travel→Insurance gap detection with priority scoring and advisor assignment',
    stat: 'AI-powered',
  },
]

export function DataIntelSection() {
  return (
    <section
      id="features"
      style={{
        padding: 'clamp(60px, 10vw, 120px) clamp(24px, 5vw, 80px)',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <ScrollReveal>
            <span style={labelStyle}>DATA INTELLIGENCE</span>
            <h2 style={headlineStyle}>
              Four Data Sources. One Clear Picture.
            </h2>
            <p style={subStyle}>
              CRM pipeline, US Census demographics, market intelligence, and geolocation
              — unified in a single platform.
            </p>
          </ScrollReveal>
        </div>

        {/* 2x2 grid of capability cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 24,
          }}
          className="landing-grid-2x2"
        >
          {capabilities.map((cap, i) => (
            <ScrollReveal key={i} delay={i * 120} direction={i % 2 === 0 ? 'left' : 'right'}>
              <div style={cardStyle} className="intel-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={iconWrapStyle}>{cap.icon}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={cardTitleStyle}>{cap.title}</h3>
                    <p style={cardDescStyle}>{cap.desc}</p>
                    <span style={badgeStyle}>{cap.stat}</span>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 700,
  letterSpacing: '0.15em',
  color: '#3b82f6',
  textTransform: 'uppercase',
  marginBottom: 12,
}

const headlineStyle: React.CSSProperties = {
  fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
  fontWeight: 700,
  color: '#0f172a',
  lineHeight: 1.2,
  margin: '0 0 16px',
}

const subStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  color: '#64748b',
  lineHeight: 1.6,
  maxWidth: 560,
  margin: '0 auto',
}

const cardStyle: React.CSSProperties = {
  padding: 28,
  borderRadius: 18,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  transition: 'transform 0.3s, box-shadow 0.3s, border-color 0.3s',
}

const iconWrapStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 52,
  height: 52,
  borderRadius: 14,
  background: '#0f172a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 600,
  color: '#0f172a',
  margin: '0 0 6px',
}

const cardDescStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: '#64748b',
  lineHeight: 1.5,
  margin: '0 0 12px',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#3b82f6',
  background: 'rgba(59,130,246,0.08)',
  padding: '4px 12px',
  borderRadius: 100,
  letterSpacing: '0.03em',
}
