import { useContext } from 'react'
import { PwaContext } from './PwaContext'

export function usePwaInstall() {
  return useContext(PwaContext)
}
