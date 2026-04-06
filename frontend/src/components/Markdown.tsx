/**
 * Markdown — renders AI-generated rich text consistently across the app.
 * Use this wherever AI produces text: briefings, analyses, bot comments, insights.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface Props {
  children: string
  className?: string
  /** Compact mode: tighter spacing, slightly smaller text. Default false. */
  compact?: boolean
}

export default function Markdown({ children, className, compact }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className={cn('mb-3 mt-5 text-[17px] font-bold text-foreground first:mt-0', compact && 'text-[15px]')}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className={cn('mb-2 mt-4 text-[15px] font-bold text-foreground first:mt-0', compact && 'text-[14px]')}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className={cn('mb-1.5 mt-3 text-[14px] font-semibold text-foreground first:mt-0', compact && 'text-[13px]')}>
            {children}
          </h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className={cn('mb-2 last:mb-0 leading-relaxed text-foreground', compact ? 'text-[13px]' : 'text-[14px]')}>
            {children}
          </p>
        ),
        // Bold / italic
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-foreground/90">{children}</em>
        ),
        // Unordered list
        ul: ({ children }) => (
          <ul className={cn('mb-2 space-y-1 pl-5 last:mb-0', compact ? 'text-[13px]' : 'text-[14px]')}>
            {children}
          </ul>
        ),
        li: ({ children }) => (
          <li className="list-disc leading-relaxed text-foreground marker:text-primary">
            {children}
          </li>
        ),
        // Ordered list
        ol: ({ children }) => (
          <ol className={cn('mb-2 space-y-1 pl-5 last:mb-0', compact ? 'text-[13px]' : 'text-[14px]')}>
            {children}
          </ol>
        ),
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-[3px] border-primary/40 pl-3 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        // Inline code
        code: ({ children }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
            {children}
          </code>
        ),
        // Horizontal rule
        hr: () => <hr className="my-3 border-border" />,
      }}
      className={className}
    >
      {children}
    </ReactMarkdown>
  )
}
