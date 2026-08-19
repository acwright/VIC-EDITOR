<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Grid2x2, RotateCcw, Wand2 } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import ColorSlotField from './ColorSlotField.vue'
import RegisterReadout from './RegisterReadout.vue'
import { CHAR_COUNTS, CHAR_HEIGHTS, MODES } from '@/domain/modes'
import type { CharCount, CharHeight, Expansion, ProjectType, VideoStandard } from '@/domain/types'
import type { Geometry } from '@/domain/screenOps'
import {
  CHAR_BASE_OPTIONS,
  EXPANSIONS,
  MAX_CELLS,
  MAX_COLUMNS,
  MAX_ROWS,
  SCREEN_BASE_OPTIONS,
  charBaseAddress,
  colorRamAddress,
  defaultOrigins,
  expansionLabel,
  validateGeometry,
} from '@/domain/vic'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

/**
 * The project's control panel (PLAN.md Phase 6): geometry, character set,
 * global colors, video standard, memory layout, and the live $9000–$900F
 * block underneath them all (D14).
 *
 * Every field here is a register field, so every field is an undoable command
 * on the project — and the three that throw content away (a geometry crop, a
 * shorter character, a smaller set) say what they would cost and ask first.
 */
const open = defineModel<boolean>({ required: true })

const projects = useProjectsStore()
const editor = useEditorStore()

const settings = computed(() => projects.current?.settings ?? null)

function hex(value: number, digits = 4): string {
  return '$' + value.toString(16).toUpperCase().padStart(digits, '0')
}

/** Shared field chrome — a form this dense is unreadable with it inlined. */
const CONTROL =
  'h-9 rounded-sm border border-ink-700 bg-ink-900 px-2.5 font-mono text-sm text-ink-100 transition-colors hover:border-ink-500 focus:border-ink-300 focus:outline-none'
const CARD = 'flex flex-col gap-1.5 rounded-sm border border-ink-700 bg-ink-850 px-3 py-2'
const LEGEND = 'font-display mb-1 block text-sm tracking-wider text-ink-400'

// --- Confirmation (one dialog, whichever destructive change asked for it) ---

interface Confirmation {
  title: string
  message: string
  /** Label of the button that goes ahead — also its accessible name. */
  confirmLabel: string
  act: () => void
}

const confirmation = ref<Confirmation | null>(null)

const confirming = computed({
  get: () => confirmation.value !== null,
  set: (value: boolean) => {
    if (!value) confirmation.value = null
  },
})

/** Run `request.act` now, or after a confirmation when `lost` is non-zero. */
function guard(lost: number, request: Confirmation): void {
  if (lost > 0) confirmation.value = request
  else request.act()
}

function confirmNow(): void {
  const request = confirmation.value
  confirmation.value = null
  request?.act()
}

// --- Geometry (D8, D9) ---

/** Edited separately from the project: a resize is applied, not typed into. */
const draft = ref<Geometry>({ columns: 0, rows: 0 })

function syncDraft(): void {
  draft.value = { ...editor.geometry }
}

// Re-read on open, and whenever the geometry changes underneath (undo, redo)
watch([open, () => editor.geometry.columns, () => editor.geometry.rows], syncDraft, {
  immediate: true,
})

const status = computed(() => validateGeometry(draft.value))

const changed = computed(
  () =>
    draft.value.columns !== editor.geometry.columns || draft.value.rows !== editor.geometry.rows,
)

/** Why the typed geometry cannot be applied, or null when it can (D9). */
const geometryError = computed(() => {
  if (status.value.ok) return null
  if (!status.value.inRange) return `Columns 1–${MAX_COLUMNS}, rows 1–${MAX_ROWS}`
  return `${status.value.cells} cells exceeds the ${MAX_CELLS} the color RAM holds`
})

/** Characters a resize would crop, across every screen. */
const loss = computed(() => (changed.value ? editor.resizeLoss(draft.value) : 0))

const lossMessage = computed(() => {
  const screens = projects.current?.screens.length ?? 1
  const cells = `${loss.value} ${loss.value === 1 ? 'character' : 'characters'}`
  const where = screens === 1 ? 'this screen' : `${screens} screens`
  return `Resizing to ${draft.value.columns} × ${draft.value.rows} crops ${cells} from ${where}. Content outside the new bounds is discarded, measured from the top-left.`
})

function applyGeometry(): void {
  if (!changed.value || !status.value.ok) return
  const to = { ...draft.value }
  // Cropping is destructive, so it is confirmed rather than just undoable (D8)
  guard(loss.value, {
    title: 'Resize Screens',
    message: lossMessage.value,
    confirmLabel: 'Resize',
    act: () => editor.setGeometry(to),
  })
}

/** Character height is a register bit, so it reshapes every glyph at once (D3). */
function chooseCharHeight(height: CharHeight): void {
  if (!settings.value || settings.value.charHeight === height) return
  const lost = editor.charHeightLoss(height)
  const glyphs = `${lost} ${lost === 1 ? 'character' : 'characters'}`
  guard(lost, {
    title: 'Change Character Height',
    message: `Dropping to 8 × ${height} discards the bottom ${settings.value.charHeight - height} rows of ${glyphs}. Everything else keeps its top ${height} rows.`,
    confirmLabel: 'Change Height',
    act: () => editor.setCharHeight(height),
  })
}

// --- Characters (D4) ---

/** What a cell is made of, per project type — the one thing here that is fixed. */
const TYPE_NOTES: Record<ProjectType, string> = {
  hires: 'every cell is 8 one-bit pixels',
  multicolor: 'every cell is 4 double-wide 2-bit pixels',
  mixed: 'each character decides whether its cell is hires or multicolor (D2)',
}

const typeNote = computed(() => {
  const type = projects.current?.type
  if (!type) return ''
  return `${MODES[type].label} project — ${TYPE_NOTES[type]}. A project's type is fixed when it is created.`
})

function chooseCharCount(count: CharCount): void {
  if (!settings.value || settings.value.charCount === count) return
  const lost = editor.charCountLoss(count)
  const glyphs = `${lost} drawn ${lost === 1 ? 'character' : 'characters'}`
  guard(lost, {
    title: 'Change Character Count',
    message: `Shrinking to ${count} characters discards ${glyphs} above code ${count - 1}. Screens keep the codes they hold — a screen code is a full byte whatever the set contains — so those cells would draw blanks.`,
    confirmLabel: 'Change Count',
    act: () => editor.setCharCount(count),
  })
}

// --- Video (§2.6) ---

const origins = computed(() => defaultOrigins(settings.value?.video ?? 'ntsc'))

const VIDEO_OPTIONS: readonly { value: VideoStandard; label: string }[] = [
  { value: 'ntsc', label: 'NTSC' },
  { value: 'pal', label: 'PAL' },
]

/** Reverse mode is one register bit, and every hires cell turns with it. */
const REVERSE_OPTIONS = [
  { value: false, label: 'Normal' },
  { value: true, label: 'Reverse' },
] as const

// --- Memory (§2.4) ---

const expansionOptions = EXPANSIONS.map((value) => ({ value, label: expansionLabel(value) }))

const charBaseOptions = CHAR_BASE_OPTIONS.map((option) => ({
  ...option,
  label: `${hex(option.address)} (${option.value}) — ${option.note}`,
}))

const screenBaseOptions = SCREEN_BASE_OPTIONS.map((address) => ({
  address,
  label: `${hex(address)} — color RAM ${hex(colorRamAddress(address))}`,
}))

/** The layout the fitted expansion conventionally uses, offered not imposed. */
const presetNote = computed(() => {
  const preset = editor.memoryPreset
  return `The ${expansionLabel(settings.value?.expansion ?? 'none')} layout puts the screen at ${hex(preset.screenBase)} and the character set at ${hex(charBaseAddress(preset.charBase))} (${preset.charBase}).`
})

function onExpansion(event: Event): void {
  editor.setExpansion((event.target as HTMLSelectElement).value as Expansion)
}

function onCharBase(event: Event): void {
  editor.setCharBase(Number((event.target as HTMLSelectElement).value))
}

function onScreenBase(event: Event): void {
  editor.setScreenBase(Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <AppDialog v-model="open" title="Project Settings" size="lg">
    <!-- The color swatches and the register block make this the tallest dialog
         in the app; scroll it rather than let it run off a short viewport. -->
    <div v-if="settings" class="flex max-h-[70dvh] flex-col overflow-y-auto">
      <section class="flex flex-col gap-1.5" aria-label="Screen geometry">
        <h3 class="font-display text-lg tracking-wider">Geometry</h3>
        <p class="text-xs text-ink-500">
          Columns and rows are registers, so every screen in the project shares them (D8).
        </p>

        <div :class="CARD">
          <div class="flex flex-wrap items-end gap-3">
            <label class="block">
              <span :class="LEGEND">Columns</span>
              <input
                v-model.number="draft.columns"
                type="number"
                :min="1"
                :max="MAX_COLUMNS"
                aria-label="Columns"
                :class="[CONTROL, 'w-20']"
              />
            </label>
            <label class="block">
              <span :class="LEGEND">Rows</span>
              <input
                v-model.number="draft.rows"
                type="number"
                :min="1"
                :max="MAX_ROWS"
                aria-label="Rows"
                :class="[CONTROL, 'w-20']"
              />
            </label>

            <!-- The color RAM budget, live as you type (D9) -->
            <p
              class="mb-2 font-mono text-xs [font-variant-numeric:tabular-nums]"
              :class="status.overBudget ? 'text-red-400' : 'text-ink-400'"
            >
              {{ status.cells }} / {{ MAX_CELLS }} cells
            </p>

            <div class="mb-1 ml-auto flex gap-1">
              <AppButton
                label="Revert Geometry"
                :disabled="!changed"
                disabled-reason="the geometry is unchanged"
                @click="syncDraft"
              >
                <RotateCcw class="size-4" />
              </AppButton>
              <AppButton
                label="Resize Screens"
                show-label
                :disabled="!changed || !status.ok"
                :disabled-reason="
                  changed ? (geometryError ?? undefined) : 'the geometry is unchanged'
                "
                @click="applyGeometry"
              >
                <Grid2x2 class="size-4" />
              </AppButton>
            </div>
          </div>

          <p v-if="geometryError" class="text-xs text-red-400">{{ geometryError }}</p>
          <p v-else-if="status.nonDefault" class="text-xs text-amber-400">
            Larger than the machine's power-on 22 × 23 — legal, but it needs the display origins
            moved to be fully visible.
          </p>
          <p v-else-if="changed && loss > 0" class="text-xs text-amber-400">
            Crops {{ loss }} {{ loss === 1 ? 'character' : 'characters' }} — you'll be asked to
            confirm.
          </p>
          <p v-else class="text-xs text-ink-500">
            Screens are re-fitted from the top-left: new cells are blank, cropped ones are
            discarded.
          </p>
        </div>

        <div :class="CARD">
          <div class="flex items-center justify-between gap-3">
            <span class="font-display text-base tracking-wider">Character Height</span>
            <div class="flex gap-1" role="radiogroup" aria-label="Character height">
              <button
                v-for="option in CHAR_HEIGHTS"
                :key="option"
                type="button"
                class="rounded-sm border px-2 py-1 font-mono text-xs transition-colors"
                :class="
                  settings.charHeight === option
                    ? 'border-ink-300 bg-ink-100 text-ink-950'
                    : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
                "
                role="radio"
                :aria-checked="settings.charHeight === option"
                :aria-label="`8 × ${option}`"
                @click="chooseCharHeight(option)"
              >
                8 × {{ option }}
              </button>
            </div>
          </div>
          <p class="text-xs text-ink-500">
            $9003 bit 0. Taller characters halve how many rows fit on a screen and double the
            character set's size in memory.
          </p>
        </div>
      </section>

      <hr class="my-3 border-ink-800" />

      <section class="flex flex-col gap-1.5" aria-label="Character set">
        <h3 class="font-display text-lg tracking-wider">Characters</h3>
        <p class="text-xs text-ink-500">{{ typeNote }}</p>

        <div :class="CARD">
          <div class="flex items-center justify-between gap-3">
            <span class="font-display text-base tracking-wider">Character Count</span>
            <div class="flex gap-1" role="radiogroup" aria-label="Character count">
              <button
                v-for="option in CHAR_COUNTS"
                :key="option"
                type="button"
                class="rounded-sm border px-2 py-1 font-mono text-xs transition-colors"
                :class="
                  settings.charCount === option
                    ? 'border-ink-300 bg-ink-100 text-ink-950'
                    : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
                "
                role="radio"
                :aria-checked="settings.charCount === option"
                :aria-label="`${option} characters`"
                @click="chooseCharCount(option)"
              >
                {{ option }}
              </button>
            </div>
          </div>
          <p class="text-xs text-ink-500">
            {{ settings.charCount * settings.charHeight }} bytes of character memory. Shrinking the
            set discards the glyphs above the new last code — you'll be asked first.
          </p>
        </div>
      </section>

      <hr class="my-3 border-ink-800" />

      <section class="flex flex-col gap-1.5" aria-label="Global colors">
        <h3 class="font-display text-lg tracking-wider">Colors</h3>
        <p class="text-xs text-ink-500">
          These three registers belong to the project, not to a screen — every cell reads them (D6).
        </p>

        <ColorSlotField color-slot="screen" hint="Behind every character, and pixel value 0" />
        <ColorSlotField
          color-slot="border"
          hint="The screen surround, and multicolor pixel value 01"
        />
        <ColorSlotField color-slot="aux" hint="Multicolor pixel value 11; hires cells ignore it" />

        <div :class="CARD">
          <div class="flex items-center justify-between gap-3">
            <span class="font-display text-base tracking-wider">Reverse Mode</span>
            <div class="flex gap-1" role="radiogroup" aria-label="Reverse mode">
              <button
                v-for="option in REVERSE_OPTIONS"
                :key="option.label"
                type="button"
                class="font-display rounded-sm border px-2 py-1 text-sm tracking-wider transition-colors"
                :class="
                  editor.reverse === option.value
                    ? 'border-ink-300 bg-ink-100 text-ink-950'
                    : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
                "
                role="radio"
                :aria-checked="editor.reverse === option.value"
                :aria-label="option.label"
                @click="editor.setReverse(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <p class="text-xs text-ink-500">
            Reverse swaps the two colors of every hires cell — $900F bit 3, which is
            <em>set</em> for normal display. Multicolor cells are unaffected.
          </p>
        </div>
      </section>

      <hr class="my-3 border-ink-800" />

      <section class="flex flex-col gap-1.5" aria-label="Video standard">
        <h3 class="font-display text-lg tracking-wider">Video</h3>

        <div :class="CARD">
          <div class="flex items-center justify-between gap-3">
            <span class="font-display text-base tracking-wider">Standard</span>
            <div class="flex gap-1" role="radiogroup" aria-label="Video standard">
              <button
                v-for="option in VIDEO_OPTIONS"
                :key="option.value"
                type="button"
                class="font-display rounded-sm border px-2 py-1 text-sm tracking-wider transition-colors"
                :class="
                  settings.video === option.value
                    ? 'border-ink-300 bg-ink-100 text-ink-950'
                    : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
                "
                role="radio"
                :aria-checked="settings.video === option.value"
                :aria-label="option.label"
                @click="editor.setVideo(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-xs text-ink-500">Display origin — $9000 / $9001</span>
            <span class="font-mono text-xs text-ink-400">
              {{ origins.horizontal }} × {{ origins.vertical }}
            </span>
          </div>
          <p class="text-xs text-ink-500">
            The origins follow the standard: they center the power-on screen on that machine. PAL
            has more raster lines, so it can show more rows than NTSC.
          </p>
        </div>
      </section>

      <hr class="my-3 border-ink-800" />

      <section class="flex flex-col gap-1.5" aria-label="Memory layout">
        <h3 class="font-display text-lg tracking-wider">Memory</h3>
        <p class="text-xs text-ink-500">
          Where the VIC reads its screen and its character set — $9005, plus the matrix A9 bit in
          $9002 (§2.4).
        </p>

        <div :class="CARD">
          <label class="flex flex-col">
            <span :class="LEGEND">Expansion</span>
            <select
              :value="settings.expansion"
              aria-label="Memory expansion"
              :class="CONTROL"
              @change="onExpansion"
            >
              <option v-for="option in expansionOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="flex flex-col">
            <span :class="LEGEND">Character Memory</span>
            <select
              :value="settings.charBase"
              aria-label="Character memory"
              :class="CONTROL"
              @change="onCharBase"
            >
              <option
                v-for="option in charBaseOptions"
                :key="option.value"
                :value="option.value"
                :disabled="option.kind === 'io'"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="flex flex-col">
            <span :class="LEGEND">Screen Memory</span>
            <select
              :value="settings.screenBase"
              aria-label="Screen memory"
              :class="CONTROL"
              @change="onScreenBase"
            >
              <option
                v-for="option in screenBaseOptions"
                :key="option.address"
                :value="option.address"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <div class="flex items-baseline justify-between gap-3">
            <span class="text-xs text-ink-500">Color RAM — $9002 bit 7 picks it, nothing else</span>
            <span class="font-mono text-xs text-ink-400">
              {{ hex(colorRamAddress(settings.screenBase)) }}
            </span>
          </div>

          <!-- Offered, never applied behind the user's back (PLAN.md Phase 6) -->
          <div
            v-if="!editor.memoryIsPreset"
            class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-400/40 bg-amber-400/5 px-2 py-1.5"
          >
            <p class="text-xs text-amber-400">{{ presetNote }}</p>
            <AppButton label="Use Preset" show-label @click="editor.applyMemoryPreset()">
              <Wand2 class="size-4" />
            </AppButton>
          </div>
        </div>
      </section>

      <hr class="my-3 border-ink-800" />

      <RegisterReadout :bytes="editor.registers" />
    </div>

    <template #footer>
      <AppButton label="Close" show-label @click="open = false" />
    </template>
  </AppDialog>

  <!-- What a destructive change costs, before it happens as well as after: the
       discarded content cannot be reconstructed from the result (D8). -->
  <AppDialog v-model="confirming" :title="confirmation?.title ?? ''">
    <p class="text-sm text-ink-300">{{ confirmation?.message }}</p>
    <template #footer>
      <AppButton label="Cancel" show-label @click="confirming = false" />
      <AppButton :label="confirmation?.confirmLabel ?? 'Confirm'" show-label @click="confirmNow">
        <Check class="size-4" />
      </AppButton>
    </template>
  </AppDialog>
</template>
