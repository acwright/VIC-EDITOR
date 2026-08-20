import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import AppButton from '../AppButton.vue'

describe('AppButton', () => {
  it('exposes the label as the accessible name', () => {
    const wrapper = mount(AppButton, {
      props: { label: 'Undo', shortcut: 'Ctrl+Z' },
    })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Undo')
  })

  it('shows the tooltip with its shortcut on hover', async () => {
    const wrapper = mount(AppButton, {
      props: { label: 'Undo', shortcut: 'Ctrl+Z' },
      attachTo: document.body,
    })
    // Tooltip is teleported to <body> and only rendered while hovered
    await wrapper.get('span.inline-flex').trigger('mouseenter')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await nextTick()
    const tooltip = document.body.querySelector('[role="tooltip"]')
    expect(tooltip?.textContent).toContain('Undo')
    expect(tooltip?.querySelector('kbd')?.textContent).toBe('Ctrl+Z')
    wrapper.unmount()
  })

  it('emits click and respects disabled', async () => {
    const wrapper = mount(AppButton, { props: { label: 'Fill' } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('reflects active state via aria-pressed', () => {
    const wrapper = mount(AppButton, { props: { label: 'Grid', active: true } })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
  })
})
