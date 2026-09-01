import { Moon, Palette as PaletteIcon, Sun } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
type ColorPalette = 'ocean' | 'forest'

interface ThemeContextValue {
  theme: Theme
  palette: ColorPalette
  toggleTheme: () => void
  togglePalette: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_STORAGE_KEY = 'attendly_theme'
const PALETTE_STORAGE_KEY = 'attendly_palette:v1'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialPalette(): ColorPalette {
  try {
    const saved = localStorage.getItem(PALETTE_STORAGE_KEY)
    if (saved === 'ocean' || saved === 'forest') return saved
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return 'ocean'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [palette, setPalette] = useState<ColorPalette>(initialPalette)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch { /* Keep the active session theme when storage is unavailable. */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.palette = palette
    try { localStorage.setItem(PALETTE_STORAGE_KEY, palette) } catch { /* Keep the active session palette when storage is unavailable. */ }
  }, [palette])

  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [])
  const togglePalette = useCallback(() => setPalette((current) => current === 'ocean' ? 'forest' : 'ocean'), [])
  const value = useMemo(() => ({ theme, palette, toggleTheme, togglePalette }), [theme, palette, toggleTheme, togglePalette])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider.')
  return context
}

export function ThemeToggle({ className = 'icon-btn' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const nextLabel = theme === 'dark' ? 'Use light mode' : 'Use dark mode'
  return (
    <button type="button" className={className} onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

export function PaletteToggle({ className = 'icon-btn' }: { className?: string }) {
  const { palette, togglePalette } = useTheme()
  const currentName = palette === 'ocean' ? 'Ocean' : 'Forest'
  const nextName = palette === 'ocean' ? 'Forest' : 'Ocean'
  const label = `Palette: ${currentName}. Switch to ${nextName}`
  return (
    <button type="button" className={className} onClick={togglePalette} aria-label={label} title={label}>
      <PaletteIcon className="text-accent" size={16} />
    </button>
  )
}
