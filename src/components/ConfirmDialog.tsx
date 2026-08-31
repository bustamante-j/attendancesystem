import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Modal, ModalActions } from './Modal'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  tone?: 'primary' | 'danger'
}

interface PendingConfirmation extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending({ ...options, resolve })
  }), [])
  const respond = (confirmed: boolean) => {
    pending?.resolve(confirmed)
    setPending(null)
  }
  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => respond(false)} size="sm">
          <p className="text-base leading-relaxed text-muted">{pending.message}</p>
          <ModalActions>
            <button className="btn-secondary" autoFocus onClick={() => respond(false)}>Cancel</button>
            <button className={pending.tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={() => respond(true)}>
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </ModalActions>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider.')
  return context
}
