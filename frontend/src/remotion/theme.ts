/**
 * Color bridge for Remotion compositions.
 * Remotion renders inside an iframe — CSS variables from index.css
 * are NOT accessible. We duplicate the exact hex values here.
 */

export type ThemeColors = {
  bg: string
  card: string
  text: string
  muted: string
  primary: string
  accent: string
  border: string
  success: string
  warning: string
  error: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string
}

const LIGHT: ThemeColors = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  primary: '#F97316',
  accent: '#F97316',
  border: '#E2E8F0',
  success: '#16A34A',
  warning: '#D97706',
  error: '#EF4444',
  chart1: '#F97316',
  chart2: '#16A34A',
  chart3: '#2563EB',
  chart4: '#DB2777',
  chart5: '#7C3AED',
}

const DARK: ThemeColors = {
  bg: '#050A18',
  card: '#0C1222',
  text: '#F1F5F9',
  muted: '#64748B',
  primary: '#5E6AD2',
  accent: '#D97706',
  border: 'rgba(255,255,255,0.06)',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  chart1: '#5E6AD2',
  chart2: '#22C55E',
  chart3: '#F59E0B',
  chart4: '#EC4899',
  chart5: '#8B5CF6',
}

export function getColors(isDark: boolean): ThemeColors {
  return isDark ? DARK : LIGHT
}

export const FPS = 30
