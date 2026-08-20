import { afterEach, describe, expect, it } from 'vitest'
import type { AppApi } from '@shared/api'
import { desktop, isDesktop } from '../desktop'

/** A stand-in for what the preload script exposes. */
const stubApi = {
  app: {
    getVersion: () => Promise.resolve('1.0.0'),
    platform: 'darwin',
    onBeforeQuit: () => () => {},
    saveComplete: () => {},
  },
  menu: {
    setContext: () => {},
    onAction: () => () => {},
  },
} satisfies AppApi

afterEach(() => {
  delete (window as Window & { api?: AppApi }).api
})

describe('desktop', () => {
  it('reports the browser build when no bridge was injected', () => {
    expect(desktop()).toBeNull()
    expect(isDesktop()).toBe(false)
  })

  it('hands back the bridge the preload script exposed', () => {
    ;(window as Window & { api?: AppApi }).api = stubApi
    expect(desktop()).toBe(stubApi)
    expect(isDesktop()).toBe(true)
  })
})
