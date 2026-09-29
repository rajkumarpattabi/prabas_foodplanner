import { createContext, useContext } from 'react'
import type { BackupApi } from './api.ts'

export const BackupApiContext = createContext<BackupApi | null>(null)

export function useBackupApi(): BackupApi {
  const api = useContext(BackupApiContext)
  if (!api) throw new Error('useBackupApi must be used inside BackupApiContext')
  return api
}
