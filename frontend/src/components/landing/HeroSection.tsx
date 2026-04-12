import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router-dom'

const HeroGlobe = lazy(() => import('./HeroGlobe'))

export function HeroSection() {
  const navigate = useNavigate()

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: 'linear-gradient(135deg, #0a1628 0%, #162240 50%, #0f1d35 100%)',
        overflow: 'hidden',
        paddingTop: 'clamp(50px, 8vh, 80px)',
      }}
    >
      {/* 3D Globe with image inside */}
      <Suspense fallback={null}>
        <HeroGlobe />
      </Suspense>

      {/* Content — single flow block over the globe */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          maxWidth: 800,
          padding: '0 24px',
        }}
      >
        <h1
          className="hero-fade hero-fade-1"
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            margin: 0,
            textShadow: '0 2px 30px rgba(0,0,0,0.7)',
          }}
        >
          See Every Opportunity.
          <br />
          From Every Angle.
        </h1>

        <p
          className="hero-fade hero-fade-2"
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.25rem)',
            color: 'rgba(255,255,255,0.85)',
            marginTop: 'clamp(280px, 38vh, 360px)',
            lineHeight: 1.6,
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto',
            textShadow: '0 2px 20px rgba(0,0,0,0.8)',
            background: 'rgba(10,22,40,0.25)',
            padding: '12px 24px',
            borderRadius: 12,
            backdropFilter: 'blur(4px)',
          }}
        >
          SalesPulse combines CRM pipeline data, US Census demographics,
          and real-time market intelligence into one platform.
        </p>

        <div
          className="hero-fade hero-fade-3"
          style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24 }}
        >
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '14px 36px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: '#fff',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 0 30px rgba(59,130,246,0.3)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 0 40px rgba(59,130,246,0.5)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 0 30px rgba(59,130,246,0.3)'
            }}
          >
            Sign In
          </button>
          <button
            onClick={scrollToFeatures}
            style={{
              padding: '14px 36px',
              fontSize: '1.05rem',
              fontWeight: 600,
              color: '#fff',
              background: 'transparent',
              border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            Explore Features
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="scroll-bounce"
        style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
          <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
        </svg>
      </div>
    </section>
  )
}
