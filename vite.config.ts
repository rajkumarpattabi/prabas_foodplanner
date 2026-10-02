import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/prabas_foodplanner/'

// Served from GitHub Pages at https://rajkumarpattabi.github.io/prabas_foodplanner/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the user taps Reload (see UpdateBanner), so an
      // update never reloads the page in the middle of something.
      registerType: 'prompt',
      includeAssets: ['icons/favicon.ico', 'icons/apple-touch-icon-180x180.png', 'icons/icon.svg'],
      manifest: {
        name: 'PRABAS Food Planner',
        short_name: 'PRABAS',
        description: 'What do we cook next? A shared household meal planner.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF8F1',
        theme_color: '#FBF8F1',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell. The one runtime route is the bill reader's engine from
        // jsDelivr (versioned files, so they never change), kept so scanning works offline
        // after the first time; Tesseract keeps its language data itself. Every other
        // cross-origin request (Supabase, Google sign-in, Drive) goes straight to the network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/tesseract'),
            handler: 'CacheFirst',
            options: { cacheName: 'bill-reader', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Showing reminders, and opening the app when one is tapped (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
})
