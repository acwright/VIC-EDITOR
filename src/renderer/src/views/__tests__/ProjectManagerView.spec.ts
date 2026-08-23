import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import ProjectManagerView from '../ProjectManagerView.vue'
import { createProject } from '@/domain/factory'
import { createRepository } from '@/persistence/repository'
import { SAMPLES } from '@/samples'
import HelpDialog from '@/components/HelpDialog.vue'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn<() => void>() }) }))

/**
 * Mount the view, capturing anything Vue's error handling swallows. Errors
 * thrown in setup or in an immediate watcher never reach the caller — Vue
 * catches them — so without this hook a broken child mounts "successfully".
 */
function mountView(seed?: () => void) {
  localStorage.clear()
  setActivePinia(createPinia())
  seed?.() // stored projects have to exist before the store refreshes on mount
  const errors: unknown[] = []
  const wrapper = mount(ProjectManagerView, {
    global: { config: { errorHandler: (error: unknown) => errors.push(error) } },
  })
  return { wrapper, errors }
}

describe('ProjectManagerView', () => {
  beforeEach(() => {
    localStorage.clear()
    HTMLDialogElement.prototype.showModal = vi.fn<() => void>()
    HTMLDialogElement.prototype.close = vi.fn<() => void>()
  })

  it('mounts every child without one of them throwing', async () => {
    // Regression: ShareDialog's `immediate` watcher ran during setup and read
    // `copied`, which was declared 14 lines below it — a temporal-dead-zone
    // ReferenceError on every visit to the manager. Vue caught it, so it only
    // ever surfaced as a console error, and it shipped from v1.3.0 to v1.4.0.
    // The watcher is async, so its rejection settles a tick after mount.
    const { errors } = mountView()
    await flushPromises()
    expect(errors).toEqual([])
  })

  describe('project rows', () => {
    /** Save `settings` as a project, then mount the manager over it. */
    async function rowFor(name: string, settings: Record<string, number>) {
      const { wrapper } = mountView(() =>
        createRepository().save(createProject({ seed: 'blank', name, type: 'hires', settings })),
      )
      await flushPromises() // the list renders after the store's onMounted refresh
      return wrapper.get('li')
    }

    it('shows the geometry, because on the VIC it is a setting rather than the mode', async () => {
      const row = await rowFor('Default', { columns: 22, rows: 23 })
      expect(row.text()).toContain('22×23')
      expect(row.text()).not.toContain('8×16') // 8-tall is the default; don't say it
    })

    it('shows the character size too when it is the tall one (D3)', async () => {
      const row = await rowFor('Tall', { columns: 28, rows: 16, charHeight: 16 })
      expect(row.text()).toContain('28×16')
      expect(row.text()).toContain('8×16')
    })

    it('spells the geometry out for a reader who needs the tooltip', async () => {
      const row = await rowFor('Tall', { columns: 28, rows: 16, charHeight: 16 })
      expect(row.get('[title]').attributes('title')).toBe('28 columns × 16 rows, 8×16 characters')
    })
  })

  // D20: the web build's storage does not change this round; what it gains is
  // honesty about where projects are and what deletes them.
  it('says where projects live, and points at the desktop app', () => {
    const note = mountView().wrapper.get('[aria-label="Where projects are stored"]')
    expect(note.text()).toContain('stored in this browser')
    expect(note.text()).toContain('Clearing browsing data')
    expect(note.get('a').attributes('href')).toContain('releases')
  })

  it('renders one card per bundled sample', () => {
    const grid = mountView().wrapper.get('[aria-label="Sample projects"]')
    expect(grid.findAll('button')).toHaveLength(SAMPLES.length)
  })

  it('lays the samples out in a single row at lg, however many there are', () => {
    // Regression: the column count was once hard-coded, so the sample added
    // past that count orphaned onto a row of its own.
    const grid = mountView().wrapper.get('[aria-label="Sample projects"]')
    expect(grid.attributes('style')).toContain(`--sample-cols: ${SAMPLES.length}`)
    expect(grid.classes()).toContain('lg:grid-cols-[repeat(var(--sample-cols),minmax(0,1fr))]')
  })

  /**
   * Phase 11: the manager has keys of its own, so it carries the same help
   * dialog — and its rows still split onto a second line on a narrow screen.
   */
  describe('keyboard and layout', () => {
    it('opens the shortcut map on ? and from the header button', async () => {
      const { wrapper } = mountView()
      const help = wrapper.getComponent(HelpDialog)
      expect(help.props('modelValue')).toBe(false)

      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true }),
      )
      await flushPromises()
      expect(help.props('modelValue')).toBe(true)
      expect(help.text()).toContain('New project')

      help.vm.$emit('update:modelValue', false)
      await flushPromises()
      await wrapper.get('button[aria-label="Keyboard Shortcuts"]').trigger('click')
      expect(help.props('modelValue')).toBe(true)
    })

    it('still opens the new-project dialog on N', async () => {
      const { wrapper } = mountView()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }))
      await flushPromises()
      expect(wrapper.findComponent({ name: 'NewProjectDialog' }).props('modelValue')).toBe(true)
    })

    it('breaks each row onto two lines below lg, and one from lg up', async () => {
      // Not sm: the date and five fixed-width actions need ~360px of the row,
      // which left the name 46px at 640px.
      const { wrapper } = mountView(() =>
        createRepository().save(createProject({ seed: 'blank', name: 'Row', type: 'hires' })),
      )
      await flushPromises()
      const row = wrapper.get('li')
      // The name button and the metadata each claim the full width, until lg
      for (const part of [row.get('button'), row.get('button + div')]) {
        expect(part.classes()).toContain('basis-full')
        expect(part.classes().some((name) => name.startsWith('lg:basis-'))).toBe(true)
      }
    })

    it('wraps the actions under the date rather than truncating it', async () => {
      // The actions cannot shrink, so on a phone the date was the only thing
      // that could give and it lost its time to an ellipsis.
      const { wrapper } = mountView(() =>
        createRepository().save(createProject({ seed: 'blank', name: 'Row', type: 'hires' })),
      )
      await flushPromises()
      const meta = wrapper.get('li button + div')
      expect(meta.classes()).toContain('flex-wrap')
      const date = meta.get(':scope > span:last-of-type')
      expect(date.classes()).toContain('whitespace-nowrap')
      expect(date.classes()).not.toContain('truncate')
    })
  })
})
