import { useState } from 'react'
import { useSales } from '@/contexts/SalesContext'
import { cn } from '@/lib/utils'
import { UserCheck, Plane, Map } from 'lucide-react'
import { type Tab } from './TopRevenueContributors/shared'
import { CustomersTab } from './TopRevenueContributors/CustomersTab'
import { DestinationsTab, RegionsTab } from './TopRevenueContributors/DestRegionsTabs'

const TABS: { key: Tab; label: string; icon: typeof UserCheck }[] = [
  { key: 'customers', label: 'Customers', icon: UserCheck },
  { key: 'destinations', label: 'Destinations', icon: Plane },
  { key: 'regions', label: 'Regions', icon: Map },
]

export default function TopRevenueContributors() {
  const { line } = useSales()
  const [tab, setTab] = useState<Tab>('customers')

  return (
    <div className="space-y-6">
      <div className="animate-enter">
        <p className="text-[12px] font-medium text-muted-foreground">Revenue Analysis</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Top Revenue Contributors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {line === 'All' ? 'All business lines' : `${line} division`} — Ranked by bookings
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

      {tab === 'customers' && <CustomersTab />}
      {tab === 'destinations' && <DestinationsTab />}
      {tab === 'regions' && <RegionsTab />}
    </div>
  )
}
