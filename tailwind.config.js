/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens. Every value resolves from CSS variables in index.css,
        // so light and dark are defined once and never duplicated with dark: variants.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          ink: 'rgb(var(--accent-ink) / <alpha-value>)',
          contrast: 'rgb(var(--accent-contrast) / <alpha-value>)',
        },
        ok: {
          DEFAULT: 'rgb(var(--ok) / <alpha-value>)',
          soft: 'rgb(var(--ok-soft) / <alpha-value>)',
          ink: 'rgb(var(--ok-ink) / <alpha-value>)',
        },
        warn: {
          DEFAULT: 'rgb(var(--warn) / <alpha-value>)',
          soft: 'rgb(var(--warn-soft) / <alpha-value>)',
          ink: 'rgb(var(--warn-ink) / <alpha-value>)',
        },
        bad: {
          DEFAULT: 'rgb(var(--bad) / <alpha-value>)',
          soft: 'rgb(var(--bad-soft) / <alpha-value>)',
          ink: 'rgb(var(--bad-ink) / <alpha-value>)',
        },
        // Fixed dark brand surface; deliberately does not flip with the theme.
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar) / <alpha-value>)',
          ink: 'rgb(var(--sidebar-ink) / <alpha-value>)',
          muted: 'rgb(var(--sidebar-muted) / <alpha-value>)',
          line: 'rgb(var(--sidebar-line) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Deliberate, small scale. Body is 14px; nothing between 14 and 18.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        meta: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.011em' }],
        '3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.017em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.021em' }],
      },
      borderRadius: {
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
      },
      boxShadow: {
        // Exactly one real elevation, reserved for things that float above the page.
        overlay: '0 1px 2px rgb(9 11 16 / 0.08), 0 12px 28px -8px rgb(9 11 16 / 0.18)',
        pop: '0 1px 2px rgb(9 11 16 / 0.06), 0 6px 16px -4px rgb(9 11 16 / 0.14)',
      },
    },
  },
  plugins: [],
}
