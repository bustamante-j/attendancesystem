import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({
  title,
  children,
  onClose,
  size = 'lg',
  closeDisabled = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  size?: 'md' | 'lg' | 'xl' | 'full'
  closeDisabled?: boolean
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeDisabled, onClose])

  const widths = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[95vw]' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 print:static print:block print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none ${widths[size]}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 print:hidden">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} disabled={closeDisabled} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 print:p-0">{children}</div>
      </div>
    </div>
  )
}
