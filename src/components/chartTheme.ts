import { useEffect, useState } from 'react'
import { useTheme } from '../features/theme/ThemeProvider'

export interface ChartTheme {
  grid: string
  axis: string
  cursor: string
  present: string
  late: string
  absent: string
  accent: string
  accentSoft: string
  tooltip: {
    borderRadius: number
    border: string
    background: string
    color: string
    boxShadow: string
    fontSize: number
  }
}

/**
 * Charts read the same CSS variables as the rest of the interface, so a theme
 * switch moves axes, grids, and series together instead of leaving hardcoded
 * slate values glowing on a dark canvas.
 */
function readToken(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw ? `rgb(${raw})` : fallback
}

function buildTheme(): ChartTheme {
  const surface = readToken('--surface', '#ffffff')
  const line = readToken('--line', '#e5e7ec')
  return {
    grid: line,
    axis: readToken('--subtle', '#858b96'),
    cursor: readToken('--sunken', '#f6f7f9'),
    present: readToken('--ok', '#108960'),
    late: readToken('--warn', '#be800c'),
    absent: readToken('--subtle', '#858b96'),
    accent: readToken('--accent', '#2563eb'),
    accentSoft: readToken('--accent-soft', '#eff4ff'),
    tooltip: {
      borderRadius: 10,
      border: `1px solid ${line}`,
      background: surface,
      color: readToken('--ink', '#15171c'),
      boxShadow: '0 1px 2px rgb(9 11 16 / 0.06), 0 6px 16px -4px rgb(9 11 16 / 0.14)',
      fontSize: 12,
    },
  }
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme()
  const [palette, setPalette] = useState<ChartTheme>(buildTheme)
  // The class swap on <html> lands before this effect, so the read is current.
  useEffect(() => { setPalette(buildTheme()) }, [theme])
  return palette
}
