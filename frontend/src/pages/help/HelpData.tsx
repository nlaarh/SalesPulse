/**
 * HelpData — Searchable field dictionary for Opportunity, Lead, User objects.
 */

import { useState, useMemo } from 'react'
import { Search, Database, User, Megaphone, Key, Users, Building2, Briefcase, Plane, ShieldCheck, HeartPulse, Star, Car, DollarSign, GraduationCap } from 'lucide-react'
import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import { SectionHeader, FieldTag } from './HelpHowItWorks'

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }
const stagger = (n = 0.04) => ({ hidden: {}, show: { transition: { staggerChildren: n } } })

/* ── AAA Business Model Visual ─────────────────────────────────────────────── */
function BusinessModelDiagram() {
  const accountTypes = [
    {
      icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30',
      title: 'Person Account', count: '1.2M', role: 'Individual AAA Members',
      items: ['Membership (Basic / Plus / Premier)', 'Vehicles on file', 'Travel & Insurance history', 'ERS roadside calls'],
    },
    {
      icon: Building2, color: 'text-violet-600', bg: 'bg-violet-500/10', border: 'border-violet-500/30',
      title: 'Facility', count: '1,465', role: 'Partner Businesses / Garages',
      items: ['Auto repair shops', 'Approved garages', 'Fleet service partners', 'Dispatch destinations (Towbook)'],
    },
    {
      icon: Briefcase, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30',
      title: 'Business', count: '1,334', role: 'Corporate Accounts',
      items: ['Group travel accounts', 'Corporate insurance clients', 'Fleet management', 'Employer programs'],
    },
  ]

  const membershipTiers = [
    { label: 'Basic', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', items: ['4 ERS calls/year', '3 mi tow', 'Travel discounts'] },
    { label: 'Plus', color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', items: ['4 ERS calls/year', '100 mi tow', 'Lockout service', 'Extrication'] },
    { label: 'Premier', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', items: ['4 ERS calls/year', '200 mi tow', 'Priority service', 'Trip interruption'] },
  ]

  const businessLines = [
    { icon: Plane,        color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Travel',              sub: 'Vacation packages, cruises, tours, flights',           rt: 'RecordType Travel' },
    { icon: ShieldCheck,  color: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'Insurance',        sub: 'Auto, home, life insurance products',                 rt: 'RecordType Insurance' },
    { icon: HeartPulse,   color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',   label: 'Medicare',         sub: 'Medicare supplement & advantage plans',               rt: 'RecordType Medicare' },
    { icon: Star,         color: 'text-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30', label: 'Membership Svc',   sub: 'Upgrades, renewals, household add-ons',               rt: 'RecordType Membership Services' },
    { icon: DollarSign,   color: 'text-cyan-500',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',   label: 'Financial Svc',    sub: 'Financial planning, annuities, investments',          rt: 'RecordType Financial Services' },
    { icon: GraduationCap, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30',  label: 'Driver Programs',  sub: 'Teen driver courses, mature driver safety',           rt: 'RecordType Driver Programs' },
    { icon: Car,          color: 'text-slate-500',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',  label: 'Retirement Living', sub: 'Retirement community referrals & placement',         rt: 'RecordType Retirement Living' },
  ]

  return (
    <div className="space-y-6 mb-6">
      {/* Account Types */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Account Record Types — who is in Salesforce</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {accountTypes.map(a => (
            <div key={a.title} className={clsx('rounded-xl border p-4', a.bg, a.border)}>
              <div className="flex items-center gap-2 mb-2">
                <a.icon className={clsx('w-5 h-5', a.color)} />
                <div>
                  <p className="text-[12px] font-bold text-foreground">{a.title}</p>
                  <p className={clsx('text-[10px] font-semibold', a.color)}>{a.count} records</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{a.role}</p>
              <ul className="space-y-0.5">
                {a.items.map(item => (
                  <li key={item} className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <span className={clsx('mt-0.5 shrink-0', a.color)}>·</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Membership Tiers */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">AAA Membership Tiers — stored as Asset (RecordType = Membership)</p>
        <div className="grid grid-cols-3 gap-3">
          {membershipTiers.map(t => (
            <div key={t.label} className="rounded-xl border border-border bg-muted/20 p-3">
              <span className={clsx('inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold mb-2', t.color)}>{t.label}</span>
              <ul className="space-y-0.5">
                {t.items.map(i => (
                  <li key={i} className="text-[10px] text-muted-foreground">· {i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2">Stored in <code className="text-[10px] bg-muted px-1 rounded">Asset</code> object. Status: A=Active, L=Lapsed, X=Expired. Coverage level in <code className="text-[10px] bg-muted px-1 rounded">ImportantActiveMemCoverage__c</code> on Account.</p>
      </div>

      {/* Business Lines */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Business Lines — Opportunity RecordTypes (products sold)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {businessLines.map(b => (
            <div key={b.label} className={clsx('flex items-start gap-3 rounded-lg border p-3', b.bg, b.border)}>
              <b.icon className={clsx('w-4 h-4 mt-0.5 shrink-0', b.color)} />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{b.label}</p>
                <p className="text-[10px] text-muted-foreground">{b.sub}</p>
                <code className="text-[9px] text-muted-foreground/50 mt-0.5 block">{b.rt}</code>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground space-y-1">
          <p><strong>Top Customers page</strong> queries <code className="bg-muted px-1 rounded">Opportunity</code> grouped by <code className="bg-muted px-1 rounded">AccountId</code> — those AccountIds resolve to <strong>Person Accounts</strong> (individual AAA members). Verified against Salesforce.</p>
          <p><strong>Invoice stage</strong> is Travel-only. <strong>In Process stage</strong> is Insurance-only. Won = <code className="bg-muted px-1 rounded">Closed Won</code> + <code className="bg-muted px-1 rounded">Invoice</code>.</p>
        </div>
      </div>
    </div>
  )
}


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
  { name: 'Id',                           type: 'ID',       label: 'Opportunity ID',       queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier' },
  { name: 'AccountId',                    type: 'ID',       label: 'Account ID',           queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'FK to Account (customer/member). Use to join to Account for member info.' },
  { name: 'Amount',                       type: 'Currency', label: 'Amount',               queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Gross booking value. Always filter Amount != null before SUM.' },
  { name: 'StageName',                    type: 'Picklist', label: 'Stage',                queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Won stages = "Closed Won" + "Invoice". Invoice = Travel billed. Never use IsClosed+IsWon alone.' },
  { name: 'CloseDate',                    type: 'Date',     label: 'Close Date',           queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Date field — use bare date (2024-01-01). No T suffix.' },
  { name: 'RecordTypeId',                 type: 'ID',       label: 'Record Type ID',       queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Travel=hIjIAI · Insurance=hIgIAI · Medicare=hIhIAI · Membership Svc=hIiIAI · Financial Svc=hIfIAI · Driver Programs=hIeIAI · Retirement=AjaIAE' },
  { name: 'OwnerId',                      type: 'ID',       label: 'Owner User ID',        queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Use in GROUP BY instead of Owner.Name — avoids User table join per row.' },
  { name: 'Type',                         type: 'Picklist', label: 'Opportunity Type',     queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'NWQ = new business. Used for new vs. renewal filtering.' },
  { name: 'IsClosed',                     type: 'Boolean',  label: 'Is Closed',            queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True for both won AND lost. Use StageName for won-only filter.' },
  { name: 'IsWon',                        type: 'Boolean',  label: 'Is Won',               queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True for Closed Won. NOT true for Invoice stage — use StageName filter.' },
  { name: 'CreatedDate',                  type: 'DateTime', label: 'Created Date',         queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'DateTime — use T00:00:00Z suffix in SOQL.' },
  { name: 'LastActivityDate',             type: 'Date',     label: 'Last Activity',        queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Date of most recent task/event. Used in priority score decay.' },
  { name: 'ForecastCategory',             type: 'Picklist', label: 'Forecast Category',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Pipeline, BestCase, Commit, Omitted, Closed.' },
  { name: 'PushCount',                    type: 'Integer',  label: 'Push Count',           queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Times close date was pushed forward. PushCount ≥ 3 = at-risk signal.' },
  { name: 'Earned_Commission_Amount__c',  type: 'Currency', label: 'Commission Earned',    queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Travel only. Populated 2-3 months post-booking. Do not use for real-time YoY.' },
  { name: 'Destination_Region__c',        type: 'Picklist', label: 'Destination Region',   queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Travel only. Values: United States, Caribbean, International, etc.' },
  { name: 'Axis_Trip_ID__c',              type: 'Text',     label: 'Axis Trip ID',         queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Travel only. External booking system reference (Axis). Format: "NN*NNNNNNN".' },
  { name: 'Number_Traveling__c',          type: 'Number',   label: 'Number Traveling',     queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Travel only. Formula field — number of travelers on booking.' },
  { name: 'SOA_Completed__c',             type: 'Picklist', label: 'SOA Completed',        queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Insurance only. Statement of Account completed flag.' },
  { name: 'Loss_Reason__c',               type: 'Picklist', label: 'Loss Reason',          queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Populated on Closed Lost. Used in loss analysis.' },
]

const ACCOUNT_FIELDS: FieldEntry[] = [
  { name: 'Id',                              type: 'ID',       label: 'Account ID',              queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier. Use as FK from Opportunity.AccountId.' },
  { name: 'Name',                            type: 'Text',     label: 'Full Name',               queryable: true,  indexed: false, groupable: true,  custom: false, notes: 'Customer full name (Person Account). Searchable with LIKE.' },
  { name: 'PersonEmail',                     type: 'Email',    label: 'Email',                   queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Person Account email. Indexed.' },
  { name: 'Phone',                           type: 'Phone',    label: 'Phone',                   queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Primary phone number.' },
  { name: 'RecordType.Name',                 type: 'Text',     label: 'Record Type',             queryable: false, indexed: false, groupable: false, custom: false, notes: 'Person Account = individual customer/member. Household = household grouping. Business = corporate.' },
  { name: 'Account_Member_ID__c',            type: 'Text',     label: 'Member #',                queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'AAA membership number. Searchable. Use for member lookup.' },
  { name: 'Member_Status__c',               type: 'Picklist', label: 'Member Status',           queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'A=Active, X=Expired/Cancelled. Key for active member filters.' },
  { name: 'Account_Member_Since__c',         type: 'Date',     label: 'Member Since',            queryable: true,  indexed: true,  groupable: false, custom: true,  notes: 'Date member first joined AAA. Used for tenure calculations.' },
  { name: 'ImportantActiveMemCoverage__c',   type: 'Text',     label: 'Membership Coverage',     queryable: true,  indexed: false, groupable: true,  custom: true,  notes: 'Current membership tier from active Asset: PREMIER, PLUS, Basic (B).' },
  { name: 'ImportantActiveMemExpiryDate__c', type: 'Date',     label: 'Membership Expiry',       queryable: true,  indexed: true,  groupable: false, custom: true,  notes: 'Expiry date of current active membership. Use for renewal targeting.' },
  { name: 'MPI__c',                          type: 'Number',   label: 'Member Product Index',    queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'MPI = number of AAA product categories held. Higher = more engaged member.' },
  { name: 'LTV__c',                          type: 'Picklist', label: 'Lifetime Value (LTV)',    queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Segmented LTV tier. Used for prioritization.' },
  { name: 'Insuance_Customer_ID__c',         type: 'Text',     label: 'Insurance Customer #',    queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'Insurance system customer ID. Note: field name has typo "Insuance".' },
  { name: 'EPIC_GUID__c',                    type: 'Text',     label: 'EPIC GUID',               queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'ID in EPIC insurance system. Use to correlate SF with insurance platform.' },
  { name: 'FinServ__InsuranceCustomerSince__c', type: 'Date',  label: 'Insurance Customer Since',queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Date customer first purchased insurance from AAA.' },
  { name: 'FinServ__TotalHouseholdPremiums__c', type: 'Currency', label: 'Total Household Premiums', queryable: true, indexed: false, groupable: false, custom: true, notes: 'Rollup of all insurance premiums for household. From FinancialServices Cloud.' },
  { name: 'Region__c',                       type: 'Picklist', label: 'Region',                  queryable: true,  indexed: true,  groupable: true,  custom: true,  notes: 'AAA geographic region. Used for territory-based analytics.' },
  { name: 'ERS_Calls_Made_CP__c',            type: 'Number',   label: 'ERS Calls Made (Period)', queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Emergency Roadside Service calls used in current membership period.' },
  { name: 'ERS_Calls_Available_CP__c',       type: 'Number',   label: 'ERS Calls Available',     queryable: true,  indexed: false, groupable: false, custom: true,  notes: 'Remaining ERS calls in current period based on membership tier.' },
]

const ASSET_FIELDS: FieldEntry[] = [
  { name: 'Id',            type: 'ID',       label: 'Asset ID',       queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier.' },
  { name: 'Name',          type: 'Text',     label: 'Asset Name',     queryable: true,  indexed: false, groupable: true,  custom: false, notes: 'Membership format: "MemberNumber - Level - StatusCode" e.g. "6200842153806005 - PLUS - L".' },
  { name: 'RecordType.Name', type: 'Text',   label: 'Record Type',    queryable: false, indexed: false, groupable: false, custom: false, notes: 'Membership (1.19M) = AAA membership cards. Vehicle (490K) = customer vehicles. ERS Truck = fleet trucks.' },
  { name: 'AccountId',     type: 'ID',       label: 'Account ID',     queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'FK to Account (member). Use to get all assets for a customer.' },
  { name: 'Status',        type: 'Picklist', label: 'Status',         queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Membership: A=Active, L=Lapsed, X=Expired/Cancelled, C=Cancelled, P=Pending. Vehicle: Active/Inactive.' },
  { name: 'SerialNumber',  type: 'Text',     label: 'Serial Number',  queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Membership: membership card number. Vehicle: VIN.' },
  { name: 'PurchaseDate',  type: 'Date',     label: 'Purchase Date',  queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'Membership join/renewal date.' },
  { name: 'UsageEndDate',  type: 'Date',     label: 'Expiry Date',    queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'Membership expiry date. Use for renewal campaigns.' },
  { name: 'Price',         type: 'Currency', label: 'Price',          queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Membership price paid.' },
  { name: 'Description',   type: 'Text',     label: 'Description',    queryable: false, indexed: false, groupable: false, custom: false, notes: 'Vehicle: make/model/year details. NOT filterable in WHERE clause.' },
]

const LEAD_FIELDS: FieldEntry[] = [
  { name: 'Id',             type: 'ID',       label: 'Lead ID',        queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Salesforce unique identifier' },
  { name: 'Status',         type: 'Picklist', label: 'Status',         queryable: true,  indexed: true,  groupable: true,  custom: false, notes: '"Expired" status = lead not contacted within SLA. Use for expiry rate metric.' },
  { name: 'IsConverted',    type: 'Boolean',  label: 'Is Converted',   queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'True = lead converted to Opportunity/Account/Contact.' },
  { name: 'ConvertedDate',  type: 'Date',     label: 'Converted Date', queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'Date field — no T suffix. Only populated when IsConverted = true.' },
  { name: 'CreatedDate',    type: 'DateTime', label: 'Created Date',   queryable: true,  indexed: true,  groupable: false, custom: false, notes: 'DateTime — use T00:00:00Z suffix.' },
  { name: 'OwnerId',        type: 'ID',       label: 'Owner User ID',  queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Indexed, use in GROUP BY instead of Owner.Name.' },
  { name: 'RecordTypeId',   type: 'ID',       label: 'Record Type ID', queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Travel=hIdIAI · Insurance=hIbIAI · Medicare=hIhIAI · Membership Svc=hIcIAI · Financial Svc=hIaIAI · Driver=hIZIAY · Outbound=LaLRIA0' },
  { name: 'LeadSource',     type: 'Picklist', label: 'Lead Source',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Used in lead funnel source effectiveness breakdown.' },
]

const USER_FIELDS: FieldEntry[] = [
  { name: 'Id',           type: 'ID',      label: 'User ID',    queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Matches OwnerId on Opportunity and Lead.' },
  { name: 'Name',         type: 'Text',    label: 'Full Name',  queryable: true,  indexed: false, groupable: true,  custom: false, notes: 'Use get_owner_map() (cached) to resolve OwnerId → Name in Python. Never GROUP BY Owner.Name in SOQL.' },
  { name: 'IsActive',     type: 'Boolean', label: 'Is Active',  queryable: true,  indexed: true,  groupable: true,  custom: false, notes: 'Filter IsActive = true when building owner maps to exclude deactivated accounts.' },
  { name: 'Title',        type: 'Text',    label: 'Job Title',  queryable: true,  indexed: false, groupable: false, custom: false, notes: 'Used in agent whitelist filtering on certain endpoints.' },
  { name: 'Profile.Name', type: 'Text',    label: 'Profile',    queryable: false, indexed: false, groupable: false, custom: false, notes: 'NOT directly queryable as a WHERE clause — use Id filter or ProfileId.' },
]

const OBJECT_TABS = [
  { key: 'opp',     label: 'Opportunity', icon: Database,  fields: OPP_FIELDS,     color: 'text-primary' },
  { key: 'account', label: 'Account',     icon: User,      fields: ACCOUNT_FIELDS, color: 'text-cyan-500' },
  { key: 'asset',   label: 'Asset',       icon: Key,       fields: ASSET_FIELDS,   color: 'text-violet-500' },
  { key: 'lead',    label: 'Lead',        icon: Megaphone, fields: LEAD_FIELDS,    color: 'text-rose-500' },
  { key: 'user',    label: 'User',        icon: User,      fields: USER_FIELDS,    color: 'text-amber-500' },
]

const TYPE_COLORS: Record<string, string> = {
  ID:       'bg-violet-500/10 text-violet-500 border-violet-500/20',
  Currency: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  Date:     'bg-blue-500/10 text-blue-500 border-blue-500/20',
  DateTime: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  Picklist: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Boolean:  'bg-orange-500/10 text-orange-600 border-orange-500/20',
  Integer:  'bg-pink-500/10 text-pink-600 border-pink-500/20',
  Number:   'bg-pink-500/10 text-pink-600 border-pink-500/20',
  Text:     'bg-gray-500/10 text-gray-500 border-gray-500/20',
  Email:    'bg-sky-500/10 text-sky-500 border-sky-500/20',
  Phone:    'bg-sky-500/10 text-sky-500 border-sky-500/20',
}

/* ── ER Diagram (SVG) ───────────────────────────────────────────────────── */
function ERDiagram() {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 overflow-x-auto">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-3">Entity Relationships — all key Salesforce objects</p>
      <svg viewBox="0 0 820 430" className="w-full max-w-4xl mx-auto" style={{ minWidth: 520 }}>

        {/* ── ACCOUNT (hub) ── */}
        <rect x="10" y="90" width="155" height="120" rx="8" className="fill-cyan-500/10 stroke-cyan-500/40" strokeWidth="1.5" />
        <text x="87" y="112" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-cyan-600">Account</text>
        <text x="87" y="127" textAnchor="middle" fontSize="8.5" className="fill-gray-400">3 types: Person / Facility / Business</text>
        <text x="87" y="141" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Member #, Status, MPI, LTV</text>
        <text x="87" y="154" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Coverage, Insurance ID</text>
        <text x="87" y="167" textAnchor="middle" fontSize="8.5" className="fill-gray-400">ERS_Calls_Made_CP__c</text>
        <text x="87" y="180" textAnchor="middle" fontSize="8.5" className="fill-gray-400">1.2M Person + 2.8K business</text>

        {/* ── ASSET (Membership + Vehicle) ── */}
        <rect x="10" y="232" width="155" height="85" rx="8" className="fill-violet-500/10 stroke-violet-500/40" strokeWidth="1.5" />
        <text x="87" y="253" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-violet-500">Asset</text>
        <text x="87" y="268" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Membership (1.19M) — Basic/Plus/Premier</text>
        <text x="87" y="281" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Vehicle (490K) — VIN, make/model</text>
        <text x="87" y="294" textAnchor="middle" fontSize="8.5" className="fill-gray-400">ERS Truck (fleet vehicles)</text>
        <text x="87" y="307" textAnchor="middle" fontSize="8.5" className="fill-gray-400">AccountId → Account</text>

        {/* ── SERVICE APPOINTMENT (ERS/FSL) ── */}
        <rect x="10" y="338" width="155" height="80" rx="8" className="fill-emerald-500/10 stroke-emerald-500/40" strokeWidth="1.5" />
        <text x="87" y="358" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-emerald-600">ServiceAppointment</text>
        <text x="87" y="373" textAnchor="middle" fontSize="8.5" className="fill-gray-400">ERS roadside calls (667K)</text>
        <text x="87" y="386" textAnchor="middle" fontSize="8.5" className="fill-gray-400">StatusCategory, WorkTypeId</text>
        <text x="87" y="399" textAnchor="middle" fontSize="8.5" className="fill-gray-400">ERS_PTA__c, ActualStartTime</text>

        {/* ── USER ── */}
        <rect x="225" y="145" width="130" height="65" rx="8" className="fill-amber-500/10 stroke-amber-500/40" strokeWidth="1.5" />
        <text x="290" y="167" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-amber-600">User</text>
        <text x="290" y="182" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Sales advisors / managers</text>
        <text x="290" y="195" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Title, IsActive, Region</text>

        {/* ── OPPORTUNITY ── */}
        <rect x="420" y="15" width="175" height="115" rx="8" className="fill-orange-500/10 stroke-orange-500/40" strokeWidth="1.5" />
        <text x="507" y="37" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-orange-500">Opportunity</text>
        <text x="507" y="52" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Amount, StageName, CloseDate</text>
        <text x="507" y="65" textAnchor="middle" fontSize="8.5" className="fill-gray-400">RecordTypeId (7 lines)</text>
        <text x="507" y="78" textAnchor="middle" fontSize="8.5" className="fill-gray-400">AccountId, OwnerId</text>
        <text x="507" y="91" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Destination_Region__c</text>
        <text x="507" y="104" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Earned_Commission_Amount__c</text>
        <text x="507" y="117" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Won: Closed Won + Invoice stages</text>

        {/* ── LEAD ── */}
        <rect x="420" y="155" width="175" height="85" rx="8" className="fill-rose-500/10 stroke-rose-500/40" strokeWidth="1.5" />
        <text x="507" y="176" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-rose-500">Lead</text>
        <text x="507" y="191" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Status, IsConverted, ConvertedDate</text>
        <text x="507" y="204" textAnchor="middle" fontSize="8.5" className="fill-gray-400">OwnerId, RecordTypeId</text>
        <text x="507" y="217" textAnchor="middle" fontSize="8.5" className="fill-gray-400">7 record types (Travel, Insurance…)</text>
        <text x="507" y="230" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Converts → Opportunity + Account</text>

        {/* ── RECORD TYPE ── */}
        <rect x="645" y="80" width="160" height="75" rx="8" className="fill-slate-500/10 stroke-slate-500/30" strokeWidth="1.5" />
        <text x="725" y="101" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-slate-500">RecordType</text>
        <text x="725" y="116" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Travel · Insurance · Medicare</text>
        <text x="725" y="129" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Membership Svc · Financial</text>
        <text x="725" y="142" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Driver Programs · Retirement</text>

        {/* ── SURVEY ── */}
        <rect x="420" y="265" width="175" height="80" rx="8" className="fill-pink-500/10 stroke-pink-500/30" strokeWidth="1.5" />
        <text x="507" y="286" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-pink-500">Survey_Result__c</text>
        <text x="507" y="301" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Qualtrics_Data__c (NPS/Sat)</text>
        <text x="507" y="314" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Total_Satisfied__c (KPI)</text>
        <text x="507" y="327" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Matched by WO # (arrives days later)</text>

        {/* ── SERVICE TERRITORY (FSL) ── */}
        <rect x="645" y="310" width="160" height="70" rx="8" className="fill-teal-500/10 stroke-teal-500/30" strokeWidth="1.5" />
        <text x="725" y="331" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-teal-600">ServiceTerritory</text>
        <text x="725" y="346" textAnchor="middle" fontSize="8.5" className="fill-gray-400">443 territories (405 active)</text>
        <text x="725" y="359" textAnchor="middle" fontSize="8.5" className="fill-gray-400">Fleet · ERS dispatch zones</text>
        <text x="725" y="372" textAnchor="middle" fontSize="8.5" className="fill-gray-400">SA.ServiceTerritoryId → here</text>

        {/* ── EDGES ── */}

        {/* Account → Opportunity */}
        <path d="M 165 130 Q 290 60 420 72" stroke="rgba(6,182,212,0.45)" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
        <text x="285" y="72" fontSize="8.5" className="fill-gray-400" textAnchor="middle">AccountId</text>

        {/* Account → Asset */}
        <line x1="87" y1="210" x2="87" y2="232" stroke="rgba(139,92,246,0.45)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="112" y="225" fontSize="8.5" className="fill-gray-400">AccountId</text>

        {/* Account → ServiceAppointment */}
        <line x1="87" y1="317" x2="87" y2="338" stroke="rgba(16,185,129,0.45)" strokeWidth="1.5" strokeDasharray="4 2" />

        {/* Account → Survey */}
        <path d="M 165 185 Q 300 340 420 305" stroke="rgba(236,72,153,0.35)" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
        <text x="300" y="335" fontSize="8.5" className="fill-gray-400" textAnchor="middle">AccountId</text>

        {/* User → Opportunity */}
        <line x1="355" y1="163" x2="420" y2="90" stroke="rgba(245,158,11,0.45)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="393" y="118" fontSize="8.5" className="fill-gray-400" textAnchor="middle">OwnerId</text>

        {/* User → Lead */}
        <line x1="355" y1="185" x2="420" y2="198" stroke="rgba(245,158,11,0.45)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="392" y="196" fontSize="8.5" className="fill-gray-400" textAnchor="middle">OwnerId</text>

        {/* Opportunity → RecordType */}
        <line x1="595" y1="72" x2="645" y2="110" stroke="rgba(107,114,128,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />

        {/* Lead → RecordType */}
        <line x1="595" y1="190" x2="645" y2="140" stroke="rgba(107,114,128,0.3)" strokeWidth="1.5" strokeDasharray="4 2" />
        <text x="635" y="175" fontSize="8.5" className="fill-gray-400" textAnchor="middle">RecordTypeId</text>

        {/* ServiceAppointment → ServiceTerritory */}
        <path d="M 165 375 Q 400 410 645 355" stroke="rgba(20,184,166,0.35)" strokeWidth="1.5" strokeDasharray="4 2" fill="none"/>
        <text x="410" y="415" fontSize="8.5" className="fill-gray-400" textAnchor="middle">ServiceTerritoryId</text>

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

      <BusinessModelDiagram />

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
