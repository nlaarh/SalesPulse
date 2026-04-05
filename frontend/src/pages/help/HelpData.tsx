/**
 * HelpData — Searchable field dictionary for Opportunity, Lead, User objects.
 */

import { useState, useMemo } from 'react'
import { Search, Database, User, Megaphone, Key } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { SectionHeader, FieldTag } from './HelpHowItWorks'

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }
const stagger = (n = 0.04) => ({ hidden: {}, show: { transition: { staggerChildren: n } } })

/* ── Field data ─────────────────────────────────────────────────────────── */
type FieldEntry = {
  name: string
  type: string
  label: string
  notes: string
  queryable: boolean
  groupable?: boolean
  custom?: boolean
  indexed?: boolean
}

const OPP_FIELDS: FieldEntry[] = [
  { name: 'Id',                           type: 'ID',       label: 'Opportunity ID',      queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier' },
  { name: 'Amount',                        type: 'Currency', label: 'Amount',               queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Gross booking value. Always filter Amount != null before SUM.' },
  { name: 'StageName',                     type: 'Picklist', label: 'Stage',                queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Won stages = "Closed Won" + "Invoice". Invoice = Travel billed. Never use IsClosed+IsWon alone.' },
  { name: 'CloseDate',                     type: 'Date',     label: 'Close Date',           queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Date field — use bare date (2024-01-01). No T suffix.' },
  { name: 'RecordTypeId',                  type: 'ID',       label: 'Record Type ID',       queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Use instead of RecordType.Name — direct indexed, no cross-object join. Travel=012Pb0000006hIjIAI, Insurance=012Pb0000006hIgIAI' },
  { name: 'OwnerId',                       type: 'ID',       label: 'Owner User ID',        queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Use in GROUP BY instead of Owner.Name — avoids User table join per row.' },
  { name: 'IsClosed',                      type: 'Boolean',  label: 'Is Closed',            queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True for both won AND lost. Use StageName for won-only filter.' },
  { name: 'IsWon',                         type: 'Boolean',  label: 'Is Won',               queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True for Closed Won. NOT true for Invoice stage — use StageName filter.' },
  { name: 'CreatedDate',                   type: 'DateTime', label: 'Created Date',         queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'DateTime — use T00:00:00Z suffix in SOQL.' },
  { name: 'LastActivityDate',              type: 'Date',     label: 'Last Activity',        queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Date of most recent task/event. Used in priority score decay.' },
  { name: 'ForecastCategory',             type: 'Picklist', label: 'Forecast Category',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Pipeline, BestCase, Commit, Omitted, Closed.' },
  { name: 'PushCount',                     type: 'Integer',  label: 'Push Count',           queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Times close date was pushed forward. PushCount ≥ 3 = at-risk signal.' },
  { name: 'Earned_Commission_Amount__c',  type: 'Currency', label: 'Commission Earned',    queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Populated 2-3 months post-booking. Travel only. Do not use for YoY comparisons.' },
  { name: 'Destination_Region__c',        type: 'Picklist', label: 'Destination Region',   queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Travel division only. Used in destination analytics.' },
]

const LEAD_FIELDS: FieldEntry[] = [
  { name: 'Id',             type: 'ID',       label: 'Lead ID',        queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier' },
  { name: 'Status',         type: 'Picklist', label: 'Status',         queryable: true,  indexed: true,  groupable: true,  custom: false, notes: '"Expired" status = lead not contacted within SLA. Use for expiry rate metric.' },
  { name: 'IsConverted',    type: 'Boolean',  label: 'Is Converted',   queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True = lead converted to Opportunity/Account/Contact.' },
  { name: 'ConvertedDate',  type: 'Date',     label: 'Converted Date', queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'Date field — no T suffix. Only populated when IsConverted = true.' },
  { name: 'CreatedDate',    type: 'DateTime', label: 'Created Date',   queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'DateTime — use T00:00:00Z suffix.' },
  { name: 'OwnerId',        type: 'ID',       label: 'Owner User ID',  queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Indexed, use in GROUP BY instead of Owner.Name.' },
  { name: 'RecordTypeId',   type: 'ID',       label: 'Record Type ID', queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Travel=012Pb0000006hIdIAI, Insurance=012Pb0000006hIbIAI, Fin Svc=012Pb0000006hIaIAI, Driver=012Pb0000006hIZIAY' },
  { name: 'LeadSource',     type: 'Picklist', label: 'Lead Source',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Used in lead funnel source effectiveness breakdown.' },
]

const USER_FIELDS: FieldEntry[] = [
  { name: 'Id',         type: 'ID',      label: 'User ID',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Matches OwnerId on Opportunity and Lead.' },
  { name: 'Name',       type: 'Text',    label: 'Full Name',  queryable: true,  indexed: false, groupable: true,  custom: false, notes: 'Use get_owner_map() (cached) to resolve OwnerId → Name in Python. Never GROUP BY Owner.Name in SOQL.' },
  { name: 'IsActive',   type: 'Boolean', label: 'Is Active',  queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Filter IsActive = true when building owner maps to exclude deactivated accounts.' },
  { name: 'Title',      type: 'Text',    label: 'Job Title',  queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Used in agent whitelist filtering on certain endpoints.' },
  { name: 'Profile.Name', type: 'Text',  label: 'Profile',    queryable: false, indexed: false, groupable: false, custom: false, notes: 'NOT directly queryable as a WHERE clause — use Id filter or ProfileId.' },
]

const OBJECT_TABS = [
  { key: 'opp',  label: 'Opportunity', icon: Database,  fields: OPP_FIELDS,  color: 'text-primary' },
  { key: 'lead', label: 'Lead',        icon: Megaphone, fields: LEAD_FIELDS, color: 'text-rose-500' },
  { key: 'user', label: 'User',        icon: User,      fields: USER_FIELDS, color: 'text-amber-500' },
]

const TYPE_COLORS: Record<string, string> = {
  ID:       'bg-violet-500/10 text-violet-500 border-violet-500/20',
  Currency: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  Date:     'bg-blue-500/10 text-blue-500 border-blue-500/20',
  DateTime: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Picklist: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Boolean:  'bg-orange-500/10 text-orange-600 border-orange-500/20',
  Integer:  'bg-pink-500/10 text-pink-600 border-pink-500/20',
  Text:     'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

/* ── ER Diagram (SVG) ───────────────────────────────────────────────────── */
function ERDiagram() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 overflow-x-auto">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Entity Relationships</p>
      <svg viewBox="0 0 640 220" className="w-full max-w-2xl mx-auto" style={{ minWidth: 420 }}>
        {/* User box */}
        <rect x="10" y="80" width="120" height="60" rx="8" className="fill-amber-500/10 stroke-amber-500/40" strokeWidth="1.5" />
        <text x="70" y="104" textAnchor="middle" className="fill-amber-600 text-[11px]" fontSize="11" fontWeight="600">User</text>
        <text x="70" y="120" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">Id, Name, IsActive</text>

        {/* Opportunity box */}
        <rect x="200" y="20" width="150" height="80" rx="8" className="fill-primary/10 stroke-primary/40" strokeWidth="1.5" />
        <text x="275" y="44" textAnchor="middle" className="fill-primary text-[11px]" fontSize="11" fontWeight="600">Opportunity</text>
        <text x="275" y="60" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">Amount, StageName</text>
        <text x="275" y="74" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">CloseDate, OwnerId</text>
        <text x="275" y="88" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">RecordTypeId</text>

        {/* Lead box */}
        <rect x="200" y="130" width="150" height="70" rx="8" className="fill-rose-500/10 stroke-rose-500/40" strokeWidth="1.5" />
        <text x="275" y="153" textAnchor="middle" className="fill-rose-500 text-[11px]" fontSize="11" fontWeight="600">Lead</text>
        <text x="275" y="169" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">Status, IsConverted</text>
        <text x="275" y="185" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">OwnerId, RecordTypeId</text>

        {/* RecordType box */}
        <rect x="430" y="70" width="140" height="60" rx="8" className="fill-violet-500/10 stroke-violet-500/40" strokeWidth="1.5" />
        <text x="500" y="94" textAnchor="middle" className="fill-violet-500 text-[11px]" fontSize="11" fontWeight="600">RecordType</text>
        <text x="500" y="110" textAnchor="middle" className="fill-gray-400 text-[10px]" fontSize="10">Id, Name, SObjectType</text>

        {/* Edges */}
        {/* User → Opportunity (OwnerId) */}
        <line x1="130" y1="100" x2="200" y2="55" stroke="rgb(var(--primary)/0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="155" y="70" fontSize="9" className="fill-gray-400" textAnchor="middle">OwnerId</text>

        {/* User → Lead (OwnerId) */}
        <line x1="130" y1="115" x2="200" y2="165" stroke="rgb(209,52,52,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="155" y="148" fontSize="9" className="fill-gray-400" textAnchor="middle">OwnerId</text>

        {/* Opportunity → RecordType */}
        <line x1="350" y1="60" x2="430" y2="90" stroke="rgb(139,92,246,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="395" y="70" fontSize="9" className="fill-gray-400" textAnchor="middle">RecordTypeId</text>

        {/* Lead → RecordType */}
        <line x1="350" y1="165" x2="430" y2="115" stroke="rgb(139,92,246,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="398" y="150" fontSize="9" className="fill-gray-400" textAnchor="middle">RecordTypeId</text>
      </svg>
    </div>
  )
}

/* ── DataSection ────────────────────────────────────────────────────────── */
export default function DataSection() {
  const [activeObj, setActiveObj] = useState<string>('opp')
  const [query, setQuery] = useState('')

  const activeTab = OBJECT_TABS.find(t => t.key === activeObj)!
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return activeTab.fields
    return activeTab.fields.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.label.toLowerCase().includes(q) ||
      f.notes.toLowerCase().includes(q) ||
      f.type.toLowerCase().includes(q),
    )
  }, [query, activeTab])

  return (
    <div>
      <SectionHeader
        title="Data Model & Field Reference"
        subtitle="Searchable field dictionary. Hover field names for SOQL tips."
      />

      <ERDiagram />

      {/* Object tabs */}
      <div className="flex gap-2 mt-5 mb-3">
        {OBJECT_TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveObj(t.key); setQuery('') }}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              activeObj === t.key
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary/30',
            )}>
            <t.icon className={clsx('w-3 h-3', activeObj === t.key ? t.color : '')} />
            {t.label}
            <span className="ml-1 text-[9px] text-muted-foreground/50">{t.fields.length}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${activeTab.label} fields…`}
          className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-background/60 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Field table */}
      <motion.div className="rounded-xl border border-border overflow-hidden"
        variants={stagger()} initial="hidden" animate="show" key={activeObj + query}>
        <div className="grid grid-cols-[1fr_80px_1fr_60px_40px] gap-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 bg-muted/30 px-4 py-2.5 border-b border-border">
          <span>Field Name</span><span>Type</span><span className="col-span-1">Notes</span>
          <span className="text-center">Group?</span><span className="text-center">Idx?</span>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground/50">No fields match "{query}"</div>
        )}
        {filtered.map((f, i) => (
          <motion.div key={f.name}
            className={clsx(
              'grid grid-cols-[1fr_80px_1fr_60px_40px] gap-0 px-4 py-3 items-start text-xs',
              i % 2 === 0 ? 'bg-background/40' : 'bg-muted/10',
              'border-b border-border/50 last:border-0',
            )}
            variants={fadeUp} transition={{ type: 'spring' as const, stiffness: 300, damping: 24 }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <FieldTag name={f.name} className="text-[9px]" />
              {f.custom && <span className="text-[9px] text-violet-500 font-bold" title="Custom field">★</span>}
              {f.indexed && <Key className="w-2.5 h-2.5 text-emerald-500/60 shrink-0" aria-label="Indexed" />}
            </div>
            <div>
              <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded border', TYPE_COLORS[f.type] ?? 'bg-muted text-muted-foreground border-border')}>
                {f.type}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{f.notes}</p>
            <div className="text-center">
              {f.groupable
                ? <span className="text-emerald-500 text-[10px]">✓</span>
                : <span className="text-muted-foreground/30 text-[10px]">—</span>}
            </div>
            <div className="text-center">
              {f.indexed
                ? <span className="text-emerald-500 text-[10px]">✓</span>
                : <span className="text-muted-foreground/30 text-[10px]">—</span>}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <p className="mt-2 text-[10px] text-muted-foreground/40">
        ★ = custom field · <Key className="inline w-2.5 h-2.5 text-emerald-500/60" /> = indexed (fast in WHERE/GROUP BY)
      </p>
    </div>
  )
}
