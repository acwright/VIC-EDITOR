import { afterEach, describe, expect, it } from 'vitest'
import type { AppApi } from '@shared/api'
import { desktop, isDesktop } from '../desktop'
import { stubApi } from './stubApi'

/** A stand-in for what the preload script exposes. */
const api = stubApi()

afterEach(() => {
  delete (window as Window & { api?: AppApi }).api
})

describe('desktop', () => {
  it('reports the browser build when no bridge was injected', () => {
    expect(desktop()).toBeNull()
    expect(isDesktop()).toBe(false)
  })

  it('hands back the bridge the preload script exposed', () => {
    ;(window as Window & { api?: AppApi }).api = api
    expect(desktop()).toBe(api)
    expect(isDesktop()).toBe(true)
  })
})
