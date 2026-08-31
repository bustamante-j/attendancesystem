import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl', full: 'max-w-[95vw]' }

export function Modal({
  title,
  description,
  children,
  onClose,
  size = 'lg',
  closeDisabled = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  size?: keyof typeof widths
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] print:static print:block print:bg-white sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={`animate-overlay max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-overlay outline-none print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none sm:rounded-2xl ${widths[size]}`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur print:hidden">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink" id={titleId}>{title}</h2>
            {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
          </div>
          <button className="icon-btn -mr-1.5 h-8 w-8 shrink-0" onClick={onClose} disabled={closeDisabled} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        <div className="p-5 print:p-0">{children}</div>
      </div>
    </div>
  )
}

/** Consistent right-aligned footer for modal forms. */
export function ModalActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      {children}
    </div>
  )
}
