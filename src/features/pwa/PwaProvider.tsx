import { Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { PwaContext } from './PwaContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const updateServiceWorker = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedsRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
    })
  }, [])

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }, [installPrompt])

  return (
    <PwaContext.Provider value={{ canInstall: !!installPrompt, install }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2.5" aria-live="polite">
        {isOffline && (
          <div className="animate-overlay pointer-events-auto flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3 text-warn-ink shadow-overlay" role="status">
            <WifiOff className="mt-0.5 shrink-0" size={16} />
            <div>
              <strong className="font-medium">Attendly is offline</strong>
              <p className="mt-0.5 text-meta opacity-90">Cached pages remain available. Scans and changes need a connection.</p>
            </div>
          </div>
        )}
        {needsRefresh && (
          <div className="animate-overlay pointer-events-auto rounded-xl border border-line bg-surface p-3.5 shadow-overlay" role="alert">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 shrink-0 text-accent" size={16} />
              <div className="min-w-0 flex-1">
                <strong className="font-medium text-ink">An update is ready</strong>
                <p className="mt-0.5 text-meta text-muted">Finish any active scan, then refresh.</p>
              </div>
              <button type="button" className="icon-btn -mr-1.5 -mt-1.5 h-8 w-8" aria-label="Dismiss update" onClick={() => setNeedsRefresh(false)}>
                <X size={15} />
              </button>
            </div>
            <button type="button" className="btn-primary mt-3 w-full" onClick={() => void updateServiceWorker.current?.(true)}>
              <RefreshCw size={15} /> Update Attendly
            </button>
          </div>
        )}
        {offlineReady && !needsRefresh && (
          <div className="animate-overlay pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-overlay" role="status">
            <Download className="mt-0.5 shrink-0 text-ok" size={16} />
            <div className="min-w-0 flex-1">
              <strong className="font-medium text-ink">Ready for offline launch</strong>
              <p className="mt-0.5 text-meta text-muted">Attendance actions still require a connection.</p>
            </div>
            <button type="button" className="icon-btn -mr-1.5 -mt-1.5 h-8 w-8" aria-label="Dismiss notification" onClick={() => setOfflineReady(false)}>
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </PwaContext.Provider>
  )
}
