import { Search, X } from 'lucide-react'

export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="relative block min-w-64 flex-1">
      <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
      <input className="field pl-10 pr-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => onChange('')} aria-label="Clear search"><X size={16} /></button>}
    </label>
  )
}
