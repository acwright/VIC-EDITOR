import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CharBytesBox from '../CharBytesBox.vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectsStore } from '@/stores/projects'
import { openTestProject } from '@/testing/project'

/**
 * The field is mounted with a *fixed* `bytes` prop, which is the point: in the
 * running app a click on the charset grid selects the new character during
 * `pointerdown` — before the field's blur — while the prop it is holding does
 * not arrive until the next render. Passing a frozen prop and moving the store
 * underneath it reproduces exactly that half-updated moment.
 */
function setup(bytes: number[] = [1, 2, 3, 4, 5, 6, 7, 8]) {
  localStorage.clear()
  setActivePinia(createPinia())
  const projects = useProjectsStore()
  const editor = useEditorStore()
  openTestProject({ name: 'Test', seed: 'blank', type: 'hires' })
  editor.reset()
  editor.setCharPattern(bytes)
  const wrapper = mount(CharBytesBox, { props: { bytes } })
  return { projects, editor, wrapper, input: wrapper.get('input') }
}

/** The pattern bytes of a character, read straight out of the project. */
function patternOf(code: number): number[] {
  const projects = useProjectsStore()
  return [...(projects.current?.charset[code] ?? [])]
}

describe('CharBytesBox', () => {
  beforeEach(() => localStorage.clear())

  it('shows the bytes it is given, in hex', () => {
    const { input } = setup([0x0f, 0x10, 0, 0, 0, 0, 0, 0xff])
    expect((input.element as HTMLInputElement).value).toBe('$0F, $10, $00, $00, $00, $00, $00, $FF')
  })

  it('writes a typed run of bytes to the character it was typed against', async () => {
    const { input, editor } = setup()
    await input.setValue('FF FF FF FF FF FF FF FF')
    await input.trigger('blur')
    expect(patternOf(editor.selectedChar)).toEqual([255, 255, 255, 255, 255, 255, 255, 255])
  })

  /**
   * The bug this component had: selecting the hex to read or copy it focused
   * the field, and blur committed regardless — so the next character clicked
   * was overwritten with the one being looked at, with no paste in sight.
   */
  it('writes nothing when the field was only focused', async () => {
    const { input, editor } = setup([1, 2, 3, 4, 5, 6, 7, 8])
    await input.trigger('focus')
    // The click that blurs the field is also the click that selects char 5.
    editor.selectChar(5)
    await input.trigger('blur')
    expect(patternOf(5)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(patternOf(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('abandons a typed edit when the click that ended it selected another character', async () => {
    const { input, editor } = setup([1, 2, 3, 4, 5, 6, 7, 8])
    await input.setValue('FF FF FF FF FF FF FF FF')
    editor.selectChar(5)
    await input.trigger('blur')
    expect(patternOf(5)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(patternOf(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('still commits on Enter, without waiting for a blur', async () => {
    const { input, editor } = setup()
    await input.setValue('01 02 03 04 05 06 07 08')
    await input.trigger('keydown.enter')
    expect(patternOf(editor.selectedChar)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('marks a draft that is not a clean run of bytes, and writes nothing', async () => {
    const { input } = setup([1, 2, 3, 4, 5, 6, 7, 8])
    await input.setValue('nonsense')
    await input.trigger('blur')
    expect(patternOf(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // Snapped back to a valid rendering either way.
    expect((input.element as HTMLInputElement).value).toBe('$01, $02, $03, $04, $05, $06, $07, $08')
  })
})
