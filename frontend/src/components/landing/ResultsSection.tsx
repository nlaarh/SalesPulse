import { useScrollReveal } from './useScrollReveal'
import { useCountUp } from './useCountUp'
import { ScrollReveal } from './ScrollReveal'

const trustItems = [
  'CRM OAuth 2.0 Secured',
  'Role-Based Access',
  'Real-Time Data Sync',
  'Dual-Layer Cache',
  'AI Executive Briefs',
  'Full Audit Trail',
]

export function ResultsSection() {
  const { ref, visible } = useScrollReveal(0.3)

  const advisors = useCountUp(57, visible)
  const modules = useCountUp(18, visible)
  const sources = useCountUp(3, visible)

  return (
    <section
      ref={ref}
      style={{
        padding: 'clamp(60px, 10vw, 120px) clamp(24px, 5vw, 80px)',
        background: '#ffffff',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        {/* Counters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 32,
            marginBottom: 56,
          }}
          className="landing-cols-4"
        >
          <CounterCard number={advisors} label="Travel Advisors" />
          <CounterCard number={modules} label="Analytics Modules" />
          <CounterCard number={null} label="Query Response" specialValue="<1s" visible={visible} />
          <CounterCard number={sources} label="Data Sources Combined" />
        </div>

        {/* Trust strip */}
        <ScrollReveal delay={400}>
          <div style={{ overflow: 'hidden', padding: '20px 0' }}>
            <div className="trust-scroll" style={{ display: 'flex', gap: 24, whiteSpace: 'nowrap' }}>
              {/* Duplicate for seamless loop */}
              {[...trustItems, ...trustItems].map((item, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    borderRadius: 100,
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

function CounterCard({
  number,
  label,
  specialValue,
  visible,
}: {
  number: number | null
  label: string
  specialValue?: string
  visible?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
          fontWeight: 800,
          color: '#0f172a',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {specialValue ? (
          <span style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
            {specialValue}
          </span>
        ) : (
          number
        )}
      </span>
      <span style={{ fontSize: '0.95rem', color: '#64748b', fontWeight: 500 }}>{label}</span>
    </div>
  )
}
