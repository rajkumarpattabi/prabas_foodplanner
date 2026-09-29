import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from GitHub Pages at https://rajkumarpattabi.github.io/prabas_foodplanner/
export default defineConfig({
  base: '/prabas_foodplanner/',
  plugins: [react(), tailwindcss()],
})
