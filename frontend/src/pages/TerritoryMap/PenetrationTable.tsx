import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TerritoryZip } from '@/lib/api'
import { fmt, fmtPct, fmtCurrency, getPenetration } from './utils'

export function PenetrationTable({
  title, subtitle, zips, year, sort, accent, onZipClick, selectedZip,
}: {
  title: string
  subtitle: string
  zips: TerritoryZip[]
  year: number
  sort: 'asc' | 'desc'
  accent: string
  onZipClick?: (zip: TerritoryZip) => void
  selectedZip?: TerritoryZip | null
}) {
  const sorted = useMemo(() => {
    const meaningful = zips.filter((z) => z.members >= 200)
    return [...meaningful]
      .sort((a, b) => {
        const pa = getPenetration(a)
        const pb = getPenetration(b)
        return sort === 'desc' ? pb - pa : pa - pb
      })
      .slice(0, 10)
  }, [zips, sort])

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className={cn('font-semibold text-sm', accent)}>{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Zip</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">City</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pop.</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Members</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Mkt %</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ins Cust</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ins %</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Travel</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Travel %</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rev ({year})</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((z) => (
              <tr
                key={z.zip}
                onClick={() => onZipClick?.(z)}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  onZipClick ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-muted/20',
                  selectedZip?.zip === z.zip && 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-400/50',
                )}
              >
                <td className="px-3 py-2 font-mono font-medium">
                  <span className={cn(onZipClick && 'text-primary underline underline-offset-2 cursor-pointer decoration-primary/50 hover:decoration-primary')}>
                    {z.zip}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{z.city || z.region}</td>
                <td className="px-3 py-2 text-right">{z.population ? fmt(z.population) : '—'}</td>
                <td className="px-3 py-2 text-right">{fmt(z.members)}</td>
                <td className="px-3 py-2 text-right font-medium text-orange-600">{z.market_share ? fmtPct(z.market_share) : '—'}</td>
                <td className="px-3 py-2 text-right">{fmt(z.ins_customers_cy)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtPct(z.ins_penetration)}</td>
                <td className="px-3 py-2 text-right">{fmt(z.travel_customers_3yr)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtPct(z.travel_penetration)}</td>
                <td className="px-3 py-2 text-right">{fmtCurrency(z.ins_rev_cy + z.travel_rev_cy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
