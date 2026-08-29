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
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
        {isOffline && (
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" role="status">
            <WifiOff className="mt-0.5 shrink-0" size={19} />
            <div><strong className="text-sm">Attendly is offline</strong><p className="mt-0.5 text-xs leading-5 opacity-80">Cached pages remain available. Scans and changes require an internet connection.</p></div>
          </div>
        )}
        {needsRefresh && (
          <div className="pointer-events-auto rounded-2xl border border-blue-200 bg-white p-4 shadow-xl dark:border-blue-900 dark:bg-slate-900" role="alert">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" size={19} />
              <div className="min-w-0 flex-1"><strong className="text-sm">An Attendly update is ready</strong><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Finish any active scan, then refresh to use the latest version.</p></div>
              <button type="button" className="icon-btn -mr-2 -mt-2" aria-label="Dismiss update" onClick={() => setNeedsRefresh(false)}><X size={17} /></button>
            </div>
            <button type="button" className="btn-primary mt-3 w-full" onClick={() => void updateServiceWorker.current?.(true)}><RefreshCw size={16} /> Update Attendly</button>
          </div>
        )}
        {offlineReady && !needsRefresh && (
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl dark:border-emerald-900 dark:bg-slate-900" role="status">
            <Download className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" size={19} />
            <div className="min-w-0 flex-1"><strong className="text-sm">Attendly is ready for offline launch</strong><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Attendance actions still require a connection.</p></div>
            <button type="button" className="icon-btn -mr-2 -mt-2" aria-label="Dismiss notification" onClick={() => setOfflineReady(false)}><X size={17} /></button>
          </div>
        )}
      </div>
    </PwaContext.Provider>
  )
}
