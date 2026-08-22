import { describe, it, expect, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AppTooltip from '../AppTooltip.vue'

const TOOLTIP_WIDTH = 160

/**
 * jsdom lays nothing out, so both rects have to be supplied: the anchor's is
 * what the caller places on screen, the tooltip's is what the clamp measures.
 */
function stubLayout(anchorLeft: number, anchorWidth = 32) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const isTooltip = this.getAttribute('role') === 'tooltip'
    const left = isTooltip ? 0 : anchorLeft
    const width = isTooltip ? TOOLTIP_WIDTH : anchorWidth
    return {
      left,
      width,
      right: left + width,
      top: 100,
      bottom: 132,
      height: 32,
      x: left,
      y: 100,
    } as DOMRect
  })
}

/** Hover the anchor and wait out the show delay plus the clamping tick. */
async function hover(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('span.inline-flex').trigger('mouseenter')
  await new Promise((resolve) => setTimeout(resolve, 120))
  await nextTick()
  await nextTick()
  return document.body.querySelector('[role="tooltip"]') as HTMLElement
}

describe('AppTooltip', () => {
  afterEach(() => vi.restoreAllMocks())

  it('centres on the anchor when there is room on both sides', async () => {
    stubLayout(484)
    const wrapper = mount(AppTooltip, {
      props: { label: 'Flip Horizontal' },
      attachTo: document.body,
    })
    const tooltip = await hover(wrapper)
    expect(tooltip.style.left).toBe('500px')
    wrapper.unmount()
  })

  it('keeps clear of the left edge for an anchor in the first column', async () => {
    stubLayout(4)
    const wrapper = mount(AppTooltip, {
      props: { label: 'Flip Horizontal' },
      attachTo: document.body,
    })
    const tooltip = await hover(wrapper)
    // Centred it would start at 20 - 80 = -60; clamped it starts at the 8px gap
    expect(tooltip.style.left).toBe(`${8 + TOOLTIP_WIDTH / 2}px`)
    wrapper.unmount()
  })

  it('keeps clear of the right edge for an anchor in the last column', async () => {
    stubLayout(window.innerWidth - 36)
    const wrapper = mount(AppTooltip, {
      props: { label: 'Flip Vertical' },
      attachTo: document.body,
    })
    const tooltip = await hover(wrapper)
    expect(tooltip.style.left).toBe(`${window.innerWidth - 8 - TOOLTIP_WIDTH / 2}px`)
    wrapper.unmount()
  })
})
