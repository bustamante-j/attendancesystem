import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

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
  const surfaceRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose()
      if (event.key !== 'Tab' || !surfaceRef.current) return
      const focusable = [...surfaceRef.current.querySelectorAll<HTMLElement>(focusableSelector)]
      if (!focusable.length) {
        event.preventDefault()
        surfaceRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => {
      const firstFocusable = surfaceRef.current?.querySelector<HTMLElement>(focusableSelector)
      ;(firstFocusable ?? surfaceRef.current)?.focus()
    })
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [closeDisabled, onClose])

  const widths = { md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[95vw]' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm print:static print:block print:bg-white print:p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div ref={surfaceRef} tabIndex={-1} className={`modal-surface max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-800 dark:bg-slate-900 print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none sm:rounded-2xl ${widths[size]}`}>
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
