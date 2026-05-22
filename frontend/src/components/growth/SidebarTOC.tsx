import { useEffect, useState } from 'react'
import { GROWTH_COLORS } from './tokens'

export interface TocItem {
  id: string
  label: string
  group?: string
}

interface SidebarTOCProps {
  items: TocItem[]
}

export default function SidebarTOC({ items }: SidebarTOCProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')

  // Scroll-spy: pick the section closest to the top of the viewport
  useEffect(() => {
    const handler = () => {
      let bestId = items[0]?.id ?? ''
      let bestTop = Number.NEGATIVE_INFINITY
      for (const it of items) {
        const el = document.getElementById(it.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        // Section is "active" when its top is at or just above the threshold
        if (top <= 140 && top > bestTop) {
          bestTop = top
          bestId = it.id
        }
      }
      setActiveId(bestId)
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [items])

  // Group items
  const grouped = items.reduce<Record<string, TocItem[]>>((acc, it) => {
    const g = it.group ?? ''
    acc[g] = acc[g] || []
    acc[g].push(it)
    return acc
  }, {})

  return (
    <nav
      className="sticky top-6 self-start hidden lg:block rounded-xl border bg-white p-4 max-h-[calc(100vh-3rem)] overflow-y-auto"
      style={{ borderColor: GROWTH_COLORS.rule }}
      aria-label="Section navigation"
    >
      <p
        className="text-[10px] font-semibold tracking-[0.22em] uppercase mb-3"
        style={{ color: GROWTH_COLORS.teal }}
      >
        Contents
      </p>
      <ul className="space-y-3 text-[12.5px]">
        {Object.entries(grouped).map(([group, list]) => (
          <li key={group || 'root'}>
            {group && (
              <p
                className="text-[10px] font-semibold tracking-wider uppercase mb-1.5"
                style={{ color: GROWTH_COLORS.inkSoft }}
              >
                {group}
              </p>
            )}
            <ul className="space-y-1">
              {list.map((it) => {
                const active = it.id === activeId
                return (
                  <li key={it.id}>
                    <a
                      href={`#${it.id}`}
                      className="block px-2 py-1 rounded transition-colors hover:bg-gray-50"
                      style={{
                        color: active ? GROWTH_COLORS.navy : GROWTH_COLORS.inkSoft,
                        fontWeight: active ? 600 : 400,
                        borderLeft: active ? `2px solid ${GROWTH_COLORS.teal}` : '2px solid transparent',
                        paddingLeft: 10,
                      }}
                    >
                      {it.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
