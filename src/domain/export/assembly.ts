/**
 * Assembler output. One builder parameterized by assembler dialect: the VIC-20
 * is 6502-only, so the dialects differ in nothing but their byte directive and
 * the file extension their toolchain expects (PLAN.md D12).
 *
 * Labels sit at column 0; data lines are indented so col-0-label assemblers
 * don't misparse the directive. All three dialects take `;` comments.
 */

import type { ByteSegment } from './tables'
import { applyLabelCase, DEFAULT_LABEL_CASE, type LabelCase } from './labels'

export type AsmDialectId = 'ca65' | 'acme' | 'dasm'

export interface AsmDialect {
  id: AsmDialectId
  /** Picker label — the assembler's own name. */
  label: string
  /** Header-comment name identifying the target. */
  description: string
  /** The define-bytes directive. */
  directive: string
  extension: string
}

export const ASM_DIALECTS: Record<AsmDialectId, AsmDialect> = {
  ca65: {
    id: 'ca65',
    label: 'ca65 / 64tass',
    description: '6502 assembly (ca65 / 64tass)',
    directive: '.byte',
    extension: '.s',
  },
  acme: {
    id: 'acme',
    label: 'ACME',
    description: '6502 assembly (ACME)',
    directive: '!byte',
    extension: '.a',
  },
  dasm: {
    id: 'dasm',
    label: 'DASM',
    description: '6502 assembly (DASM)',
    directive: 'dc.b',
    extension: '.asm',
  },
}

/** Every dialect, in presentation order. */
export const ASM_DIALECT_LIST: readonly AsmDialect[] = [
  ASM_DIALECTS.ca65,
  ASM_DIALECTS.acme,
  ASM_DIALECTS.dasm,
]

export const DEFAULT_ASM_DIALECT: AsmDialectId = 'ca65'

export function isAsmDialectId(value: unknown): value is AsmDialectId {
  return typeof value === 'string' && value in ASM_DIALECTS
}

const INDENT = '    '

function hex(byte: number): string {
  return '$' + byte.toString(16).toUpperCase().padStart(2, '0')
}

/** `$1C00` — a 16-bit address the one way, for comments. */
export function hexAddress(address: number): string {
  return '$' + address.toString(16).toUpperCase().padStart(4, '0')
}

export interface AsmOptions {
  /** Casing applied to the segments' canonical snake_case labels. */
  labelCase: LabelCase
}

/** Render labeled byte segments as assembler source for `dialect`. */
export function segmentsToAsm(
  segments: ByteSegment[],
  dialect: AsmDialect,
  title: string,
  options: AsmOptions = { labelCase: DEFAULT_LABEL_CASE },
): string {
  const lines: string[] = [
    `; ${title}`,
    `; ${dialect.description} — exported from VIC-20 Editor`,
    '',
  ]
  for (const seg of segments) {
    lines.push(`; ${seg.description} — ${seg.bytes.length} bytes @ ${hexAddress(seg.loadAddress)}`)
    lines.push(`${applyLabelCase(seg.label, options.labelCase)}:`)
    for (let i = 0; i < seg.bytes.length; i += seg.perLine) {
      const row = seg.bytes
        .slice(i, i + seg.perLine)
        .map(hex)
        .join(', ')
      lines.push(`${INDENT}${dialect.directive} ${row}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
