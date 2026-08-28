import { BarChart3, LayoutGrid } from 'lucide-react'

export type ViewMode = 'cards' | 'graphs'

export function ViewModeToggle({ value, onChange, label = 'Analytics view' }: {
  value: ViewMode
  onChange: (value: ViewMode) => void
  label?: string
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label={label}>
      <button
        type="button"
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${value === 'cards' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
      >
        <LayoutGrid size={15} /> Cards
      </button>
      <button
        type="button"
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${value === 'graphs' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
        aria-pressed={value === 'graphs'}
        onClick={() => onChange('graphs')}
      >
        <BarChart3 size={15} /> Graphs
      </button>
    </div>
  )
}
