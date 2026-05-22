import { GROWTH_COLORS } from './tokens'

interface IntroBlockProps {
  shows: string
  read: string
}

// "What this shows / How to read it" intro block, lifted from the PDF.
// Sits above each chart so the reader knows what to look at.
export default function IntroBlock({ shows, read }: IntroBlockProps) {
  return (
    <div
      className="rounded-lg px-5 py-4 border-l-4 mb-4 text-[13px] leading-relaxed"
      style={{ borderColor: GROWTH_COLORS.teal, backgroundColor: '#F1F5F9', color: GROWTH_COLORS.ink }}
    >
      <p className="mb-1.5">
        <span className="font-bold">What this shows: </span>
        {shows}
      </p>
      <p>
        <span className="font-bold">How to read it: </span>
        {read}
      </p>
    </div>
  )
}
