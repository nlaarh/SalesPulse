import { useNavigate } from 'react-router-dom'
import { ScrollReveal } from './ScrollReveal'

export function CTAFooter() {
  const navigate = useNavigate()

  return (
    <section
      style={{
        position: 'relative',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a1628 0%, #162240 100%)',
        overflow: 'hidden',
        padding: 'clamp(60px, 10vw, 100px) 24px',
      }}
    >
      {/* Background glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          right: '-5%',
          top: '10%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <ScrollReveal delay={0}>
        <h2
          style={{
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: 36,
          }}
        >
          Ready to see what your
          <br />
          data really says?
        </h2>
      </ScrollReveal>

      <ScrollReveal delay={200}>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '16px 48px',
            fontSize: '1.15rem',
            fontWeight: 600,
            color: '#fff',
            background: '#3b82f6',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 0 40px rgba(59,130,246,0.3)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 0 60px rgba(59,130,246,0.5)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)'
            e.currentTarget.style.boxShadow = '0 0 40px rgba(59,130,246,0.3)'
          }}
        >
          Sign In →
        </button>
      </ScrollReveal>

      {/* Footer bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '20px clamp(24px, 5vw, 80px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span style={footerTextStyle}>AAA Western &amp; Central NY</span>
        <span style={{ ...footerTextStyle, fontWeight: 600, letterSpacing: '0.05em' }}>
          SalesPulse
        </span>
        <span style={footerTextStyle}>Built for sales leaders.</span>
      </div>
    </section>
  )
}

const footerTextStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'rgba(255,255,255,0.35)',
}
