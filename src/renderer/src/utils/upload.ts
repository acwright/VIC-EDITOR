/**
 * Read a project file the user picked.
 *
 * The counterpart to `download.ts`, and the same two shells: a hidden
 * `<input type="file">` in the browser, a native open dialog on the desktop.
 * Both resolve to the file's text, or to `null` when the user cancelled —
 * cancelling is a no-op either way, not an error the caller has to report.
 */

import { desktop } from './desktop'

/** The extension a project export writes, and the only one worth offering. */
const PROJECT_EXTENSION = 'json'

/** Ask for a project file and hand back its text, or `null` if cancelled. */
export function pickProjectFile(): Promise<string | null> {
  const api = desktop()
  if (api) {
    return api.files
      .openText({ extensions: [PROJECT_EXTENSION] })
      .then((file) => file?.text ?? null)
  }
  return pickInBrowser()
}

function pickInBrowser(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = `.${PROJECT_EXTENSION},application/json`
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      resolve(file ? file.text() : null)
    })
    // Without this a dismissed picker would leave the promise pending forever,
    // since `change` only fires when something was actually chosen.
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
