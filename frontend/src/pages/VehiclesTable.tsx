import { Car, Zap } from 'lucide-react'
import type { VehicleDataResponse } from '@/lib/api'
import { type CountyVehicleStats, fmt } from './TerritoryMap/utils'

export function VehiclesTable({
  vehicleData,
  countyVehicles,
}: {
  vehicleData: VehicleDataResponse
  countyVehicles: Record<string, CountyVehicleStats>
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <Car className="w-4 h-4" /> DMV Vehicle Registrations (NY DMV)
          </h3>
          <p className="text-xs text-muted-foreground">County-level vehicle counts and fuel types for WCNY territory</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium">{fmt(vehicleData.totals.vehicle_count)} Total Vehicles</p>
          <p className="text-[10px] text-muted-foreground flex items-center justify-end gap-1">
            <Zap className="w-3 h-3 text-amber-500" />
            {fmt(Object.values(countyVehicles).reduce((s, v) => s + v.electric, 0))} EVs across territory
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">County</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total Vehicles</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Electric (EV)</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">EV %</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Fuel Types</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(countyVehicles)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([county, stats]) => (
                <tr key={county} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2 font-medium">{county}</td>
                  <td className="px-4 py-2 text-right">{fmt(stats.total)}</td>
                  <td className="px-4 py-2 text-right font-medium text-amber-600 dark:text-amber-400">
                    {fmt(stats.electric)}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-amber-600 dark:text-amber-400">
                    {stats.ev_pct}%
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground italic">
                    {Array.from(new Set(vehicleData.rows.filter(r => r.county === county).map(r => r.fuel_type)))
                      .filter(f => f !== 'GAS' && f !== 'ELECTRIC')
                      .slice(0, 3)
                      .join(', ')}
                    ...
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
