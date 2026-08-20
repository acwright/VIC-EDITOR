/**
 * Save exported text and binary payloads.
 *
 * Two shells, one set of signatures. In the browser this is the anchor-plus-
 * object-URL download it always was; in the desktop app the same call opens a
 * native save dialog and writes where the user pointed it. The branch lives
 * here so no caller has to know which shell it is running in (§ Phase E4).
 *
 * Nothing here reports success. A browser download cannot be observed, and on
 * the desktop a cancelled dialog is a deliberate no-op — so the desktop write
 * is fire-and-forget too, and a genuine write failure is reported by the main
 * process in a native error box rather than travelling back here.
 */

import { desktop } from './desktop'

const encoder = new TextEncoder()

/** Download a Blob under `filename` via a transient object URL. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Hand `data` to the native save dialog, if there is one.
 *
 * Returns whether the desktop path took the payload, so the caller can fall
 * through to the browser download when it did not.
 */
function saveToDisk(filename: string, data: Uint8Array): boolean {
  const api = desktop()
  if (!api) return false
  void api.files.save({ filename, data }).catch((error: unknown) => {
    console.error('[download] save dialog:', error)
  })
  return true
}

/** Download a text string as a file (default `text/plain`). */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  if (saveToDisk(filename, encoder.encode(text))) return
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

/** Download a byte array as a binary file. */
export function downloadBytes(filename: string, bytes: Uint8Array): void {
  if (saveToDisk(filename, bytes)) return
  downloadBlob(filename, new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
}

/** Download a canvas as a PNG. */
export function downloadCanvasPng(filename: string, canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) return
    // The PNG only exists as a Blob, so unlike the other two this one has to
    // read the bytes back out before it can hand them over.
    if (desktop()) {
      void blob
        .arrayBuffer()
        .then((buffer) => saveToDisk(filename, new Uint8Array(buffer)))
        .catch((error: unknown) => console.error('[download] png:', error))
      return
    }
    downloadBlob(filename, blob)
  }, 'image/png')
}
