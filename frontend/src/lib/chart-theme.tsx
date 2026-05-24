import { useTheme } from '@/contexts/ThemeContext'
import { useId } from 'react'

export function useChartColors() {
  const { isDark } = useTheme()

  return {
    grid: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.06)',
    tick: isDark ? '#94A3B8' : '#64748B', // High contrast readable labels
    text: isDark ? '#F1F5F9' : '#0F172A',
    primary: isDark ? '#6366F1' : '#4F46E5', // Indigo-500 for dark mode, Indigo-600 for light mode
    secondary: isDark ? '#10B981' : '#059669', // Emerald-500 / Emerald-600
    tertiary: isDark ? '#F59E0B' : '#D97706', // Amber-500 / Amber-600
    purple: isDark ? '#8B5CF6' : '#7C3AED',
    cyan: isDark ? '#06B6D4' : '#0891B2',
    pink: isDark ? '#F43F5E' : '#E11D48',
    tooltipBg: isDark ? '#0F172A' : '#FFFFFF', // Slate-900 / White
    tooltipBorder: isDark ? '#1E293B' : '#E2E8F0', // Slate-800 / Slate-200
    tooltipShadow: isDark ? '0 10px 30px -3px rgba(0,0,0,0.6)' : '0 4px 20px -2px rgba(0,0,0,0.08)',
    cursor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.04)',
    activeDotStroke: isDark ? '#0F172A' : '#FFFFFF',
  }
}

export function tooltipStyle(c: ReturnType<typeof useChartColors>) {
  return {
    background: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    boxShadow: c.tooltipShadow,
    color: c.text,
    padding: '8px 12px',
  }
}

// Interface for standard Recharts tooltips
interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  valueFormatter?: (value: any) => string
}

/**
 * TremorTooltip: A highly polished custom tooltip component 
 * imitating Tremor's clean enterprise layout and typography.
 */
export function TremorTooltip({ active, payload, label, valueFormatter }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-popover-foreground max-w-sm">
      <div className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((item: any, idx: number) => {
          const color = item.color || item.fill || 'var(--si-primary)'
          const name = item.name || 'Value'
          const value = valueFormatter ? valueFormatter(item.value) : item.value

          return (
            <div key={idx} className="flex items-center justify-between gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-foreground/90">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="font-medium">{name}</span>
              </div>
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Helper to build custom 2D clean gradient URLs uniquely identified 
 * to prevent ID collision and fallback bugs.
 */
export function getGradUrl(hex: string, _idPrefix: string, _layout: 'vertical' | 'horizontal' = 'vertical'): string {
  // Return the raw hex color directly to achieve a clean, modern, flat design
  return hex
}

interface ChartGradientsProps {
  colors: ReturnType<typeof useChartColors>
  idPrefix?: string
}

/**
 * ChartGradients: Declares soft, modern 2D area gradients (fading to transparent)
 * for use in area charts. Removes harsh 3D specular cylinder gradients.
 */
export function ChartGradients({ colors, idPrefix }: ChartGradientsProps) {
  const defaultPrefix = useId().replace(/:/g, '')
  const prefix = idPrefix || defaultPrefix

  return (
    <defs>
      {/* Sleek, modern, low-contrast 2D area charts gradients */}
      <linearGradient id={`grad_${prefix}_primaryArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colors.primary} stopOpacity={0.16} />
        <stop offset="100%" stopColor={colors.primary} stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id={`grad_${prefix}_secondaryArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colors.secondary} stopOpacity={0.16} />
        <stop offset="100%" stopColor={colors.secondary} stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id={`grad_${prefix}_cyanArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={colors.cyan} stopOpacity={0.16} />
        <stop offset="100%" stopColor={colors.cyan} stopOpacity={0.0} />
      </linearGradient>
    </defs>
  )
}
