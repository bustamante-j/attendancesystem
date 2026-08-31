import { BarChart3, LayoutGrid } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'

export type ViewMode = 'cards' | 'graphs'

const options = [
  { value: 'cards' as const, label: 'Summary', icon: LayoutGrid },
  { value: 'graphs' as const, label: 'Charts', icon: BarChart3 },
]

export function ViewModeToggle({ value, onChange, label = 'Analytics view' }: {
  value: ViewMode
  onChange: (value: ViewMode) => void
  label?: string
}) {
  return <SegmentedControl value={value} options={options} onChange={onChange} label={label} />
}
