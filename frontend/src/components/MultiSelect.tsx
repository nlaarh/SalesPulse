import { useState, useRef, useEffect, CSSProperties } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
}

export default function MultiSelect({ label, options, selected, onChange, placeholder = 'All' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [dropStyle, setDropStyle] = useState<CSSProperties>({})
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return
    function reposition() {
      if (!btnRef.current) return
      const r = btnRef.current.getBoundingClientRect()
      setDropStyle({ top: r.bottom + 4, left: r.left, minWidth: Math.max(r.width, 200) })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropStyle({ top: r.bottom + 4, left: r.left, minWidth: Math.max(r.width, 200) })
    }
    setOpen(o => !o)
  }

  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(v => v !== opt))
    else onChange([...selected, opt])
  }

  const displayLabel = selected.length === 0
    ? placeholder
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selected`

  return (
    <div className="space-y-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </span>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5',
          'text-[12px] font-medium text-foreground transition-colors',
          'hover:border-primary/40 hover:bg-secondary',
          open && 'border-primary/40 bg-secondary',
        )}
      >
        <span className={cn('flex-1 text-left', selected.length === 0 && 'text-muted-foreground')}>{displayLabel}</span>
        {selected.length > 0 && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange([]) }}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{ ...dropStyle, position: 'fixed', zIndex: 9999 }}
          className="rounded-lg border border-border bg-card shadow-xl"
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => toggle(opt)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] transition-colors',
                  'hover:bg-secondary',
                  selected.includes(opt) && 'font-medium text-primary',
                )}
              >
                <span className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  selected.includes(opt) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                )}>
                  {selected.includes(opt) && (
                    <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-current">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {opt}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
