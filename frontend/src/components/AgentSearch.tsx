import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function AgentSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [advisors, setAdvisors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleFocus = async () => {
    setOpen(true)
    if (advisors.length > 0) return
    setLoading(true)
    try {
      const { data } = await api.get('/api/sales/advisors/search-list?line=All')
      const names = data.advisors || []
      setAdvisors(names)
    } catch (err) {
      console.error('Failed to fetch advisors for search', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = query.trim()
    ? advisors.filter(name => name.toLowerCase().includes(query.toLowerCase()))
    : advisors.slice(0, 10)

  const handleSelect = (name: string) => {
    setQuery('')
    setOpen(false)
    navigate(`/agent/${encodeURIComponent(name)}`)
  }

  return (
    <div ref={containerRef} className="relative w-[180px] sm:w-[220px]">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={handleFocus}
          placeholder="Search advisor..."
          className={cn(
            'w-full rounded-lg border border-border bg-secondary/40 py-1.5 pl-8 pr-3',
            'text-[12px] font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/50',
            'focus:border-primary/45 focus:ring-1 focus:ring-primary/20',
          )}
        />
      </div>

      {open && (
        <div className="absolute right-0 mt-1 z-30 w-[240px] rounded-lg border border-border bg-popover/95 p-1 shadow-lg backdrop-blur-sm max-h-[240px] overflow-y-auto">
          {loading ? (
            <div className="p-3 text-center text-[11px] text-muted-foreground">Loading advisors...</div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-muted-foreground">No advisors found</div>
          ) : (
            filtered.map(name => (
              <button
                key={name}
                onClick={() => handleSelect(name)}
                className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] font-medium text-foreground hover:bg-primary/10 transition-colors"
              >
                <User className="h-3 w-3 text-muted-foreground/60" />
                <span className="truncate">{name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
