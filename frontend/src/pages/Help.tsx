import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Activity, GitBranch, BookOpen, BarChart3, Shield, DollarSign } from 'lucide-react'
import OverviewSection from './help/OverviewSection'
import ModulesSection from './help/ModulesSection'
import LifecycleSection from './help/LifecycleSection'
import PipelineSection from './help/PipelineSection'
import MetricsSection from './help/MetricsSection'
import GlossarySection from './help/GlossarySection'

/* ── Section Definitions ─────────────────────────────────────────────── */

const SECTIONS = [
  { id: 'overview', title: 'Application Overview', icon: Activity },
  { id: 'modules', title: 'Modules & Pages', icon: BarChart3 },
  { id: 'lifecycle', title: 'Sales Lifecycle', icon: GitBranch },
  { id: 'pipeline', title: 'Pipeline & Coverage', icon: Shield },
  { id: 'metrics', title: 'Revenue & Commission', icon: DollarSign },
  { id: 'glossary', title: 'Terms & Definitions', icon: BookOpen },
] as const

const SECTION_COMPONENTS: Record<string, React.FC> = {
  overview: OverviewSection,
  modules: ModulesSection,
  lifecycle: LifecycleSection,
  pipeline: PipelineSection,
  metrics: MetricsSection,
  glossary: GlossarySection,
}

/* ── Index Sidebar ───────────────────────────────────────────────────── */

function IndexSidebar({ activeSection }: { activeSection: string }) {
  return (
    <nav className="sticky top-6 space-y-1">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
        Contents
      </p>
      {SECTIONS.map((s) => {
        const Icon = s.icon
        const isActive = activeSection === s.id
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-200',
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
            )}
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground/50')} />
            {s.title}
          </a>
        )
      })}
    </nav>
  )
}

/* ── Main Help Page ──────────────────────────────────────────────────── */

export default function Help() {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    )

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Help & Guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn how SalesInsight works, understand the sales lifecycle, and explore key terminology.
        </p>
      </div>

      {/* Two-column layout: index + content */}
      <div className="grid grid-cols-[200px_1fr] gap-6">
        {/* Left: Sticky Index */}
        <IndexSidebar activeSection={activeSection} />

        {/* Right: Content Sections */}
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const Content = SECTION_COMPONENTS[section.id]
            const Icon = section.icon
            return (
              <section key={section.id} id={section.id} className="scroll-mt-8">
                <div className="card-premium overflow-hidden p-0">
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-[15px] font-semibold text-foreground">{section.title}</h2>
                  </div>
                  <Content />
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
