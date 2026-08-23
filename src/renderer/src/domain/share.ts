/**
 * Share links — the whole project, compressed, in the URL fragment:
 * `…/#v=<scheme><base64url>`. Scheme `1` is gzip (Compression
 * Streams), `0` is plain, so a browser without the API still produces and
 * reads links. Fragments are never sent to a server; sharing needs no backend.
 */

import { isDesktop } from '@/utils/desktop'
import { deserializeProject } from './serialization'
import type { Project } from './types'

/** Hash parameter carrying a shared project (PLAN.md D18 — renamed from the
 * seed project's `p` so links from the two apps can't be confused). */
export const SHARE_PARAM = 'v'

const SCHEME_GZIP = '1'
const SCHEME_PLAIN = '0'

/**
 * Where a link stops being safe to paste anywhere. 8 KB is the request-line
 * limit most servers, proxies and link-handling tools are built around; the
 * fragment never reaches a server, but redirectors, QR codes and archived
 * copies of a link all assume it.
 *
 * It is deliberately not the 2 KB legacy-browser figure. A VIC project carries
 * a 2 KB character set, so measured payloads sit far above that (see
 * `share.spec.ts`): a default 22 x 23 project with the 256-character ROM set
 * seeded in is ~2.5 KB, ~3.2 KB with every cell drawn. Warning at 2 KB would
 * have flagged every project this editor can produce, which tells the user
 * nothing. The exact length is shown either way.
 */
export const SHARE_LENGTH_WARNING = 8000

export class ShareLinkError extends Error {
  constructor(message = 'This share link is damaged or incomplete.') {
    super(message)
    this.name = 'ShareLinkError'
  }
}

// --- base64url ---

function toBase64Url(bytes: Uint8Array): string {
  // Chunked so a large project doesn't blow the argument limit of fromCharCode.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(base64)
  } catch {
    throw new ShareLinkError()
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- gzip ---

function hasCompressionStreams(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

async function pump(
  bytes: Uint8Array<ArrayBuffer>,
  // The DOM types have these streams accept any BufferSource on the write side.
  stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter()
  // Not awaited: writing blocks on backpressure until the reader below drains.
  // A corrupt payload fails both sides; the reader's rejection is the one we
  // report, so the writer's is swallowed rather than left unhandled.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

// --- encode / decode ---

/** Compress a project into the payload half of a share link. */
export async function encodeShare(project: Project): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project))
  if (!hasCompressionStreams()) return SCHEME_PLAIN + toBase64Url(bytes)
  return SCHEME_GZIP + toBase64Url(await pump(bytes, new CompressionStream('gzip')))
}

/** Decode and validate a share payload. Throws ShareLinkError or ProjectValidationError. */
export async function decodeShare(payload: string): Promise<Project> {
  const scheme = payload.charAt(0)
  const body = payload.slice(1)
  if (!body || (scheme !== SCHEME_GZIP && scheme !== SCHEME_PLAIN)) throw new ShareLinkError()

  let bytes = fromBase64Url(body)
  if (scheme === SCHEME_GZIP) {
    if (!hasCompressionStreams()) {
      throw new ShareLinkError('This browser cannot open compressed share links.')
    }
    try {
      bytes = await pump(bytes, new DecompressionStream('gzip'))
    } catch {
      throw new ShareLinkError()
    }
  }
  return deserializeProject(new TextDecoder().decode(bytes))
}

// --- URL plumbing ---

/**
 * Absolute share URL for a payload (D21).
 *
 * In a browser it is rooted where the app is actually served from, so a fork
 * deployed somewhere else shares its own address. **On the desktop it is rooted
 * at the published web app**, because the desktop shell's own origin is
 * `app://…` — a link built from that resolves only inside a copy of the app
 * that will never receive it, which is what `v1.6` shipped.
 */
export function shareUrl(payload: string): string {
  const base = isDesktop()
    ? __WEB_APP_URL__
    : `${window.location.origin}${import.meta.env.BASE_URL}`
  return `${base}#${SHARE_PARAM}=${payload}`
}

/** Extract the share payload from a location hash (`#v=…`), or null. */
export function readShareHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const payload = params.get(SHARE_PARAM)
  return payload ? payload : null
}

let pending: string | null = null

/**
 * Read a share payload off the current URL once at startup and strip the hash,
 * so a reload doesn't re-prompt. Call before the manager view mounts; returns
 * whether a link was found.
 */
export function capturePendingShare(): boolean {
  const payload = readShareHash(window.location.hash)
  if (!payload) return false
  pending = payload
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return true
}

/** Take the captured payload (clearing it), or null if there wasn't one. */
export function takePendingShare(): string | null {
  const payload = pending
  pending = null
  return payload
}
