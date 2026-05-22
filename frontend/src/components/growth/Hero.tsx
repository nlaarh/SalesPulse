import { motion } from 'framer-motion'
import { GROWTH_COLORS } from './tokens'

interface KpiTile {
  label: string
  value: string
  sub: string
}

interface HeroProps {
  eyebrow: string
  title: string
  subtitle: string
  description: string
  tiles: KpiTile[]
}

export default function Hero({ eyebrow, title, subtitle, description, tiles }: HeroProps) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl text-white"
      style={{ backgroundColor: GROWTH_COLORS.navy }}
    >
      {/* Diagonal stripes accent in the top-right (matches PDF cover) */}
      <div
        aria-hidden
        className="absolute right-0 top-0 w-72 h-72 opacity-90"
        style={{
          background: `repeating-linear-gradient(45deg, ${GROWTH_COLORS.navy} 0 10px, ${GROWTH_COLORS.red} 10px 14px)`,
          clipPath: 'polygon(40% 0, 100% 0, 100% 60%, 0 0)',
        }}
      />
      {/* Soft teal corner glow bottom-left */}
      <div
        aria-hidden
        className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full opacity-40"
        style={{
          background: `radial-gradient(circle, ${GROWTH_COLORS.tealLight} 0%, transparent 70%)`,
        }}
      />

      <div className="relative px-10 pt-12 pb-10 md:px-16 md:pt-16 md:pb-14">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[10px] font-semibold tracking-[0.18em] text-white/80 uppercase">
            {eyebrow}
          </p>
          <div
            className="mt-3 mb-7 h-[3px] w-12"
            style={{ backgroundColor: GROWTH_COLORS.red }}
          />
          <h1 className="text-4xl md:text-5xl font-bold leading-[0.95] tracking-tight">
            {title}
          </h1>
          <h2 className="mt-6 text-base md:text-lg font-semibold leading-snug max-w-3xl">
            {subtitle}
          </h2>
          <p className="mt-2 text-xs md:text-sm text-white/75 max-w-3xl">
            {description}
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {tiles.map((t, i) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
              className="border-l-2 pl-4 py-2"
              style={{ borderColor: GROWTH_COLORS.red }}
            >
              <p className="text-[10px] font-semibold tracking-[0.18em] text-white/70 uppercase">
                {t.label}
              </p>
              <p className="mt-1.5 text-xl md:text-2xl font-bold tracking-tight text-white">
                {t.value}
              </p>
              <p className="mt-1 text-[11px] text-white/70 leading-snug">{t.sub}</p>
            </motion.div>
          ))}
        </div>

        <div
          className="mt-12 pt-5 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] tracking-[0.14em] uppercase"
          style={{ borderColor: 'rgba(255,255,255,0.18)' }}
        >
          <span style={{ color: GROWTH_COLORS.red, fontWeight: 600 }}>
            Confidential — Not for Distribution
          </span>
          <span className="text-white/65">
            AAA WCNY Strategic Market Intelligence · For Officers and Directors Only
          </span>
        </div>
      </div>
    </section>
  )
}
