import { ScrollReveal } from './ScrollReveal'
import { useScrollReveal } from './useScrollReveal'

const journey = [
  {
    emoji: '🔍',
    title: 'Discover',
    desc: 'AI scans your CRM and finds hidden opportunities',
    color: '#3b82f6',
  },
  {
    emoji: '🎯',
    title: 'Score & Prioritize',
    desc: 'Every deal ranked by close probability',
    color: '#8b5cf6',
  },
  {
    emoji: '🔀',
    title: 'Cross-Sell Match',
    desc: 'Travel↔Insurance gaps detected automatically',
    color: '#06b6d4',
  },
  {
    emoji: '📊',
    title: 'Insight Brief',
    desc: 'AI writes the narrative — not just numbers',
    color: '#f59e0b',
  },
  {
    emoji: '🤝',
    title: 'Close & Grow',
    desc: 'Advisors act faster with clear next steps',
    color: '#10b981',
  },
]

export function PipelineSection() {
  const { ref, visible } = useScrollReveal(0.15)

  return (
    <section
      ref={ref}
      style={{
        padding: 'clamp(60px, 10vw, 120px) clamp(24px, 5vw, 80px)',
        background: 'linear-gradient(135deg, #0a1628 0%, #162240 100%)',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={labelStyle}>HOW IT WORKS</span>
            <h2 style={headlineStyle}>
              From Raw Data to Closed Deals
            </h2>
            <p style={subStyle}>
              AI works behind the scenes so your advisors can focus on what matters — the customer.
            </p>
          </div>
        </ScrollReveal>

        {/* Timeline */}
        <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto' }}>
          {/* Vertical connector line */}
          <div
            className="timeline-line-v"
            style={{
              display: 'none', // shown on mobile via CSS
              position: 'absolute',
              left: 32,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'linear-gradient(to bottom, #3b82f6, #10b981)',
              opacity: visible ? 0.4 : 0,
              transition: 'opacity 1s ease',
            }}
          />

          {/* Horizontal connector line (desktop) */}
          <div
            className="timeline-line-h"
            style={{
              position: 'absolute',
              top: 48,
              left: '10%',
              right: '10%',
              height: 2,
              background: 'linear-gradient(to right, #3b82f6, #8b5cf6, #06b6d4, #f59e0b, #10b981)',
              opacity: visible ? 0.4 : 0,
              transition: 'opacity 1s ease 0.3s',
            }}
          />

          {/* Steps */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 12,
              position: 'relative',
              zIndex: 1,
            }}
            className="timeline-grid"
          >
            {journey.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(30px)',
                  transition: `opacity 0.6s ease ${0.3 + i * 0.15}s, transform 0.6s ease ${0.3 + i * 0.15}s`,
                }}
              >
                {/* Node circle with emoji */}
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: `${step.color}15`,
                    border: `2px solid ${step.color}50`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    marginBottom: 16,
                    boxShadow: visible ? `0 0 24px ${step.color}25` : 'none',
                    transition: `box-shadow 0.6s ease ${0.5 + i * 0.15}s`,
                  }}
                >
                  {step.emoji}
                </div>

                {/* Step number */}
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: step.color,
                    letterSpacing: '0.1em',
                    marginBottom: 6,
                  }}
                >
                  STEP {i + 1}
                </span>

                {/* Title */}
                <h3
                  style={{
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 600,
                    margin: '0 0 6px',
                    lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    margin: 0,
                    maxWidth: 160,
                  }}
                >
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom trust line */}
        <ScrollReveal delay={1200}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 32,
              marginTop: 56,
              flexWrap: 'wrap',
            }}
          >
            {[
              { emoji: '🛡️', text: 'Role-Based Access' },
              { emoji: '⚡', text: 'Real-Time Sync' },
              { emoji: '🔒', text: 'OAuth 2.0 Secured' },
              { emoji: '📋', text: 'Full Audit Trail' },
            ].map((item, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ fontSize: 16 }}>{item.emoji}</span>
                {item.text}
              </span>
            ))}
          </div>
        </ScrollReveal>
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
  color: '#ffffff',
  lineHeight: 1.2,
  margin: '0 0 16px',
}

const subStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  color: 'rgba(255,255,255,0.55)',
  lineHeight: 1.6,
  maxWidth: 500,
  margin: '0 auto',
}
