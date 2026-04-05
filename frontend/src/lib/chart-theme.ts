import { useTheme } from '@/contexts/ThemeContext'

export function useChartColors() {
  const { isDark } = useTheme()

  return {
    grid: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    tick: isDark ? '#475569' : '#94A3B8',
    primary: isDark ? '#5E6AD2' : '#F97316',
    secondary: isDark ? '#22C55E' : '#16A34A',
    tertiary: isDark ? '#F59E0B' : '#D97706',
    purple: isDark ? '#8B5CF6' : '#7C3AED',
    cyan: isDark ? '#06B6D4' : '#0891B2',
    pink: isDark ? '#EC4899' : '#DB2777',
    tooltipBg: isDark ? '#0C1222' : '#FFFFFF',
    tooltipBorder: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    tooltipShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.08)',
    cursor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    activeDotStroke: isDark ? '#0C1222' : '#FFFFFF',
  }
}

export function tooltipStyle(c: ReturnType<typeof useChartColors>) {
  return {
    background: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 12,
    boxShadow: c.tooltipShadow,
  }
}
