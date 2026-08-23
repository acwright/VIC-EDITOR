/**
 * A stand-in for main's half of the migration (PLAN.md D19).
 *
 * The same idea as `documentBridge.ts`: a fake shaped like what main actually
 * does, so a spec cannot pass on behaviour the app could not produce. It keeps
 * a folder of files, suffixes a name that is taken, and holds the marker — and,
 * like the real one, it never touches browser storage. Removing the originals
 * is the renderer's to do and is what the specs here are mostly about.
 *
 * What it is not: a fake of the file mechanics. Those are `src/main/` and are
 * covered against a real disk in the node vitest project.
 */

import { DOCUMENT_EXTENSION } from '@shared/document'
import type { AppApi } from '@shared/api'
import type { MigrationDocument, MigrationFailure, MigrationWritten } from '@shared/document'

export interface FakeMigrationBridge {
  /** What `window.api.migration` would be. */
  api: AppApi['migration']
  /** The folder's contents, filename → text. */
  readonly files: Map<string, string>
  /** Whether the marker is set — i.e. the migration is over. */
  readonly done: boolean
  /** Pretend it already happened, the way a second launch finds it. */
  markDone(): void
  /** Make every write fail, the way a full or read-only disk would. */
  fail(reason: string): void
}

export function fakeMigrationBridge(folder = '~/Documents/VIC-20 Editor'): FakeMigrationBridge {
  const files = new Map<string, string>()
  let done = false
  let failure: string | null = null
  let directory = folder

  /** A filename nothing has taken, exactly as main's `freePath` does. */
  function freeName(name: string): string {
    for (let index = 1; ; index++) {
      const file = `${index === 1 ? name : `${name} ${index}`}.${DOCUMENT_EXTENSION}`
      if (!files.has(file)) return file
    }
  }

  return {
    files,
    get done() {
      return done
    },
    markDone() {
      done = true
    },
    fail(reason) {
      failure = reason
    },
    api: {
      async pending() {
        return !done
      },
      async folder() {
        return directory
      },
      async choose() {
        directory = '/elsewhere'
        return directory
      },
      async run(documents: MigrationDocument[]) {
        const written: MigrationWritten[] = []
        const failed: MigrationFailure[] = []
        for (const document of documents) {
          if (failure) {
            failed.push({ id: document.id, name: document.name, reason: failure })
            continue
          }
          const file = freeName(document.name)
          files.set(file, document.text)
          written.push({ id: document.id, file })
        }
        // The marker follows the writes, not the request: a run that wrote
        // nothing has not happened (D19).
        if (written.length > 0) done = true
        return { folder: directory, written, failed, done: written.length > 0 }
      },
    },
  }
}
