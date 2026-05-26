/**
 * chart-theme.tsx
 * Central source of truth for all chart colors, ECharts theme config,
 * glassmorphic tooltip styles, and Framer Motion animation variants.
 */
import { useTheme } from '@/contexts/ThemeContext'
import { useId } from 'react'

/* ═══ Core Color Hook ═══════════════════════════════════════════════════ */

export function useChartColors() {
  const { isDark } = useTheme()

  return isDark ? {
    isDark: true,
    // Palette — vivid on dark
    primary:   '#818CF8',
    cyan:      '#22D3EE',
    secondary: '#34D399',
    tertiary:  '#FCD34D',
    purple:    '#A78BFA',
    pink:      '#F472B6',
    orange:    '#FB923C',
    teal:      '#2DD4BF',
    // Axes / grid
    grid:            'rgba(255, 255, 255, 0.04)',
    tick:            '#475569',
    text:            '#F1F5F9',
    cursor:          'rgba(255, 255, 255, 0.03)',
    activeDotStroke: '#04080F',
    // Tooltip
    tooltipBg:     'rgba(6, 10, 22, 0.92)',
    tooltipBorder: 'rgba(129, 140, 248, 0.18)',
    tooltipShadow: '0 8px 32px rgba(0,0,0,0.5)',
  } : {
    isDark: false,
    primary:   '#4F46E5',
    cyan:      '#0891B2',
    secondary: '#059669',
    tertiary:  '#D97706',
    purple:    '#7C3AED',
    pink:      '#E11D48',
    orange:    '#EA580C',
    teal:      '#0D9488',
    grid:            'rgba(15, 23, 42, 0.05)',
    tick:            '#94A3B8',
    text:            '#0F172A',
    cursor:          'rgba(79, 70, 229, 0.05)',
    activeDotStroke: '#FFFFFF',
    tooltipBg:     'rgba(255, 255, 255, 0.95)',
    tooltipBorder: 'rgba(79, 70, 229, 0.12)',
    tooltipShadow: '0 4px 24px rgba(0,0,0,0.10)',
  }
}

export type ChartColors = ReturnType<typeof useChartColors>

/* ═══ ECharts Theme ═════════════════════════════════════════════════════ */

export function useEChartTheme() {
  const { isDark } = useTheme()

  const palette = isDark
    ? ['#818CF8','#22D3EE','#34D399','#FCD34D','#A78BFA','#F472B6','#FB923C','#2DD4BF']
    : ['#4F46E5','#0891B2','#059669','#D97706','#7C3AED','#E11D48','#EA580C','#0D9488']

  return {
    backgroundColor: 'transparent',
    color: palette,
    textStyle: {
      fontFamily: "'Inter', -apple-system, sans-serif",
      fontSize: 12,
      color: isDark ? '#CBD5E1' : '#64748B',
    },
    grid: {
      top: 12, right: 12, bottom: 28, left: 12,
      containLabel: true,
    },
    axisLine:  { lineStyle: { color: 'transparent' } },
    axisTick:  { show: false },
    axisLabel: {
      color:    isDark ? '#475569' : '#94A3B8',
      fontSize: 11,
      fontFamily: "'Inter', sans-serif",
    },
    splitLine: {
      lineStyle: {
        color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)',
        type:  'dashed',
      },
    },
    tooltip: getEChartTooltip(isDark),
  }
}

/* ─── Glassmorphic ECharts tooltip config ─── */
export function getEChartTooltip(isDark: boolean) {
  return {
    backgroundColor:  isDark ? 'rgba(6, 10, 22, 0.92)' : 'rgba(255, 255, 255, 0.95)',
    borderColor:      isDark ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.12)',
    borderWidth:      1,
    padding:          [10, 14],
    textStyle: {
      color:      isDark ? '#E2E8F0' : '#0F172A',
      fontSize:   12,
      fontFamily: "'Inter', sans-serif",
    },
    extraCssText: `
      backdrop-filter: blur(16px) saturate(1.5);
      -webkit-backdrop-filter: blur(16px) saturate(1.5);
      border-radius: 12px;
      box-shadow: ${isDark
        ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04) inset'
        : '0 4px 24px rgba(79,70,229,0.10), 0 0 0 0.5px rgba(255,255,255,0.9) inset'
      };
    `,
  }
}

/* ─── Legacy recharts tooltip (kept for compatibility) ─── */
export function tooltipStyle(c: ChartColors) {
  return {
    background:   c.tooltipBg,
    border:       `1px solid ${c.tooltipBorder}`,
    borderRadius: 10,
    fontSize:     12,
    boxShadow:    c.tooltipShadow,
    color:        c.text,
    padding:      '10px 14px',
    backdropFilter: 'blur(16px)',
  }
}

/* ═══ Recharts / SVG Gradients ══════════════════════════════════════════ */

export function getGradUrl(hex: string, _id: string, _dir?: string): string {
  return hex
}

interface ChartGradientsProps {
  colors: ChartColors
  idPrefix?: string
}

export function ChartGradients({ colors, idPrefix }: ChartGradientsProps) {
  const defaultPrefix = useId().replace(/:/g, '')
  const prefix = idPrefix || defaultPrefix

  return (
    <defs>
      <linearGradient id={`grad_${prefix}_primaryArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={colors.primary}   stopOpacity={0.18} />
        <stop offset="100%" stopColor={colors.primary}   stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id={`grad_${prefix}_secondaryArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={colors.secondary} stopOpacity={0.18} />
        <stop offset="100%" stopColor={colors.secondary} stopOpacity={0.0} />
      </linearGradient>
      <linearGradient id={`grad_${prefix}_cyanArea`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor={colors.cyan}      stopOpacity={0.18} />
        <stop offset="100%" stopColor={colors.cyan}      stopOpacity={0.0} />
      </linearGradient>
    </defs>
  )
}

/* ═══ Custom Recharts Tooltip ═══════════════════════════════════════════ */

interface CustomTooltipProps {
  active?: boolean
  payload?: { color?: string; fill?: string; name?: string; value?: number }[]
  label?: string
  valueFormatter?: (value: number) => string
}

export function TremorTooltip({ active, payload, label, valueFormatter }: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-border bg-popover/90 p-3 shadow-lg text-popover-foreground max-w-xs"
      style={{ backdropFilter: 'blur(16px)' }}>
      <div className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((item, idx) => {
          const color = item.color || item.fill || 'var(--si-primary)'
          const value = valueFormatter ? valueFormatter(item.value ?? 0) : item.value

          return (
            <div key={idx} className="flex items-center justify-between gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-foreground/90">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="font-medium">{item.name}</span>
              </div>
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Framer Motion Variants ════════════════════════════════════════════ */

export const cardVariants = {
  hidden:  { opacity: 0, y: 14, scale: 0.98 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0, scale: 1,
    transition: {
      delay:    i * 0.06,
      duration: 0.45,
      ease:     [0.22, 1, 0.36, 1],
    },
  }),
}

export const listItemVariants = {
  hidden:  { opacity: 0, x: -8 },
  visible: (i: number = 0) => ({
    opacity: 1, x: 0,
    transition: {
      delay:    i * 0.04,
      duration: 0.3,
      ease:     [0.22, 1, 0.36, 1],
    },
  }),
}

export const springHover = {
  whileHover: { scale: 1.02, y: -2 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 26 },
}

export const CHART_PALETTE_DARK  = ['#818CF8','#22D3EE','#34D399','#FCD34D','#A78BFA','#F472B6','#FB923C','#2DD4BF']
export const CHART_PALETTE_LIGHT = ['#4F46E5','#0891B2','#059669','#D97706','#7C3AED','#E11D48','#EA580C','#0D9488']
