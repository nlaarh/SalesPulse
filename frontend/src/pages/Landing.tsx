import { HeroSection } from '../components/landing/HeroSection'
import { DataIntelSection } from '../components/landing/DataIntelSection'
import { PipelineSection } from '../components/landing/PipelineSection'
import { CTAFooter } from '../components/landing/CTAFooter'

/**
 * Public marketing landing page. Showcases SalesPulse capabilities
 * with animated sections. Login is on a separate /login route.
 *
 * 4 sections: Hero → Data Intelligence → AI Pipeline → CTA
 */
export default function Landing() {
  return (
    <div style={{ overflowX: 'hidden' }}>
      <style>{`
        /* Hero text stagger fade-in */
        .hero-fade {
          opacity: 0;
          transform: translateY(20px);
          animation: heroFadeIn 0.8s ease forwards;
        }
        .hero-fade-1 { animation-delay: 0.3s; }
        .hero-fade-2 { animation-delay: 0.7s; }
        .hero-fade-3 { animation-delay: 1.1s; }

        @keyframes heroFadeIn {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Scroll indicator bounce */
        .scroll-bounce {
          animation: scrollBounce 2s ease-in-out infinite;
        }
        @keyframes scrollBounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(8px); }
        }

        /* Intel card hover */
        .intel-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.08);
          border-color: rgba(59,130,246,0.3);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .landing-grid-2x2 {
            grid-template-columns: 1fr !important;
          }
          .landing-cols-3 {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .timeline-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .timeline-grid > div {
            flex-direction: row !important;
            text-align: left !important;
          }
          .timeline-line-h { display: none !important; }
          .timeline-line-v { display: block !important; }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .hero-fade, .scroll-bounce {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <HeroSection />
      <DataIntelSection />
      <PipelineSection />
      <CTAFooter />
    </div>
  )
}
