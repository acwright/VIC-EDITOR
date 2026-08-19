<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import AppTextInput from '@/components/base/AppTextInput.vue'
import { CHAR_COUNTS, CHAR_HEIGHTS, MODES, PROJECT_TYPES } from '@/domain/modes'
import { DEFAULT_SEED, defaultSettings, seedAvailable } from '@/domain/factory'
import type { CreateProjectOptions } from '@/domain/factory'
import type { CharsetSeed } from '@/domain/romCharset'
import type { CharCount, CharHeight, ProjectType } from '@/domain/types'

/**
 * Type, character height and character count decide what the character editor
 * draws (D1, D3, D4); the starting character set decides whether there is
 * anything to draw *with* — a new project seeds from the VIC-20 ROM font unless
 * asked not to (D15). The ROM is 8 rows tall, so a 16-tall project can only
 * start blank and the seed choice says so rather than going quiet (D16b).
 */
const open = defineModel<boolean>({ required: true })

const emit = defineEmits<{ create: [options: CreateProjectOptions] }>()

/** The machine's power-on configuration; the form overrides three fields of it. */
const DEFAULTS = defaultSettings()

const name = ref('')
const type = ref<ProjectType>('hires')
const charHeight = ref<CharHeight>(DEFAULTS.charHeight)
const charCount = ref<CharCount>(DEFAULTS.charCount)
const seed = ref<CharsetSeed>(DEFAULT_SEED)

const SEEDS: { value: CharsetSeed; label: string }[] = [
  { value: 'rom-upper', label: 'ROM Upper' },
  { value: 'rom-lower', label: 'ROM Lower' },
  { value: 'blank', label: 'Blank' },
]

const SEED_HINTS: Record<CharsetSeed, string> = {
  'rom-upper': 'The ROM uppercase / graphics set — capitals, digits and the PETSCII graphics.',
  'rom-lower': 'The ROM lowercase / uppercase set — mixed-case text.',
  blank: 'Every character empty, ready to draw from scratch.',
}

/** True while the ROM options are out of reach: the font is 8 rows (D16b). */
const romBlocked = computed(() => !seedAvailable('rom-upper', charHeight.value))

/** What the project will actually start with, once D16b has had its say. */
const effectiveSeed = computed<CharsetSeed>(() =>
  seedAvailable(seed.value, charHeight.value) ? seed.value : 'blank',
)

/** 256 characters is the set plus its reversed block, as the hardware reads it (D16a). */
const seedNote = computed(() => {
  if (romBlocked.value) return 'The ROM font is 8 rows tall, so 8 × 16 projects start blank.'
  if (effectiveSeed.value === 'blank') return SEED_HINTS.blank
  const rom = SEED_HINTS[effectiveSeed.value]
  if (charCount.value === 256)
    return `${rom} At 256 the reversed block follows it, as the VIC reads it.`
  if (charCount.value === 64) return `${rom} At 64, its first 64 characters.`
  return rom
})

const TYPE_HINTS: Record<ProjectType, string> = {
  hires: '8 × 1-bit pixels per cell — the screen color and one color per cell.',
  multicolor: '4 double-wide 2-bit pixels — four colors per cell, half the horizontal detail.',
  mixed: 'Each character picks its own rendering, which is what real VIC screens do.',
}

// Reset the form each time the dialog opens
watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = ''
  type.value = 'hires'
  charHeight.value = DEFAULTS.charHeight
  charCount.value = DEFAULTS.charCount
  seed.value = DEFAULT_SEED
})

const canCreate = computed(() => name.value.trim().length > 0)

function submit() {
  if (!canCreate.value) return
  emit('create', {
    name: name.value.trim(),
    type: type.value,
    settings: { charHeight: charHeight.value, charCount: charCount.value },
    seed: effectiveSeed.value,
  })
}
</script>

<template>
  <AppDialog v-model="open" title="New Project">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <AppTextInput v-model="name" label="Name" placeholder="My Project" autofocus />

      <fieldset class="flex flex-col gap-1.5">
        <legend class="font-display text-base tracking-wider text-ink-300">Type</legend>
        <div class="flex gap-1" role="radiogroup" aria-label="Project type">
          <button
            v-for="option in PROJECT_TYPES"
            :key="option"
            type="button"
            class="font-display flex-1 rounded-sm border py-1.5 text-sm tracking-wider transition-colors"
            :class="
              type === option
                ? 'border-ink-300 bg-ink-100 text-ink-950'
                : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
            "
            role="radio"
            :aria-checked="type === option"
            @click="type = option"
          >
            {{ MODES[option].label }}
          </button>
        </div>
        <p class="text-xs text-ink-500">{{ TYPE_HINTS[type] }}</p>
      </fieldset>

      <div class="flex gap-4">
        <fieldset class="flex flex-1 flex-col gap-1.5">
          <legend class="font-display text-base tracking-wider text-ink-300">
            Character Height
          </legend>
          <div class="flex gap-1" role="radiogroup" aria-label="Character height">
            <button
              v-for="option in CHAR_HEIGHTS"
              :key="option"
              type="button"
              class="font-mono flex-1 rounded-sm border py-1.5 text-xs transition-colors"
              :class="
                charHeight === option
                  ? 'border-ink-300 bg-ink-100 text-ink-950'
                  : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
              "
              role="radio"
              :aria-checked="charHeight === option"
              @click="charHeight = option"
            >
              8 × {{ option }}
            </button>
          </div>
        </fieldset>

        <fieldset class="flex flex-1 flex-col gap-1.5">
          <legend class="font-display text-base tracking-wider text-ink-300">Characters</legend>
          <div class="flex gap-1" role="radiogroup" aria-label="Character count">
            <button
              v-for="option in CHAR_COUNTS"
              :key="option"
              type="button"
              class="font-mono flex-1 rounded-sm border py-1.5 text-xs transition-colors"
              :class="
                charCount === option
                  ? 'border-ink-300 bg-ink-100 text-ink-950'
                  : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
              "
              role="radio"
              :aria-checked="charCount === option"
              @click="charCount = option"
            >
              {{ option }}
            </button>
          </div>
        </fieldset>
      </div>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="font-display text-base tracking-wider text-ink-300">Character Set</legend>
        <div class="flex gap-1" role="radiogroup" aria-label="Starting character set">
          <button
            v-for="option in SEEDS"
            :key="option.value"
            type="button"
            class="font-display flex-1 rounded-sm border py-1.5 text-sm tracking-wider transition-colors"
            :class="
              effectiveSeed === option.value
                ? 'border-ink-300 bg-ink-100 text-ink-950'
                : romBlocked && option.value !== 'blank'
                  ? 'cursor-not-allowed border-ink-800 bg-ink-900 text-ink-600'
                  : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500'
            "
            role="radio"
            :aria-checked="effectiveSeed === option.value"
            :disabled="romBlocked && option.value !== 'blank'"
            :title="
              romBlocked && option.value !== 'blank'
                ? 'The ROM font is 8 rows tall — not available at 8 × 16'
                : undefined
            "
            @click="seed = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="text-xs text-ink-500">{{ seedNote }}</p>
      </fieldset>

      <p class="text-xs text-ink-500">
        {{ DEFAULTS.columns }} × {{ DEFAULTS.rows }} cells. Geometry, colors and memory layout are
        all editable in project settings.
      </p>

      <!-- Hidden submit so Enter in the name field creates the project -->
      <button type="submit" class="hidden" :disabled="!canCreate" />
    </form>

    <template #footer>
      <AppButton
        label="Create"
        show-label
        :disabled="!canCreate"
        disabled-reason="a project needs a name"
        @click="submit"
      >
        <Plus class="size-4" />
      </AppButton>
    </template>
  </AppDialog>
</template>
