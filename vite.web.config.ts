import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { version } from './package.json'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// The standalone web build (GitHub Pages). The Electron build consumes the same
// renderer sources through electron.vite.config.ts.
// https://vite.dev/config/
export default defineConfig({
  // The renderer lives under src/renderer/ so the Electron main and preload
  // processes can sit beside it without sharing a source tree.
  root: resolvePath('./src/renderer'),
  publicDir: resolvePath('./src/renderer/public'),
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
      '@': resolvePath('./src/renderer/src'),
      // Types the renderer shares with the preload bridge.
      '@shared': resolvePath('./src/shared'),
    },
  },
  build: {
    // Outside `root`, so emptying it has to be opted into explicitly.
    outDir: resolvePath('./dist/web'),
    emptyOutDir: true,
  },
})
