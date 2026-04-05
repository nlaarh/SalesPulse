import { useState } from 'react'
import {
  Workflow, LayoutDashboard, BarChart3, Trophy,
  Database, GitBranch, BookOpen, ArrowLeft, ShieldCheck,
} from 'lucide-react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import HowItWorksSection from './help/HelpHowItWorks'
import { OverviewSection, ScoringSection } from './help/HelpGuides'
import { MetricsSection, RulesSection } from './help/HelpContent'
import DataSection from './help/HelpData'
import LifecycleSection from './help/LifecycleSection'
import GlossarySection from './help/GlossarySection'

/* ── Section registry ────────────────────────────────────────────────── */
const SECTIONS = [
  {
    id: 'howitworks', title: 'How It Works', icon: Workflow,
    desc: 'Data architecture, pipeline flow, Travel vs Insurance.',
    color: 'bg-primary/10 border-primary/30 text-primary',
  },
  {
    id: 'overview', title: 'Page-by-Page Guide', icon: LayoutDashboard,
    desc: 'What each page shows and when to act.',
    color: 'bg-blue-500/10 border-blue-500/30 text-blue-500',
  },
  {
    id: 'metrics', title: 'Metric Definitions', icon: BarChart3,
    desc: 'Every KPI — formula, SOQL, and SF fields.',
    color: 'bg-violet-500/10 border-violet-500/30 text-violet-500',
  },
  {
    id: 'scoring', title: 'Advisor Rankings', icon: Trophy,
    desc: 'How advisors are ranked and filtered in the leaderboard.',
    color: 'bg-amber-500/10 border-amber-500/30 text-amber-500',
  },
  {
    id: 'data', title: 'Data Model', icon: Database,
    desc: 'Searchable field dictionary and entity diagram.',
    color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500',
  },
  {
    id: 'lifecycle', title: 'Sales Lifecycle', icon: GitBranch,
    desc: 'Lead → Opportunity → Close stages and transitions.',
    color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500',
  },
  {
    id: 'rules', title: 'Business Rules', icon: ShieldCheck,
    desc: 'Filters, exclusions, and guardrails that affect metrics.',
    color: 'bg-rose-500/10 border-rose-500/30 text-rose-500',
  },
  {
    id: 'glossary', title: 'Glossary', icon: BookOpen,
    desc: 'Terms, abbreviations, and Salesforce concepts.',
    color: 'bg-gray-500/10 border-gray-500/30 text-gray-500',
  },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/* ── Render section content ──────────────────────────────────────────── */
function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case 'howitworks': return <HowItWorksSection />
    case 'overview':   return <OverviewSection />
    case 'metrics':    return <MetricsSection />
    case 'scoring':    return <ScoringSection />
    case 'data':       return <DataSection />
    case 'lifecycle':  return <LifecycleSection />
    case 'rules':      return <RulesSection />
    case 'glossary':   return <GlossarySection />
  }
}

/* ── Landing card grid ───────────────────────────────────────────────── */
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const cardAnim = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

function LandingGrid({ onSelect }: { onSelect: (id: SectionId) => void }) {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      variants={stagger} initial="hidden" animate="show">
      {SECTIONS.map(s => (
        <motion.button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="rounded-xl border border-border bg-card/50 p-5 text-left hover:bg-secondary/20 hover:border-primary/20 transition-all duration-200 group"
          variants={cardAnim}
          whileHover={{ y: -2 }}>
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center border mb-3 shrink-0', s.color)}>
            <s.icon className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-sm text-foreground mb-1">{s.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
        </motion.button>
      ))}
    </motion.div>
  )
}

/* ── Active section view with tab bar ────────────────────────────────── */
function SectionView({
  activeId,
  onBack,
  onSelect,
}: {
  activeId: SectionId
  onBack: () => void
  onSelect: (id: SectionId) => void
}) {
  const active = SECTIONS.find(s => s.id === activeId)!
  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors shrink-0 mr-2">
          <ArrowLeft className="w-3 h-3" />
          All Topics
        </button>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              s.id === activeId
                ? clsx('border-primary/30 bg-primary/10 text-primary')
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20',
            )}>
            <s.icon className="w-3 h-3" />
            {s.title}
          </button>
        ))}
      </div>

      {/* Content card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeId}
          className="rounded-xl border border-border bg-card/50 p-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' as const } }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}>
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center border shrink-0', active.color)}>
              <active.icon className="w-4.5 h-4.5" />
            </div>
            <h2 className="font-bold text-base text-foreground">{active.title}</h2>
          </div>
          <SectionContent id={activeId} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ── Main Help Page ──────────────────────────────────────────────────── */
export default function Help() {
  const [active, setActive] = useState<SectionId | null>(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Help & Documentation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {active
            ? SECTIONS.find(s => s.id === active)?.desc
            : 'Select a topic below to learn how SalesPulse works.'}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {active === null ? (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <LandingGrid onSelect={setActive} />
          </motion.div>
        ) : (
          <motion.div key="section" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <SectionView activeId={active} onBack={() => setActive(null)} onSelect={setActive} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
