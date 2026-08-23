import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The one place the two shells fork in the view layer (PLAN.md D13).
 *
 * The rule this protects is not "the router has an if" — it is that the if is
 * *only* here. `/` resolves per shell; `/edit/:projectId` is shared, and its id
 * stays the project's own UUID so a reload at that route asks main what is open
 * rather than trying to name a file in the URL (D9).
 *
 * The module is re-imported per test because the fork is decided once, when the
 * router is built.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function homeComponentName(): Promise<string> {
  const router = (await import('../index')).default
  const home = router.getRoutes().find((route) => route.path === '/')
  const component = home?.components?.default as { __name?: string } | undefined
  return component?.__name ?? ''
}

describe('the home route', () => {
  it('is the project manager in the browser', async () => {
    expect(await homeComponentName()).toBe('ProjectManagerView')
  })

  it('is the start screen in the desktop shell', async () => {
    // The whole of `isDesktop()`: the preload bridge being there at all.
    vi.stubGlobal('api', {})
    expect(await homeComponentName()).toBe('StartView')
  })
})

describe('the editor route', () => {
  it('is the same in both shells, and keeps its UUID', async () => {
    const router = (await import('../index')).default
    const editor = router.getRoutes().find((route) => route.name === 'editor')
    expect(editor?.path).toBe('/edit/:projectId')
    expect(editor?.props).toBeTruthy()
  })

  it('resolves a project id straight through', async () => {
    const router = (await import('../index')).default
    const id = crypto.randomUUID()
    expect(router.resolve(`/edit/${id}`).params).toEqual({ projectId: id })
  })
})
