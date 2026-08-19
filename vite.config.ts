import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { version } from './package.json'

// https://vite.dev/config/
export default defineConfig({
  // Compile-time app version (from package.json) surfaced in the UI
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  // GitHub Pages serves from /<repo>/ — the deploy workflow passes --base
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
