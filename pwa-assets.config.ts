import { defineConfig } from '@vite-pwa/assets-generator/config'

// Generates the PNG icons from public/icons/icon.svg. Run `npm run icons` after editing the SVG.
// The SVG already has a full cream background and keeps the leaf inside the maskable
// safe zone, so no extra padding is added.
const cream = { background: '#FBF8F1', fit: 'contain' } as const

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [192, 512], favicons: [[48, 'favicon.ico']], padding: 0, resizeOptions: cream },
    maskable: { sizes: [512], padding: 0, resizeOptions: cream },
    apple: { sizes: [180], padding: 0, resizeOptions: cream },
  },
  images: ['public/icons/icon.svg'],
})
