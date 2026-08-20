/**
 * User preferences — small, non-project settings that should outlive a session.
 * One localStorage key holding a JSON record;
 * unreadable, corrupt, or unavailable storage falls back to the defaults so a
 * preference can never break the app.
 */

import { DEFAULT_ASM_DIALECT, isAsmDialectId, type AsmDialectId } from '@/domain/export/assembly'
import { DEFAULT_LABEL_CASE, isLabelCase, type LabelCase } from '@/domain/export/labels'
import { DEFAULT_CHARSET_VIEW, isCharsetView, type CharsetView } from '@/utils/charsetView'
import type { KVStorage } from './repository'

export const PREFERENCES_KEY = 'vic20-editor:prefs'

export interface Preferences {
  /** Casing applied to labels in assembly exports. */
  labelCase: LabelCase
  /** Which assembler's syntax the assembly export emits. */
  asmDialect: AsmDialectId
  /** How the character-set picker lays its glyphs out. */
  charsetView: CharsetView
}

export const DEFAULT_PREFERENCES: Preferences = {
  labelCase: DEFAULT_LABEL_CASE,
  asmDialect: DEFAULT_ASM_DIALECT,
  charsetView: DEFAULT_CHARSET_VIEW,
}

function safeStorage(storage?: KVStorage): KVStorage | null {
  if (storage) return storage
  try {
    return localStorage
  } catch {
    return null // storage disabled (e.g. blocked third-party context)
  }
}

/** Read stored preferences, filling in defaults for anything missing or invalid. */
export function loadPreferences(storage?: KVStorage): Preferences {
  const kv = safeStorage(storage)
  let raw: string | null = null
  try {
    raw = kv?.getItem(PREFERENCES_KEY) ?? null
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
  if (!raw) return { ...DEFAULT_PREFERENCES }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_PREFERENCES }
  }
  const p = parsed as Record<string, unknown>
  return {
    labelCase: isLabelCase(p.labelCase) ? p.labelCase : DEFAULT_PREFERENCES.labelCase,
    asmDialect: isAsmDialectId(p.asmDialect) ? p.asmDialect : DEFAULT_PREFERENCES.asmDialect,
    charsetView: isCharsetView(p.charsetView) ? p.charsetView : DEFAULT_PREFERENCES.charsetView,
  }
}

/** Merge a patch into stored preferences. Write failures are ignored. */
export function savePreferences(patch: Partial<Preferences>, storage?: KVStorage): Preferences {
  const next = { ...loadPreferences(storage), ...patch }
  try {
    safeStorage(storage)?.setItem(PREFERENCES_KEY, JSON.stringify(next))
  } catch {
    // A full or read-only store just means the choice doesn't persist.
  }
  return next
}
