<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Download } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import { MODES } from '@/domain/modes'
import {
  ASM_DIALECTS,
  ASM_DIALECT_LIST,
  DEFAULT_BASIC_OPTIONS,
  LABEL_CASES,
  availableSegments,
  basicProgramBytes,
  hexAddress,
  prgLoadAddress,
  segmentsToAsm,
  segmentsToBasic,
  segmentsToBinary,
  segmentsToPrg,
  type AsmDialectId,
  type ByteSegment,
  type LabelCase,
} from '@/domain/export'
import { loadPreferences, savePreferences } from '@/persistence/preferences'
import {
  charsetSheetToCanvas,
  charsetSheetSize,
  screenPixelSize,
  screenToCanvas,
} from '@/utils/screenRender'
import { downloadBytes, downloadCanvasPng, downloadText } from '@/utils/download'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import type { Project } from '@/domain/types'

const props = defineProps<{ scope: 'screen' | 'charset' }>()
const open = defineModel<boolean>({ required: true })

const projects = useProjectsStore()
const editor = useEditorStore()

type FormatId = 'asm' | 'basic' | 'prg' | 'binary' | 'png'
const FORMATS: { id: FormatId; label: string }[] = [
  { id: 'asm', label: 'Assembly' },
  { id: 'basic', label: 'BASIC' },
  { id: 'prg', label: 'PRG' },
  { id: 'binary', label: 'Binary' },
  { id: 'png', label: 'PNG' },
]
const PNG_SCALES = [1, 2, 3, 4, 5, 6, 7, 8]

const preferences = loadPreferences()
const format = ref<FormatId>('asm')
const pngScale = ref(4)
const isText = computed(() => format.value === 'asm' || format.value === 'basic')

// --- Assembly options (remembered across sessions) ---
const asmDialect = ref<AsmDialectId>(preferences.asmDialect)
const labelCase = ref<LabelCase>(preferences.labelCase)

function setAsmDialect(value: AsmDialectId) {
  asmDialect.value = value
  savePreferences({ asmDialect: value })
}

function setLabelCase(value: LabelCase) {
  labelCase.value = value
  savePreferences({ labelCase: value })
}

// --- Screen scope options ---
const screenChoice = ref<'current' | 'all'>('current')
const selectedScreens = computed(() =>
  screenChoice.value === 'all'
    ? (projects.current?.screens ?? []).map((_, i) => i)
    : [editor.selectedScreen],
)

// --- BASIC options ---
const startLine = ref(DEFAULT_BASIC_OPTIONS.startLine)
const step = ref(DEFAULT_BASIC_OPTIONS.step)
const loader = ref(DEFAULT_BASIC_OPTIONS.loader)

/**
 * Segments switched *off*, by label. Tracking the exclusions rather than the
 * inclusions means a screen added while the dialog is open arrives selected,
 * and the registers — an extra, not part of what the scope names — start off.
 */
const excluded = ref(new Set<string>(['vic_registers']))

function isIncluded(segment: ByteSegment): boolean {
  return !excluded.value.has(segment.label)
}

function toggleSegment(segment: ByteSegment) {
  const next = new Set(excluded.value)
  if (next.has(segment.label)) next.delete(segment.label)
  else next.add(segment.label)
  excluded.value = next
}

const title = computed(() => {
  const project = projects.current
  return project ? `${project.name} — ${MODES[project.type].label}` : 'VIC-20'
})

/** Everything this scope could emit — the checkbox list. */
const offered = computed<ByteSegment[]>(() => {
  const project = projects.current
  if (!project) return []
  return availableSegments(project, props.scope, selectedScreens.value)
})

/** Everything it will emit. */
const segments = computed<ByteSegment[]>(() => offered.value.filter(isIncluded))

const byteCount = computed(() => segments.value.reduce((sum, seg) => sum + seg.bytes.length, 0))

const textOutput = computed(() => {
  if (format.value === 'asm') {
    return segmentsToAsm(segments.value, ASM_DIALECTS[asmDialect.value], title.value, {
      labelCase: labelCase.value,
    })
  }
  if (format.value === 'basic') {
    return segmentsToBasic(
      segments.value,
      { startLine: startLine.value, step: step.value, loader: loader.value },
      title.value,
    )
  }
  return ''
})

/** Tokenised size of the generated program — a VIC-20 has 3583 bytes free. */
const basicSize = computed(() => basicProgramBytes(textOutput.value))

const loadAddress = computed(() => prgLoadAddress(segments.value))

const pngDimensions = computed(() => {
  const project = projects.current
  if (!project) return ''
  const { width, height } =
    props.scope === 'charset' ? charsetSheetSize(project) : screenPixelSize(project)
  return `${width * pngScale.value} × ${height * pngScale.value} px`
})

const hasData = computed(() => {
  if (format.value === 'png') {
    if (props.scope === 'charset') return true
    return !!editor.currentScreen
  }
  return byteCount.value > 0
})

function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  )
}

const extension = computed(() => {
  switch (format.value) {
    case 'asm':
      return ASM_DIALECTS[asmDialect.value].extension
    case 'basic':
      return '.bas'
    case 'prg':
      return '.prg'
    case 'binary':
      return '.bin'
    default:
      return '.png'
  }
})

const filename = computed(() => {
  const project = projects.current
  let name = project ? fileSlug(project.name) : 'project'
  if (props.scope === 'charset') {
    name += '-charset'
  } else {
    name +=
      format.value === 'png' || screenChoice.value === 'current'
        ? `-screen${editor.selectedScreen + 1}`
        : '-screens'
  }
  return name + extension.value
})

// --- Actions ---
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(textOutput.value)
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1500)
}

/** The canvas a PNG export renders, per scope. */
function pngCanvas(project: Project): HTMLCanvasElement | null {
  if (props.scope === 'charset') {
    return charsetSheetToCanvas(project, pngScale.value, editor.fgColor)
  }
  return editor.currentScreen ? screenToCanvas(project, editor.currentScreen, pngScale.value) : null
}

function download() {
  const project = projects.current
  if (!project || !hasData.value) return
  if (format.value === 'binary') {
    downloadBytes(filename.value, segmentsToBinary(segments.value))
  } else if (format.value === 'prg') {
    downloadBytes(filename.value, segmentsToPrg(segments.value))
  } else if (format.value === 'png') {
    const canvas = pngCanvas(project)
    if (canvas) downloadCanvasPng(filename.value, canvas)
  } else {
    downloadText(
      filename.value,
      textOutput.value,
      format.value === 'basic' ? 'text/plain' : 'text/x-asm',
    )
  }
}

const DIALOG_TITLE = {
  charset: 'Export Character Set',
  screen: 'Export Screen',
} as const

const segButton =
  'font-display rounded-sm border px-3 py-1.5 text-sm tracking-wider transition-colors'
const segActive = 'border-ink-300 bg-ink-100 text-ink-950'
const segIdle = 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500 hover:text-ink-100'
const LEGEND = 'font-display mb-1 text-sm tracking-wider text-ink-400'
const NUMBER_FIELD =
  'h-9 w-28 rounded-sm border border-ink-700 bg-ink-850 px-2.5 text-sm text-ink-100 focus:border-ink-300 focus:outline-none'
</script>

<template>
  <AppDialog v-model="open" size="xl" :title="DIALOG_TITLE[scope]">
    <div class="flex flex-col gap-4">
      <!-- Format -->
      <fieldset class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Format</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="f in FORMATS"
            :key="f.id"
            type="button"
            :class="[segButton, format === f.id ? segActive : segIdle]"
            @click="format = f.id"
          >
            {{ f.label }}
          </button>
        </div>
      </fieldset>

      <!-- Assembler dialect -->
      <fieldset v-if="format === 'asm'" class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Assembler</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="d in ASM_DIALECT_LIST"
            :key="d.id"
            type="button"
            :title="`${d.directive} $00, …`"
            :class="[segButton, asmDialect === d.id ? segActive : segIdle]"
            @click="setAsmDialect(d.id)"
          >
            {{ d.label }}
          </button>
        </div>
      </fieldset>

      <!-- Screen options -->
      <fieldset v-if="scope === 'screen' && format !== 'png'" class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Screens</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            :class="[segButton, screenChoice === 'current' ? segActive : segIdle]"
            @click="screenChoice = 'current'"
          >
            Current
          </button>
          <button
            type="button"
            :class="[segButton, screenChoice === 'all' ? segActive : segIdle]"
            @click="screenChoice = 'all'"
          >
            All
          </button>
        </div>
      </fieldset>

      <!-- Segments -->
      <fieldset v-if="format !== 'png'" class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Segments</legend>
        <div class="flex flex-col gap-1 rounded-sm border border-ink-800 bg-ink-900 p-2">
          <label
            v-for="seg in offered"
            :key="seg.label"
            class="flex cursor-pointer items-center gap-2 text-xs"
          >
            <input
              type="checkbox"
              class="size-3.5 accent-ink-100"
              :checked="isIncluded(seg)"
              @change="toggleSegment(seg)"
            />
            <span class="font-mono text-ink-200">{{ seg.label }}</span>
            <span class="ml-auto font-mono text-ink-500">
              {{ seg.bytes.length }} bytes @ {{ hexAddress(seg.loadAddress) }}
            </span>
          </label>
        </div>
      </fieldset>

      <!-- PNG scale -->
      <fieldset v-if="format === 'png'" class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Scale</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in PNG_SCALES"
            :key="s"
            type="button"
            :class="[segButton, pngScale === s ? segActive : segIdle]"
            @click="pngScale = s"
          >
            {{ s }}×
          </button>
        </div>
      </fieldset>

      <!-- BASIC program options -->
      <fieldset v-if="format === 'basic'" class="flex flex-col gap-2">
        <div class="flex gap-4">
          <label class="flex flex-col gap-1">
            <span class="font-display text-sm tracking-wider text-ink-400">Start line</span>
            <input v-model.number="startLine" type="number" min="0" :class="NUMBER_FIELD" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-display text-sm tracking-wider text-ink-400">Step</span>
            <input v-model.number="step" type="number" min="1" :class="NUMBER_FIELD" />
          </label>
        </div>
        <label class="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
          <input v-model="loader" type="checkbox" class="size-3.5 accent-ink-100" />
          <span
            >Generate loader — <code class="font-mono">READ</code>/<code class="font-mono"
              >POKE</code
            >
            each segment to its address, registers last</span
          >
        </label>
      </fieldset>

      <!-- Assembly label case -->
      <fieldset v-if="format === 'asm'" class="flex flex-col gap-1.5">
        <legend :class="LEGEND">Labels</legend>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in LABEL_CASES"
            :key="c.id"
            type="button"
            :title="c.example"
            :class="[
              segButton,
              'font-mono tracking-normal',
              labelCase === c.id ? segActive : segIdle,
            ]"
            @click="setLabelCase(c.id)"
          >
            {{ c.label }}
          </button>
        </div>
      </fieldset>

      <!-- Preview / summary -->
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-display text-sm tracking-wider text-ink-400">Preview</span>
          <span v-if="isText" class="font-mono text-xs text-ink-500">
            <template v-if="format === 'basic' && hasData"
              >≈ {{ basicSize }} bytes tokenised ·
            </template>
            {{ filename }}
          </span>
        </div>
        <textarea
          v-if="isText"
          :value="textOutput"
          readonly
          spellcheck="false"
          class="h-56 w-full resize-none rounded-sm border border-ink-700 bg-ink-950 p-2 font-mono text-[11px] whitespace-pre text-ink-300 focus:outline-none"
        />
        <p
          v-else
          class="flex h-20 items-center justify-center rounded-sm border border-ink-800 bg-ink-950 text-center font-mono text-xs text-ink-400"
        >
          <span v-if="!hasData">Nothing selected to export.</span>
          <span v-else-if="format === 'binary'"
            >{{ byteCount }} bytes → <span class="text-ink-200">{{ filename }}</span></span
          >
          <span v-else-if="format === 'prg'"
            >{{ byteCount }} bytes loading at
            <span class="text-ink-200">{{ hexAddress(loadAddress) }}</span> →
            <span class="text-ink-200">{{ filename }}</span></span
          >
          <span v-else
            >{{ pngDimensions }} PNG → <span class="text-ink-200">{{ filename }}</span></span
          >
        </p>
      </div>
    </div>

    <template #footer>
      <AppButton
        v-if="isText"
        label="Copy"
        show-label
        :disabled="!hasData"
        disabled-reason="nothing is selected to export"
        @click="copy"
      >
        <Check v-if="copied" class="size-4 text-ok" />
        <Copy v-else class="size-4" />
      </AppButton>
      <AppButton
        label="Download"
        show-label
        :disabled="!hasData"
        disabled-reason="nothing is selected to export"
        @click="download"
      >
        <Download class="size-4" />
      </AppButton>
    </template>
  </AppDialog>
</template>
