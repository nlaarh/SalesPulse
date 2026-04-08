import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DropdownProps {
  label: string
  value: string
  options: { key: string; label: string }[]
  onSelect: (key: string) => void
}

export default function Dropdown({ label, value, options, onSelect }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="space-y-1.5">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </span>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between rounded-lg',
          'bg-secondary/60 px-3 py-2 text-[13px] font-medium text-foreground',
          'border border-border transition-all duration-200',
          'hover:bg-secondary/80 hover:border-primary/20',
          open && 'border-primary/30 bg-secondary/80',
        )}
      >
        {value}
        <ChevronDown className={cn(
          'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180',
        )} />
      </button>
      {open && (
        <div className="animate-enter rounded-lg border border-border bg-card p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => { onSelect(o.key); setOpen(false) }}
              className={cn(
                'flex w-full cursor-pointer items-center rounded-md px-3 py-1.5',
                'text-[13px] transition-colors duration-150',
                o.label === value
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
