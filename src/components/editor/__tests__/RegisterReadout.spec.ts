import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defaultSettings } from '@/domain/factory'
import { formatRegisterDump, registerBytes } from '@/domain/vic'
import RegisterReadout from '../RegisterReadout.vue'

/**
 * The live $9000–$900F block (D14). The bytes themselves are `registerBytes`'
 * job and tested in `vic.spec.ts`; what matters here is that all sixteen are
 * shown, each says what it carries, and the copy button hands over the dump.
 */
const BYTES = registerBytes(defaultSettings())

function mountReadout(bytes: number[] = BYTES) {
  return mount(RegisterReadout, { props: { bytes } })
}

/** The cell for one register, found by the address its hover text starts with. */
function cell(wrapper: ReturnType<typeof mountReadout>, address: string) {
  return wrapper.find(`[aria-label^="${address} "]`)
}

describe('RegisterReadout', () => {
  it('shows all sixteen bytes in hex, addressed', () => {
    const wrapper = mountReadout()
    expect(wrapper.findAll('[title]')).toHaveLength(16)
    expect(cell(wrapper, '$9002').text()).toContain('96')
    expect(cell(wrapper, '$9005').text()).toContain('FF')
    expect(cell(wrapper, '$900F').text()).toContain('1B')
    // Unmodeled registers are shown at zero rather than left out
    expect(cell(wrapper, '$9004').text()).toContain('00')
  })

  it('explains each register on hover (D14)', () => {
    const wrapper = mountReadout()
    expect(cell(wrapper, '$9003').attributes('title')).toContain('8 × 16 characters')
    expect(cell(wrapper, '$900F').attributes('title')).toContain('set for normal video')
  })

  it('repaints when the settings behind it change', async () => {
    const wrapper = mountReadout()
    await wrapper.setProps({ bytes: registerBytes({ ...defaultSettings(), reverse: true }) })
    expect(cell(wrapper, '$900F').text()).toContain('13')
  })

  it('copies the block as a hex dump', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mountReadout()
    await wrapper.find('button[aria-label="Copy Registers"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith(formatRegisterDump(BYTES))
  })
})
