#!/usr/bin/env node
/**
 * Download the Electron binary after `npm install`.
 *
 * The `electron` package used to do this from its own `postinstall`; as of v43
 * its package.json has no scripts at all, so the download is ours to trigger —
 * hence the `postinstall` in package.json that runs this file.
 *
 * Doing it here rather than calling `node node_modules/electron/install.js`
 * directly buys one thing: `install.js` has no opt-out, and CI does not need a
 * 100 MB binary to lint, typecheck, test, or bundle the main process. Setting
 * ELECTRON_SKIP_BINARY_DOWNLOAD=1 skips it — the same variable electron's own
 * installer honoured before v43, kept so the workflows read the way they do
 * everywhere else. Only running the app needs the binary.
 */
import { createRequire } from 'node:module'

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  console.log('[electron] ELECTRON_SKIP_BINARY_DOWNLOAD is set — skipping the binary download.')
  process.exit(0)
}

const require = createRequire(import.meta.url)
require('electron/install.js')
