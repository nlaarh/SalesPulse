import { type ReactNode } from 'react'

/**
 * Renders narrative text with **bold** markers converted to styled <strong> elements.
 * Splits paragraphs by double newline. Used by all Executive Summary tabs.
 */
export default function RichNarrative({ text }: { text: string }) {
  if (!text) return null
  return (
    <div className="space-y-3">
      {text.split('\n\n').map((para, i) => (
        <p key={i} className="text-[13px] leading-7 text-foreground/85">
          {renderSegments(para)}
        </p>
      ))}
    </div>
  )
}

function renderSegments(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-bold text-white">{part}</strong>
      : part
  )
}
