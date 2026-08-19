import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NewProjectDialog from '../NewProjectDialog.vue'
import type { CreateProjectOptions } from '@/domain/factory'

/**
 * The form's job in Phase 8 is the starting character set (D15). The rule worth
 * testing is D16b: the ROM font is 8 rows tall, so a 16-tall project cannot have
 * it, and the form has to say so rather than emitting a seed the factory will
 * quietly ignore.
 */
function mountDialog() {
  const wrapper = mount(NewProjectDialog, { props: { modelValue: true } })
  return wrapper
}

/** The radio button whose label reads `label`, in the group named `group`. */
function option(wrapper: ReturnType<typeof mountDialog>, group: string, label: string) {
  const buttons = wrapper.get(`[aria-label="${group}"]`).findAll('button')
  const match = buttons.find((button) => button.text() === label)
  if (!match) throw new Error(`no "${label}" option in ${group}`)
  return match
}

/** The options emitted by submitting the form. */
function created(wrapper: ReturnType<typeof mountDialog>): CreateProjectOptions | undefined {
  const events = wrapper.emitted('create') as [CreateProjectOptions][] | undefined
  return events?.[events.length - 1]?.[0]
}

async function submit(wrapper: ReturnType<typeof mountDialog>, name = 'Test') {
  await wrapper.get('input').setValue(name)
  await wrapper.get('form').trigger('submit')
}

describe('NewProjectDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
    HTMLDialogElement.prototype.close = vi.fn<() => void>()
  })

  it('offers the two ROM sets and a blank start, defaulting to ROM upper (D15)', () => {
    const wrapper = mountDialog()
    const labels = wrapper
      .get('[aria-label="Starting character set"]')
      .findAll('button')
      .map((button) => button.text())
    expect(labels).toEqual(['ROM Upper', 'ROM Lower', 'Blank'])
    expect(option(wrapper, 'Starting character set', 'ROM Upper').attributes('aria-checked')).toBe(
      'true',
    )
  })

  it('emits the chosen seed alongside the type and set size', async () => {
    const wrapper = mountDialog()
    await option(wrapper, 'Project type', 'Multicolor').trigger('click')
    await option(wrapper, 'Starting character set', 'ROM Lower').trigger('click')
    await option(wrapper, 'Character count', '64').trigger('click')
    await submit(wrapper, 'Lower 64')

    expect(created(wrapper)).toEqual({
      name: 'Lower 64',
      type: 'multicolor',
      settings: { charHeight: 8, charCount: 64 },
      seed: 'rom-lower',
    })
  })

  it('disables the ROM options at 8 × 16 and falls back to blank (D16b)', async () => {
    const wrapper = mountDialog()
    await option(wrapper, 'Character height', '8 × 16').trigger('click')

    const upper = option(wrapper, 'Starting character set', 'ROM Upper')
    expect(upper.attributes('disabled')).toBeDefined()
    expect(upper.attributes('title')).toContain('8 rows tall')
    expect(
      option(wrapper, 'Starting character set', 'Blank').attributes('aria-checked'),
      'blank is what a 16-tall project actually gets',
    ).toBe('true')
    expect(wrapper.text()).toContain('8 × 16 projects start blank')

    await submit(wrapper, 'Tall')
    expect(created(wrapper)?.seed).toBe('blank')
  })

  it('restores the ROM choice when the height goes back to 8', async () => {
    const wrapper = mountDialog()
    await option(wrapper, 'Starting character set', 'ROM Lower').trigger('click')
    await option(wrapper, 'Character height', '8 × 16').trigger('click')
    await option(wrapper, 'Character height', '8 × 8').trigger('click')
    await submit(wrapper)
    expect(created(wrapper)?.seed).toBe('rom-lower')
  })

  it('explains that 256 characters is the set plus its reversed block (D16a)', async () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('reversed block')
    await option(wrapper, 'Character count', '128').trigger('click')
    expect(wrapper.text()).not.toContain('reversed block')
  })

  it('refuses to create a project with no name', async () => {
    const wrapper = mountDialog()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create')).toBeUndefined()
  })
})
