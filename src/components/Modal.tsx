import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'

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
  const titleId = useId()
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [closeDisabled, onClose])

  const widths = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[95vw]' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm print:static print:block print:bg-white print:p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={`modal-surface max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none sm:rounded-2xl ${widths[size]}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 print:hidden">
          <h2 className="text-lg font-bold tracking-tight" id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} disabled={closeDisabled} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 print:p-0">{children}</div>
      </div>
    </div>
  )
}
