import { useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import { UserCheck, Plane, Map, Users, Building2 } from 'lucide-react'
import { type Tab } from './TopRevenueContributors/shared'
import { CustomersTab } from './TopRevenueContributors/CustomersTab'
import { DestinationsTab, RegionsTab } from './TopRevenueContributors/DestRegionsTabs'
import { AdvisorsTab, BranchesTab } from './TopRevenueContributors/AdvisorsTab'

const ALL_TABS: { key: Tab; label: string; icon: typeof UserCheck; travelOnly?: boolean }[] = [
  { key: 'customers',    label: 'Customers',    icon: UserCheck },
  { key: 'advisors',     label: 'Advisors',     icon: Users },
  { key: 'branches',     label: 'Branches',     icon: Building2, travelOnly: true },
  { key: 'destinations', label: 'Destinations', icon: Plane, travelOnly: true },
  { key: 'regions',      label: 'Regions',      icon: Map, travelOnly: true },
]

export default function TopRevenueContributors() {
  const { line } = useSales()
  const [tab, setTab] = useState<Tab>('customers')
  const isTravel = line.toLowerCase() === 'travel'
  const TABS = ALL_TABS.filter(t => !t.travelOnly || isTravel)

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <p className="text-[12px] font-medium text-muted-foreground">Revenue Analysis</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Top Revenue Contributors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {line === 'All' ? 'All business lines' : `${line} division`} — Ranked by revenue
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'customers'    && <CustomersTab />}
      {tab === 'advisors'     && <AdvisorsTab />}
      {tab === 'branches'     && <BranchesTab />}
      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'regions'      && <RegionsTab />}
    </div>
  )
}
