import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.web.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    // The web config roots itself at src/renderer/; tests run from the repo
    // root so vitest.setup.ts and the spec globs resolve as they always have.
    root: fileURLToPath(new URL('./', import.meta.url)),
    test: {
      environment: 'jsdom',
      // jsdom only provides localStorage for a non-opaque origin (not about:blank)
      environmentOptions: { jsdom: { url: 'http://localhost/' } },
      // Works around Node's experimental webstorage shadowing jsdom's localStorage
      setupFiles: ['./vitest.setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
