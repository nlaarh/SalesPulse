import type { ReactNode } from 'react'
import { GROWTH_COLORS } from './tokens'

interface SectionHeaderProps {
  page: string  // e.g. "PAGE 01"
  title: string
  subtitle: string
  rightSlot?: ReactNode  // typically the Download button
}

export default function SectionHeader({ page, title, subtitle, rightSlot }: SectionHeaderProps) {
  return (
    <div className="mb-5">
      <p
        className="text-[10px] font-semibold tracking-[0.22em] uppercase"
        style={{ color: GROWTH_COLORS.teal }}
      >
        {page}
      </p>
      <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2
            className="text-xl md:text-2xl font-bold tracking-tight"
            style={{ color: GROWTH_COLORS.navy }}
          >
            {title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: GROWTH_COLORS.inkSoft }}>
            {subtitle}
          </p>
        </div>
        {rightSlot}
      </div>
      <div
        className="mt-4 h-[2px] w-full"
        style={{
          background: `linear-gradient(to right, ${GROWTH_COLORS.navy} 0, ${GROWTH_COLORS.navy} 30%, ${GROWTH_COLORS.rule} 30%, ${GROWTH_COLORS.rule} 100%)`,
        }}
      />
    </div>
  )
}
