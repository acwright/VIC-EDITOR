import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, defineProject, configDefaults } from 'vitest/config'
import viteConfig from './vite.web.config'

/**
 * Two suites, two environments (PLAN.md Phase F3).
 *
 * The renderer's specs run in jsdom, as they always have. The main process
 * cannot: it needs Node's real `fs`, and the renderer project's setup file
 * exists to paper over jsdom's storage. So `src/main/**` gets a project of its
 * own with `environment: 'node'` — the atomic write, the stamp and the filename
 * derivation are exactly the kind of logic that should not be verified only by
 * driving the app.
 *
 * `npm run test:unit` runs both. `vitest --project main` runs one.
 */

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        viteConfig,
        defineProject({
          // The web config roots itself at src/renderer/; tests run from the repo
          // root so vitest.setup.ts and the spec globs resolve as they always have.
          root,
          test: {
            name: 'renderer',
            environment: 'jsdom',
            // jsdom only provides localStorage for a non-opaque origin (not about:blank)
            environmentOptions: { jsdom: { url: 'http://localhost/' } },
            // Works around Node's experimental webstorage shadowing jsdom's localStorage
            setupFiles: ['./vitest.setup.ts'],
            include: ['src/renderer/**/*.spec.ts'],
            exclude: [...configDefaults.exclude, 'e2e/**'],
            root,
          },
        }),
      ),
      defineProject({
        root,
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.spec.ts'],
          root,
        },
      }),
    ],
  },
})
