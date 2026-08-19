/**
 * Label casing for assembly export. Segments carry canonical
 * snake_case labels; this is the render-time transform into the user's chosen
 * convention.
 *
 * Only cases that are valid assembler identifiers are offered — kebab/train
 * case would emit a `-` operator and fail to assemble.
 */

export type LabelCase = 'snake' | 'upper' | 'camel' | 'pascal'

export const DEFAULT_LABEL_CASE: LabelCase = 'snake'

export interface LabelCaseInfo {
  id: LabelCase
  /** Picker label. */
  label: string
  /** Rendering of `char_patterns`, shown as the picker's hint. */
  example: string
}

export const LABEL_CASES: readonly LabelCaseInfo[] = [
  { id: 'snake', label: 'snake_case', example: 'char_patterns' },
  { id: 'upper', label: 'ALL CAPS', example: 'CHAR_PATTERNS' },
  { id: 'camel', label: 'camelCase', example: 'charPatterns' },
  { id: 'pascal', label: 'PascalCase', example: 'CharPatterns' },
]

export function isLabelCase(value: unknown): value is LabelCase {
  return LABEL_CASES.some((c) => c.id === value)
}

function capitalize(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1)
}

/** Recase a canonical snake_case label. Empty/odd input passes through. */
export function applyLabelCase(label: string, labelCase: LabelCase): string {
  if (labelCase === 'snake') return label
  if (labelCase === 'upper') return label.toUpperCase()
  const tokens = label.split('_').filter((t) => t.length > 0)
  if (tokens.length === 0) return label
  const joined = tokens.map(capitalize).join('')
  return labelCase === 'pascal' ? joined : joined.charAt(0).toLowerCase() + joined.slice(1)
}
