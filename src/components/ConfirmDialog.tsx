import { AlertTriangle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

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
        <Modal title={pending.title} onClose={() => respond(false)} size="md">
          <div className="space-y-5">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${pending.tone === 'danger' ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'}`}>
              <AlertTriangle size={24} />
            </div>
            <p className="leading-6 text-slate-600 dark:text-slate-300">{pending.message}</p>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row sm:justify-end">
              <button className="btn-secondary" autoFocus onClick={() => respond(false)}>Cancel</button>
              <button className={pending.tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={() => respond(true)}>{pending.confirmLabel ?? 'Confirm'}</button>
            </div>
          </div>
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
