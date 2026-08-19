import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ExportDialog from '../ExportDialog.vue'
import { defaultSettings } from '@/domain/factory'
import { loadPreferences } from '@/persistence/preferences'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'

/** Open a real project and mount the dialog in the given scope. */
function setup(scope: 'charset' | 'screen') {
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  const project = projects.create({ name: 'Astro Ace', type: 'hires' })!
  projects.open(project.id)
  editor.reset()
  const wrapper = mount(ExportDialog, { props: { modelValue: true, scope } })
  return { projects, editor, wrapper }
}

/** Click a segmented option button by its visible label. */
async function click(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === label)
  if (!button) throw new Error(`no button labeled "${label}"`)
  await button.trigger('click')
}

/** Tick or untick a segment checkbox by the label beside it. */
async function toggleSegment(wrapper: ReturnType<typeof mount>, label: string) {
  const row = wrapper.findAll('label').find((l) => l.text().includes(label))
  if (!row) throw new Error(`no segment row for "${label}"`)
  const box = row.get('input[type="checkbox"]')
  await box.trigger('change')
}

describe('ExportDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom has no showModal(); the dialog only needs it not to throw.
    HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
    HTMLDialogElement.prototype.close = vi.fn<() => void>()
  })

  it('titles itself for the scope', () => {
    expect(setup('charset').wrapper.text()).toContain('Export Character Set')
    expect(setup('screen').wrapper.text()).toContain('Export Screen')
  })

  it('previews ca65 with the pattern table', () => {
    const preview = setup('charset').wrapper.get('textarea').element.value
    expect(preview).toContain('char_patterns:')
    expect(preview).toContain('exported from VIC-20 Editor')
  })

  it('previews a screen with its color RAM beside it (D7)', () => {
    const preview = setup('screen').wrapper.get('textarea').element.value
    expect(preview).toContain('screen_1:')
    expect(preview).toContain('colors_1:')
  })

  it('offers the three 6502 assemblers but no Z80 (D12)', () => {
    const labels = setup('charset')
      .wrapper.findAll('button')
      .map((b) => b.text())
    expect(labels).toEqual(expect.arrayContaining(['ca65 / 64tass', 'ACME', 'DASM']))
    expect(labels).not.toContain('Z80')
  })

  it('switches dialect and remembers the choice', async () => {
    const { wrapper } = setup('charset')
    await click(wrapper, 'ACME')
    expect(wrapper.get('textarea').element.value).toContain('!byte')
    expect(loadPreferences().asmDialect).toBe('acme')
    expect(wrapper.text()).toContain('astro-ace-charset.a')
  })

  it('previews the current screen and switches to all screens on request', async () => {
    const { editor, wrapper } = setup('screen')
    editor.addScreen()
    await wrapper.vm.$nextTick()

    expect(wrapper.get('textarea').element.value).toContain('screen_2:')
    expect(wrapper.get('textarea').element.value).not.toContain('screen_1:')

    await click(wrapper, 'All')
    expect(wrapper.get('textarea').element.value).toContain('screen_1:')
    expect(wrapper.get('textarea').element.value).toContain('screen_2:')
  })

  it('offers the registers as an opt-in segment (D14)', async () => {
    const { wrapper } = setup('charset')
    expect(wrapper.text()).toContain('vic_registers')
    expect(wrapper.get('textarea').element.value).not.toContain('vic_registers:')

    await toggleSegment(wrapper, 'vic_registers')
    expect(wrapper.get('textarea').element.value).toContain('vic_registers:')
  })

  it('drops a segment that is unticked', async () => {
    const { wrapper } = setup('screen')
    await toggleSegment(wrapper, 'colors_1')
    const preview = wrapper.get('textarea').element.value
    expect(preview).toContain('screen_1:')
    expect(preview).not.toContain('colors_1:')
  })

  it('generates a BASIC loader that pokes the charset into its base', async () => {
    const { wrapper } = setup('charset')
    await click(wrapper, 'BASIC')
    const preview = wrapper.get('textarea').element.value
    expect(preview).toContain('REM VIC-20 EDITOR LOADER')
    expect(preview).toContain('READ V:POKE 7168+I,V:NEXT') // $1C00, the unexpanded default
    expect(wrapper.text()).toContain('bytes tokenised')
  })

  it('reports the PRG load address and extension', async () => {
    const { wrapper } = setup('screen')
    await click(wrapper, 'PRG')
    const { columns, rows } = defaultSettings()
    expect(wrapper.text()).toContain(`${columns * rows * 2} bytes loading at`)
    expect(wrapper.text()).toContain('$1E00')
    expect(wrapper.text()).toContain('astro-ace-screen1.prg')
  })

  it('reports the PNG size and filename per scope', async () => {
    const charset = setup('charset')
    await click(charset.wrapper, 'PNG')
    expect(charset.wrapper.text()).toContain('512 × 512 px') // 16×16 glyphs of 8px, 4×
    expect(charset.wrapper.text()).toContain('astro-ace-charset.png')

    const screen = setup('screen')
    await click(screen.wrapper, 'PNG')
    const { columns, rows, charHeight } = defaultSettings()
    expect(screen.wrapper.text()).toContain(`${columns * 8 * 4} × ${rows * charHeight * 4} px`)
    expect(screen.wrapper.text()).toContain('astro-ace-screen1.png')
  })

  it('reports the binary byte count for the charset', async () => {
    const { wrapper } = setup('charset')
    await click(wrapper, 'Binary')
    const { charCount, charHeight } = defaultSettings()
    expect(wrapper.text()).toContain(`${charCount * charHeight} bytes`)
    expect(wrapper.text()).toContain('astro-ace-charset.bin')
  })

  it('has nothing to export once every segment is unticked', async () => {
    const { wrapper } = setup('charset')
    await click(wrapper, 'Binary')
    await toggleSegment(wrapper, 'char_patterns')
    expect(wrapper.text()).toContain('Nothing selected to export.')
  })
})
