import { type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Renders narrative text with **bold** markers converted to styled <strong> elements.
 * Splits paragraphs by double newline. Used by all Executive Summary tabs.
 * Pass aiGenerated=true to show the "AI Generated" badge.
 */
export default function RichNarrative({ text, aiGenerated }: { text: string; aiGenerated?: boolean }) {
  if (!text) return null
  return (
    <div className="space-y-3">
      {aiGenerated && (
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
            bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Sparkles className="w-3 h-3" />
            AI Generated
          </span>
        </div>
      )}
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
