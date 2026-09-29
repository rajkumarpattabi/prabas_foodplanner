import { createContext, useContext } from 'react'

export interface ToastOptions {
  /** When given, the toast shows an Undo button that calls this. */
  undo?: () => void
  /** How long the toast stays, in ms. Defaults to 5 seconds, or 6 with undo. */
  duration?: number
}

export type ShowToast = (message: string, options?: ToastOptions) => void

export const ToastContext = createContext<ShowToast | null>(null)

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
