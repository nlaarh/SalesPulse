import {
  Shield, ClipboardList, ExternalLink, BarChart2, FileText,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type ReportEntry =
  | { id: string; title: string; description: string; icon: typeof ClipboardList; kind: 'internal'; href: string }
  | { id: string; title: string; description: string; icon: typeof ClipboardList; kind: 'external'; url: string }

const AVAILABLE_REPORTS: ReportEntry[] = [
  {
    id: 'concierge-scorecard',
    title: 'Insurance Concierge Scorecard',
    description: 'Performance Metric Data Entries · Live Epic, TTEC, MEID & Salesforce · Any date range · CSV export',
    icon: ClipboardList,
    kind: 'internal',
    href: '/reports/insurance-scorecard',
  },
  {
    id: 'pbi-insurance-dashboard',
    title: 'Insurance Performance Dashboard',
    description: 'Power BI · Production metrics, policy counts & agent performance',
    icon: BarChart2,
    kind: 'external',
    url: 'https://app.powerbi.com/groups/me/reports/8ec6bfd3-1044-4dcb-b16b-ed7fbf294b95/33b59d56e2393864a83a?experience=power-bi',
  },
  {
    id: 'sf-insurance-report',
    title: 'Insurance Sales Report',
    description: 'Salesforce · Live insurance sales activity & pipeline report',
    icon: FileText,
    kind: 'external',
    url: 'https://aaawcny.lightning.force.com/lightning/r/Report/00OPb000001SsWLMA0/view?queryScope=userFolders',
  },
  {
    id: 'pbi-insurance-executive',
    title: 'Insurance Executive Report',
    description: 'Power BI · Executive-level insurance KPIs & division summary',
    icon: BarChart2,
    kind: 'external',
    url: 'https://app.powerbi.com/groups/me/reports/be41cc35-9c8f-4d3d-abd7-335b1dec6335/e62f85e5e91089f9c02b?ctid=87c1e7cf-b6c4-434f-b18e-5444b1bce3bb&experience=power-bi',
  },
]

export default function ReportsInsurance() {
  const navigate = useNavigate()

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Insurance Reports</h1>
          </div>
          <p className="ml-[52px] text-sm text-muted-foreground">
            Scorecards &amp; executive presentations for AAA WCNY Insurance division
          </p>
        </div>
      </div>

      {/* Available reports table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-bold text-foreground">Available Reports</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Click Open to launch the report. External reports open in a new tab — you must be signed in to Power BI / Salesforce.</p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Report</th>
              <th className="px-5 py-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
              <th className="px-5 py-3 text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {AVAILABLE_REPORTS.map(r => {
              const Icon = r.icon
              return (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="font-semibold text-foreground">{r.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{r.description}</td>
                  <td className="px-5 py-4 text-right">
                    {r.kind === 'internal' ? (
                      <button
                        onClick={() => navigate(r.href)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </button>
                    ) : (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
