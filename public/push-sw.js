// Reminders: shown when the send-reminders function pushes one, and opening the app
// on the right tab when tapped. Loaded into the generated service worker with
// importScripts (see vite.config.ts), so it works with the app closed.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'PRABAS', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'PRABAS'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      // The same reminder again replaces the old one instead of piling up.
      tag: data.tag || undefined,
      icon: 'icons/pwa-192x192.png',
      badge: 'icons/pwa-192x192.png',
      data: { url: data.url || '/plan' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = String((event.notification.data && event.notification.data.url) || '/plan').replace(/^\//, '')
  const target = new URL(path, self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) {
          if ('navigate' in w) w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
