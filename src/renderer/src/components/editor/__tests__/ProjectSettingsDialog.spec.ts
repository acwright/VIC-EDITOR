import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { CreateProjectOptions } from '@/domain/factory'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import AppDialog from '@/components/base/AppDialog.vue'
import ProjectSettingsDialog from '../ProjectSettingsDialog.vue'

/**
 * The project's control panel (PLAN.md Phase 6). Every field is a register
 * field, so the tests below check two things of each: that it reaches the
 * project as an undoable command, and that the ones which throw content away
 * ask before they do it.
 */
beforeEach(() => {
  // jsdom has no modal dialog implementation
  HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
  HTMLDialogElement.prototype.close = vi.fn<() => void>()
})

function mountDialog(options: Partial<CreateProjectOptions> = {}) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Test', seed: 'blank', type: 'multicolor', ...options })!
  projects.open(project.id)
  editor.reset()

  const wrapper = mount(ProjectSettingsDialog, {
    props: { modelValue: true },
    attachTo: document.body,
  })
  return { wrapper, projects, editor }
}

type Wrapper = ReturnType<typeof mountDialog>['wrapper']

const field = (wrapper: Wrapper, label: string) =>
  wrapper.findAll(`[aria-label="${label} color"] button`)

/** A radio-style option button, by the group and option accessible names. */
const option = (wrapper: Wrapper, group: string, label: string) =>
  wrapper.find(`[aria-label="${group}"] button[aria-label="${label}"]`)

const button = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === label)!

/**
 * A disabled button carries its reason in the accessible name (Phase 11), so
 * one that can be disabled is found by the label it starts with.
 */
const buttonNamed = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label')?.startsWith(label))!

/** The confirmation dialog — the second one, whichever change opened it. */
const confirmation = (wrapper: Wrapper) => wrapper.findAllComponents(AppDialog)[1]!

describe('ProjectSettingsDialog', () => {
  describe('colors (D5, D6)', () => {
    it('sets a global color register as an undoable command', async () => {
      const { wrapper, projects, editor } = mountDialog()
      await field(wrapper, 'Auxiliary')[11]!.trigger('click')

      expect(projects.current!.settings.auxColor).toBe(11)
      expect(editor.undo()).toBe('Set Auxiliary Color')
      expect(projects.current!.settings.auxColor).toBe(0)
    })

    it('offers all sixteen colors to the 4-bit registers', () => {
      const { wrapper } = mountDialog()
      for (const label of ['Screen', 'Auxiliary']) {
        const swatches = field(wrapper, label)
        expect(swatches).toHaveLength(16)
        expect(swatches.every((s) => s.attributes('disabled') === undefined)).toBe(true)
      }
    })

    it('shows but refuses colors 8–15 for the 3-bit border field', async () => {
      const { wrapper, projects } = mountDialog()
      const swatches = field(wrapper, 'Border')
      expect(swatches).toHaveLength(16)
      expect(swatches.slice(8).every((s) => s.attributes('disabled') !== undefined)).toBe(true)
      expect(swatches[9]!.attributes('title')).toContain('3 bits wide')

      await swatches[9]!.trigger('click')
      expect(projects.current!.settings.borderColor).toBe(3) // still the default
    })

    it('toggles reverse mode undoably', async () => {
      const { wrapper, projects, editor } = mountDialog({ type: 'hires' })
      const modes = wrapper.findAll('[aria-label="Reverse mode"] button')
      expect(modes.map((m) => m.text())).toEqual(['Normal', 'Reverse'])
      expect(modes[0]!.attributes('aria-checked')).toBe('true')

      await modes[1]!.trigger('click')
      expect(projects.current!.settings.reverse).toBe(true)
      expect(editor.currentSlots).toEqual(['fg', 'screen'])
      expect(editor.undo()).toBe('Enable Reverse')
      expect(projects.current!.settings.reverse).toBe(false)
    })
  })

  describe('geometry (D8, D9)', () => {
    const columns = (wrapper: Wrapper) => wrapper.find('input[aria-label="Columns"]')
    const rows = (wrapper: Wrapper) => wrapper.find('input[aria-label="Rows"]')
    const resize = (wrapper: Wrapper) => buttonNamed(wrapper, 'Resize Screens')

    it('shows the color RAM budget as the geometry is typed', async () => {
      const { wrapper } = mountDialog()
      expect(wrapper.text()).toContain('506 / 512 cells')

      await columns(wrapper).setValue(20)
      expect(wrapper.text()).toContain('460 / 512 cells')
    })

    it('applies a non-destructive resize straight away', async () => {
      const { wrapper, projects, editor } = mountDialog()
      await rows(wrapper).setValue(10)
      await resize(wrapper).trigger('click')

      expect(projects.current!.settings.rows).toBe(10)
      expect(projects.current!.screens[0]!.cells).toHaveLength(220)
      expect(editor.undoLabel).toBe('Resize Screens')
    })

    it('confirms before cropping content, and applies on confirm', async () => {
      const { wrapper, projects, editor } = mountDialog()
      editor.paintCell(21, 0, { code: 90 })
      await rows(wrapper).setValue(10)
      await columns(wrapper).setValue(10)
      expect(confirmation(wrapper).props('modelValue')).toBe(false)

      await resize(wrapper).trigger('click')

      // Still 22 wide: the crop waits on the confirmation (D8)
      expect(projects.current!.settings.columns).toBe(22)
      expect(confirmation(wrapper).props('modelValue')).toBe(true)
      expect(confirmation(wrapper).text()).toContain('crops 1 character')

      await button(wrapper, 'Resize').trigger('click')
      expect(projects.current!.settings).toMatchObject({ columns: 10, rows: 10 })
    })

    it('blocks a geometry the color RAM cannot hold', async () => {
      const { wrapper, projects } = mountDialog()
      await columns(wrapper).setValue(31)
      await rows(wrapper).setValue(32)

      expect(wrapper.text()).toContain('992 cells exceeds the 512')
      expect(resize(wrapper).attributes('disabled')).toBeDefined()
      // The grayed button says why, not just the paragraph under it
      expect(resize(wrapper).attributes('aria-label')).toContain('992 cells exceeds the 512')
      expect(projects.current!.settings.columns).toBe(22)
    })

    it('re-reads the project when the geometry changes underneath', async () => {
      const { wrapper, editor } = mountDialog()
      await rows(wrapper).setValue(10)
      await resize(wrapper).trigger('click')

      editor.undo()
      await nextTick()
      expect((rows(wrapper).element as HTMLInputElement).value).toBe('23')
    })
  })

  describe('character height (D3)', () => {
    it('grows every glyph without asking — nothing is lost', async () => {
      const { wrapper, projects, editor } = mountDialog()
      await option(wrapper, 'Character height', '8 × 16').trigger('click')

      expect(projects.current!.settings.charHeight).toBe(16)
      expect(projects.current!.charset[0]).toHaveLength(16)
      expect(confirmation(wrapper).props('modelValue')).toBe(false)
      expect(editor.undoLabel).toBe('Set Character Height')
    })

    it('confirms a shrink that would discard drawn rows, quoting the cost', async () => {
      const { wrapper, projects, editor } = mountDialog({ settings: { charHeight: 16 } })
      editor.paintPixel(0, 12, 1)
      await nextTick()

      await option(wrapper, 'Character height', '8 × 8').trigger('click')
      expect(projects.current!.settings.charHeight).toBe(16) // waiting on the answer
      expect(confirmation(wrapper).text()).toContain('bottom 8 rows of 1 character')

      await button(wrapper, 'Change Height').trigger('click')
      expect(projects.current!.settings.charHeight).toBe(8)
      expect(projects.current!.charset[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    })

    it('leaves the project alone when the confirmation is canceled', async () => {
      const { wrapper, projects, editor } = mountDialog({ settings: { charHeight: 16 } })
      editor.paintPixel(0, 12, 1)
      await nextTick()

      await option(wrapper, 'Character height', '8 × 8').trigger('click')
      await button(wrapper, 'Cancel').trigger('click')

      expect(confirmation(wrapper).props('modelValue')).toBe(false)
      expect(projects.current!.settings.charHeight).toBe(16)
    })
  })

  describe('character count (D4)', () => {
    it('resizes the set, and says what it costs in memory', async () => {
      const { wrapper, projects, editor } = mountDialog()
      expect(wrapper.text()).toContain('2048 bytes of character memory')

      await option(wrapper, 'Character count', '64 characters').trigger('click')
      expect(projects.current!.charset).toHaveLength(64)
      expect(projects.current!.settings.charCount).toBe(64)
      expect(editor.undoLabel).toBe('Set Character Count')
      await nextTick()
      expect(wrapper.text()).toContain('512 bytes of character memory')
    })

    it('confirms before discarding drawn glyphs above the new last code', async () => {
      const { wrapper, projects, editor } = mountDialog()
      editor.selectChar(200)
      editor.applyTransform('fill')

      await option(wrapper, 'Character count', '128 characters').trigger('click')
      expect(projects.current!.charset).toHaveLength(256)
      expect(confirmation(wrapper).text()).toContain('discards 1 drawn character above code 127')

      await button(wrapper, 'Change Count').trigger('click')
      expect(projects.current!.charset).toHaveLength(128)
    })
  })

  describe('video standard (§2.6)', () => {
    it('switches standard undoably and moves the origins with it', async () => {
      const { wrapper, projects } = mountDialog()
      expect(wrapper.text()).toContain('5 × 25')

      await option(wrapper, 'Video standard', 'PAL').trigger('click')
      expect(projects.current!.settings.video).toBe('pal')
      await nextTick()
      expect(wrapper.text()).toContain('12 × 38')
    })
  })

  describe('memory (§2.4)', () => {
    const select = (wrapper: Wrapper, label: string) =>
      wrapper.find(`select[aria-label="${label}"]`)

    it('moves the character set, and refuses the blocks that are not memory', async () => {
      const { wrapper, projects, editor } = mountDialog()
      await select(wrapper, 'Character memory').setValue('13')

      expect(projects.current!.settings.charBase).toBe(13)
      expect(editor.undoLabel).toBe('Set Character Memory')
      // $9000–$9C00 are I/O, not somewhere a character set can live
      const io = select(wrapper, 'Character memory').findAll('option[disabled]')
      expect(io.map((o) => o.attributes('value'))).toEqual(['4', '5', '6', '7'])
    })

    it('moves the screen, and color RAM follows it', async () => {
      const { wrapper, projects } = mountDialog()
      expect(wrapper.text()).toContain('$9600') // $1E00 has matrix A9 set

      await select(wrapper, 'Screen memory').setValue('4096') // $1000
      expect(projects.current!.settings.screenBase).toBe(0x1000)
      await nextTick()
      expect(wrapper.text()).toContain('$9400')
    })

    it('offers the expansion’s layout rather than applying it (Phase 6)', async () => {
      const { wrapper, projects, editor } = mountDialog()
      expect(button(wrapper, 'Use Preset')).toBeUndefined()

      await select(wrapper, 'Memory expansion').setValue('8k')
      expect(projects.current!.settings).toMatchObject({
        expansion: '8k',
        screenBase: 0x1e00, // untouched
        charBase: 15,
      })
      await nextTick()
      expect(wrapper.text()).toContain('puts the screen at $1000 and the character set at $1400')

      await button(wrapper, 'Use Preset').trigger('click')
      expect(projects.current!.settings).toMatchObject({ screenBase: 0x1000, charBase: 13 })
      expect(editor.undoLabel).toBe('Apply Memory Preset')
      await nextTick()
      expect(button(wrapper, 'Use Preset')).toBeUndefined()
    })
  })

  describe('the register block (D14)', () => {
    const register = (wrapper: Wrapper, address: string) =>
      wrapper.find(`[aria-label^="${address} "]`)

    it('reads out the known defaults for an untouched project', () => {
      const { wrapper } = mountDialog()
      expect(register(wrapper, '$9000').text()).toContain('05') // NTSC origins
      expect(register(wrapper, '$9001').text()).toContain('19')
      expect(register(wrapper, '$9002').text()).toContain('96') // 22 columns, matrix A9
      expect(register(wrapper, '$9003').text()).toContain('2E') // 23 rows, 8 × 8
      expect(register(wrapper, '$9005').text()).toContain('FF') // matrix $1E00, chargen $1C00
      expect(register(wrapper, '$900F').text()).toContain('1B') // white on cyan, normal
    })

    it('follows every field above it', async () => {
      const { wrapper } = mountDialog()
      await wrapper.find('input[aria-label="Columns"]').setValue(20)
      await button(wrapper, 'Resize Screens').trigger('click')
      expect(register(wrapper, '$9002').text()).toContain('94')

      await option(wrapper, 'Character height', '8 × 16').trigger('click')
      expect(register(wrapper, '$9003').text()).toContain('2F')

      await field(wrapper, 'Screen')[0]!.trigger('click') // black screen color
      expect(register(wrapper, '$900F').text()).toContain('0B')
    })
  })
})
