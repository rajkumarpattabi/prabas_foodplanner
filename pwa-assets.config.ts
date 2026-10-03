import { defineConfig } from '@vite-pwa/assets-generator/config'

// Generates the PNG icons from public/icons/icon.svg. Run `npm run icons` after editing the SVG.
// The SVG is the sadya photo on a full turmeric background. The maskable icon is shrunk
// by 18% on each side (on the same turmeric), so the food stays inside Android's safe zone.
const turmeric = { background: '#FAEEDA', fit: 'contain' } as const

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [192, 512], favicons: [[48, 'favicon.ico']], padding: 0, resizeOptions: turmeric },
    maskable: { sizes: [512], padding: 0.18, resizeOptions: turmeric },
    apple: { sizes: [180], padding: 0, resizeOptions: turmeric },
  },
  images: ['public/icons/icon.svg'],
})
