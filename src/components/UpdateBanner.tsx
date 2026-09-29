import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR_MS = 3_600_000

/** Registers the service worker, and offers a reload when a new version has downloaded. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // The installed app can stay open for days, so look for a new version every hour.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), HOUR_MS)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="flex items-center gap-3 bg-leaf-fill px-4 py-2 text-sm text-leaf-strong">
      <span className="flex-1">A new version is ready.</span>
      <button type="button" className="min-h-11 px-2 font-semibold" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
      <button type="button" className="min-h-11 px-2 font-semibold" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  )
}
