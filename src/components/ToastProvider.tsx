import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastOptions } from './toastContext.ts'

interface ToastState extends ToastOptions {
  id: number
  message: string
}

/**
 * One toast at a time, shown just above the tab bar. Actions apply immediately and
 * offer Undo here, instead of asking for confirmation first.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const nextId = useRef(1)

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    setToast({ id: nextId.current++, message, ...options })
  }, [])

  useEffect(() => {
    if (!toast) return
    const ms = toast.duration ?? (toast.undo ? 6000 : 5000)
    const timer = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), ms)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
          >
            <span className="flex-1">{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                className="-my-2 min-h-11 px-2 font-semibold text-turmeric-fill"
                onClick={() => {
                  toast.undo?.()
                  setToast(null)
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
