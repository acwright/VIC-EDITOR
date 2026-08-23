/**
 * A stand-in for the preload bridge, whole.
 *
 * `AppApi` is deliberately exhaustive — `satisfies AppApi` in a spec is what
 * catches a surface added on one side of the bridge and not the other — so a
 * stub has to carry every branch of it, and three specs were carrying the same
 * one. They build from this instead, overriding the branch they are about.
 */

import { vi } from 'vitest'
import type { AppApi } from '@shared/api'

/** The document surface, answering "nothing is open" to everything. */
export const stubDocumentApi: AppApi['document'] = {
  create: () => Promise.resolve({ status: 'none' }),
  open: () => Promise.resolve(),
  onPending: () => () => {},
  takePending: () => Promise.resolve({ status: 'none' }),
  dropped: () => {},
  recent: () => Promise.resolve([]),
  openRecent: () => Promise.resolve(),
  current: () => Promise.resolve({ status: 'none' }),
  write: () => Promise.resolve({ status: 'none' }),
  onChanged: () => () => {},
  close: () => Promise.resolve(),
  reveal: () => Promise.resolve(),
  defaultLocation: () => Promise.resolve('/documents'),
  chooseLocation: () => Promise.resolve(null),
}

/** The migration surface, answering "there is nothing to migrate" (D19). */
export const stubMigrationApi: AppApi['migration'] = {
  pending: () => Promise.resolve(false),
  folder: () => Promise.resolve('/documents'),
  choose: () => Promise.resolve(null),
  run: () => Promise.resolve({ folder: '/documents', written: [], failed: [], done: false }),
}

/** The whole bridge, inert. Spread it and replace what the spec is about. */
export function stubApi(overrides: Partial<AppApi> = {}): AppApi {
  return {
    app: {
      getVersion: () => Promise.resolve('1.0.0'),
      platform: 'darwin',
      onBeforeQuit: () => () => {},
      saveComplete: () => {},
    },
    files: {
      save: () => Promise.resolve(null),
      openText: () => Promise.resolve(null),
    },
    document: stubDocumentApi,
    migration: stubMigrationApi,
    menu: {
      setContext: vi.fn<() => void>(),
      onAction: () => () => {},
    },
    ...overrides,
  }
}
