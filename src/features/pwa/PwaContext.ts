import { createContext } from 'react'

export interface PwaContextValue {
  canInstall: boolean
  install: () => Promise<void>
}

export const PwaContext = createContext<PwaContextValue>({ canInstall: false, install: async () => undefined })
