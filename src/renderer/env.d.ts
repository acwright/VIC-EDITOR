/// <reference types="vite/client" />

/** App version, injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string

/**
 * Where the app is published on the web (PLAN.md D21), injected at build time
 * by both configs. The desktop shell has no origin a share link can be opened
 * from — its own is `app://vic20/` — so a link made there is rooted here.
 */
declare const __WEB_APP_URL__: string
