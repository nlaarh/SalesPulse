import { CheckCircle2 } from 'lucide-react'
import {
  User, Shield, Car, CreditCard, Plane, Heart,
  TrendingUp, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Product360 {
  membership: boolean; travel: boolean; insurance: boolean; medicare: boolean
  membership_services: boolean; financial: boolean; driver: boolean; ers: boolean
}

const PRODUCTS = [
  { key: 'membership',          label: 'Membership',    icon: CreditCard, color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  { key: 'travel',              label: 'Travel',        icon: Plane,      color: 'text-indigo-500',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30' },
  { key: 'insurance',           label: 'Insurance',     icon: Shield,     color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'medicare',            label: 'Medicare',      icon: Heart,      color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  { key: 'membership_services', label: 'Mbr Services',  icon: User,       color: 'text-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/30' },
  { key: 'financial',           label: 'Financial',     icon: TrendingUp, color: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  { key: 'driver',              label: 'Driver Pgm',    icon: Car,        color: 'text-orange-500',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  { key: 'ers',                 label: 'ERS',           icon: AlertCircle,color: 'text-cyan-500',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30' },
]

export default function Product360Visual({ p360 }: { p360: Product360 }) {
  const total = PRODUCTS.length
  const owned = PRODUCTS.filter(p => p360[p.key as keyof Product360]).length

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Product 360</p>
        <span className="text-[12px] font-semibold text-primary">{owned}/{total} products</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {PRODUCTS.map(p => {
          const has = p360[p.key as keyof Product360]
          const Icon = p.icon
          return (
            <div key={p.key}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
                has ? `${p.bg} ${p.border}` : 'bg-muted/20 border-border opacity-40',
              )}>
              <div className={cn('rounded-lg p-1.5', has ? p.bg : 'bg-muted/30')}>
                <Icon className={cn('h-4 w-4', has ? p.color : 'text-muted-foreground/40')} />
              </div>
              <span className={cn('text-[10px] font-medium text-center leading-tight',
                has ? 'text-foreground' : 'text-muted-foreground/40')}>
                {p.label}
              </span>
              {has
                ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                : <span className="h-3 w-3 rounded-full border border-dashed border-muted-foreground/30" />}
            </div>
          )
        })}
      </div>
      {/* Coverage bar */}
      <div className="mt-4">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-muted-foreground/50">Product Coverage</span>
          <span className="text-[10px] text-muted-foreground/50">{Math.round((owned / total) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(owned / total) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
