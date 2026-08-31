import { Search, X } from 'lucide-react'

export function SearchInput({ value, onChange, placeholder = 'Search…', className = 'min-w-56 flex-1' }: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" size={16} />
      <input
        className="field pl-9 pr-8"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors hover:bg-sunken hover:text-ink"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </label>
  )
}
