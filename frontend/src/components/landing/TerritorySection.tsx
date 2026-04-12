import { ScrollReveal } from './ScrollReveal'

const dots = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  size: 8 + Math.random() * 28,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  color: Math.random() > 0.5 ? '#3b82f6' : '#06b6d4',
  delay: Math.random() * 2,
}))

export function TerritorySection() {
  return (
    <section
      id="territory"
      style={{
        padding: 'clamp(60px, 10vw, 120px) clamp(24px, 5vw, 80px)',
        background: '#ffffff',
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
        className="landing-grid"
      >
        {/* Text */}
        <div>
          <ScrollReveal delay={0} direction="left">
            <span style={labelStyle}>TERRITORY INTELLIGENCE</span>
          </ScrollReveal>
          <ScrollReveal delay={100} direction="left">
            <h2 style={headlineStyle}>
              Zip-Code Precision.
              <br />
              County-Level Clarity.
            </h2>
          </ScrollReveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 32 }}>
            {[
              { icon: '🗺', text: 'Interactive penetration heatmaps' },
              { icon: '📍', text: 'County boundary overlays' },
              { icon: '🔀', text: 'Insurance + Travel layer toggles' },
            ].map((item, i) => (
              <ScrollReveal key={i} delay={200 + i * 150} direction="left">
                <div style={pillStyle}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ color: '#1e293b', fontWeight: 500, fontSize: '1.05rem' }}>{item.text}</span>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={700} direction="up">
            <div style={statCardStyle}>
              <span style={statNumberStyle}>1,107</span>
              <span style={statLabelStyle}>zip codes tracked</span>
            </div>
          </ScrollReveal>
        </div>

        {/* Heatmap visual */}
        <ScrollReveal delay={200} direction="right">
          <div style={mapCardStyle}>
            {/* Grid lines */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Data dots */}
            {dots.map(d => (
              <div
                key={d.id}
                className="heatmap-dot"
                style={{
                  position: 'absolute',
                  width: d.size,
                  height: d.size,
                  left: `${d.x}%`,
                  top: `${d.y}%`,
                  borderRadius: '50%',
                  background: d.color,
                  opacity: 0.6,
                  animationDelay: `${d.delay}s`,
                  boxShadow: `0 0 ${d.size}px ${d.color}40`,
                }}
              />
            ))}
          </div>
        </ScrollReveal>
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

const pillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 18px',
  borderRadius: 12,
  background: '#f1f5f9',
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

const mapCardStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1',
  maxWidth: 480,
  marginLeft: 'auto',
  borderRadius: 24,
  background: '#0f1729',
  overflow: 'hidden',
  boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
}
