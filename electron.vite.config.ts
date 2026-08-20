import { fileURLToPath, URL } from 'node:url'

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

import { version } from './package.json'

const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Restore `base: '/'` for the renderer.
 *
 * electron-vite's renderer preset forces `'./'` on every production build so
 * that assets resolve under `file://`. We serve over `app://` instead (D3),
 * where absolute paths are correct — and the router depends on it:
 * `createWebHistory(import.meta.env.BASE_URL)` given `'./'` resolves every
 * route back to `/`, so deep links and reloads land on the project manager.
 *
 * The preset's `config` hook is `enforce: 'pre'` and assigns `base` outright,
 * so this has to be a plugin of its own — an unenforced one, which Vite merges
 * afterwards — rather than a `base` key in the config below. electron-vite's
 * own validator accepts `'/'`; it is only unreachable, not unsupported.
 */
function absoluteBase(): Plugin {
  return {
    name: 'app-scheme-absolute-base',
    config: () => ({ base: '/' }),
  }
}

/**
 * The Electron build. Its renderer is the same source tree the web build
 * compiles (`vite.web.config.ts`) — same alias, same version define, same
 * router. The two configs differ only in what surrounds that tree.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolvePath('./src/renderer'),
    publicDir: resolvePath('./src/renderer/public'),
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    resolve: {
      alias: {
        '@': resolvePath('./src/renderer/src'),
        // Types the renderer shares with the preload bridge.
        '@shared': resolvePath('./src/shared'),
      },
    },
    // No vue-devtools here: it injects an overlay and a dev-server-hosted
    // iframe, neither of which belongs in a native window.
    plugins: [absoluteBase(), vue(), tailwindcss()],
  },
})
