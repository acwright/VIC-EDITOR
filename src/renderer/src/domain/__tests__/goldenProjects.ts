/**
 * Fixed projects behind the golden files (Document Storage plan, F2). Every
 * field that would otherwise vary — the id and the two timestamps — is pinned,
 * and each project carries a little real content so a regression in *any* of
 * D4's chunking rules shows up as a diff rather than in a sea of spaces.
 */

import { createProject } from '../factory'
import type { Project, ProjectType, ProjectSettings } from '../types'

const GOLDEN_ID = '00000000-0000-4000-8000-000000000001'
const GOLDEN_DATE = '2026-01-01T00:00:00.000Z'

/** An arrow, so a pattern line is recognisable in the file. */
const ARROW = [0x18, 0x3c, 0x7e, 0xff, 0x18, 0x18, 0x18, 0x00]

export interface GoldenProject {
  /** Also the golden file's basename. */
  name: string
  project: Project
}

function build(
  name: string,
  type: ProjectType,
  settings?: Partial<ProjectSettings>,
): GoldenProject {
  const project = createProject({ name, type, settings, seed: 'blank' })
  project.id = GOLDEN_ID
  project.createdAt = GOLDEN_DATE
  project.modifiedAt = GOLDEN_DATE

  const { charHeight } = project.settings
  project.charset[1] = Array.from({ length: charHeight }, (_, row) => ARROW[row % 8]!)
  project.charset[2] = Array.from({ length: charHeight }, (_, row) => row + 1)

  if (project.charModes) {
    project.charModes[2] = true
    project.charModes[5] = true
  }

  const screen = project.screens[0]!
  const { columns } = project.settings
  screen.name = 'Golden'
  // One cell on each of the first two rows, so the row chunking is visible.
  screen.cells[1] = 1
  screen.cells[columns + 2] = 2
  screen.colors[1] = 2
  screen.colors[columns + 2] = 5

  return { name, project }
}

export const GOLDEN_PROJECTS: GoldenProject[] = [
  build('hires', 'hires'),
  build('multicolor', 'multicolor'),
  build('mixed', 'mixed'),
  // The other geometry the format has to cope with: 16-row characters, a
  // 64-character set and a wider screen than the power-on 22 × 23.
  build('hires-tall', 'hires', { charHeight: 16, charCount: 64, columns: 20, rows: 12 }),
]
