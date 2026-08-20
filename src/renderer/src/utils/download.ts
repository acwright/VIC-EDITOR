/** Trigger browser downloads for exported text and binary payloads. */

/** Download a Blob under `filename` via a transient object URL. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Download a text string as a file (default `text/plain`). */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }))
}

/** Download a byte array as a binary file. */
export function downloadBytes(filename: string, bytes: Uint8Array): void {
  downloadBlob(filename, new Blob([bytes as BlobPart], { type: 'application/octet-stream' }))
}

/** Download a canvas as a PNG. */
export function downloadCanvasPng(filename: string, canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(filename, blob)
  }, 'image/png')
}
