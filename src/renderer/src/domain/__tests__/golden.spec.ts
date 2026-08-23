/**
 * Golden files for the git-first format (D4). These are checked-in documents,
 * not snapshots, so a formatting change shows up in review as a diff of the
 * thing users' repositories will hold — which is the whole point of the format.
 *
 * Run with `UPDATE_GOLDEN=1` to rewrite them after a *deliberate* change.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deserializeProject, serializeProject } from '../serialization'
import { GOLDEN_PROJECTS } from './goldenProjects'

const updating = process.env.UPDATE_GOLDEN === '1'

// From the repo root, which is vitest's root: `import.meta.url` is an
// http:// URL under the jsdom environment, not a file one.
const GOLDEN_DIR = 'src/renderer/src/domain/__tests__/golden'

function goldenPath(name: string): string {
  return resolve(process.cwd(), GOLDEN_DIR, `${name}.vic20`)
}

describe('golden documents', () => {
  it.each(GOLDEN_PROJECTS)('$name matches its golden file', ({ name, project }) => {
    const text = serializeProject(project)
    const path = goldenPath(name)
    if (updating) {
      writeFileSync(path, text)
      return
    }
    expect(text).toBe(readFileSync(path, 'utf8'))
  })

  it.each(GOLDEN_PROJECTS)('$name reserializes byte-identically', ({ name, project }) => {
    const text = updating ? serializeProject(project) : readFileSync(goldenPath(name), 'utf8')
    expect(serializeProject(deserializeProject(text))).toBe(text)
  })
})
