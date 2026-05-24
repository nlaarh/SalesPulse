import { useState } from 'react'
import { cn } from '@/lib/utils'
import TargetGrid from '@/components/TargetGrid'

export default function TargetsTab() {
  const [line, setLine] = useState<'Travel' | 'Insurance'>('Travel')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">Advisor Targets & Performance Thresholds</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Manage performance thresholds and monthly stretch goals. Actuals are pulled directly from Power BI.
          </p>
        </div>
        
        {/* Line Selector */}
        <div className="flex rounded-lg border border-border p-0.5 bg-secondary/50 self-start sm:self-center">
          <button
            onClick={() => setLine('Travel')}
            className={cn(
              'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all',
              line === 'Travel' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Travel
          </button>
          <button
            onClick={() => setLine('Insurance')}
            className={cn(
              'px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all',
              line === 'Insurance' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Insurance
          </button>
        </div>
      </div>

      <div className="card-premium p-6">
        <TargetGrid line={line} />
      </div>
    </div>
  )
}
