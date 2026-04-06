import { Sparkles } from 'lucide-react'
import Markdown from '@/components/Markdown'

/**
 * Renders AI-generated narrative text as full rich markdown.
 * Pass aiGenerated=true to show the "AI Generated" badge.
 */
export default function RichNarrative({ text, aiGenerated }: { text: string; aiGenerated?: boolean }) {
  if (!text) return null
  return (
    <div>
      {aiGenerated && (
        <div className="mb-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-400">
            <Sparkles className="h-3 w-3" />
            AI Generated
          </span>
        </div>
      )}
      <Markdown>{text}</Markdown>
    </div>
  )
}

