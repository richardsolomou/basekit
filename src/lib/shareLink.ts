import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { workspaceSetup, type WorkspacePart, type WorkspaceState } from './workspace'

const HASH_PREFIX = '#setup='
const SHARE_VERSION = 1
/** Past this a link stops pasting cleanly into chat apps, so a token image is left out. */
export const MAX_SHARE_URL_LENGTH = 8192

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0))
}

function linkFor(page: string, workspace: WorkspaceState, part: WorkspacePart): string {
  const payload = { v: SHARE_VERSION, ...workspaceSetup(workspace, part) }
  return `${page}${HASH_PREFIX}${toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }))}`
}

/** `page` is the generator's address without a hash; the setup travels in the hash so no server ever sees it. */
export function shareLink(page: string, workspace: WorkspaceState, part: WorkspacePart): { url: string; imageOmitted: boolean } {
  const url = linkFor(page, workspace, part)
  if (url.length <= MAX_SHARE_URL_LENGTH || part !== 'token' || workspace.token.image === null) return { url, imageOmitted: false }
  return { url: linkFor(page, { ...workspace, token: { ...workspace.token, image: null } }, part), imageOmitted: true }
}

/** Decodes a share hash into an unvalidated setup, or undefined for any other or unreadable hash. */
export function readShareHash(hash: string): unknown {
  if (!hash.startsWith(HASH_PREFIX)) return undefined
  try {
    const payload = JSON.parse(strFromU8(inflateSync(fromBase64Url(hash.slice(HASH_PREFIX.length))))) as unknown
    if (typeof payload !== 'object' || payload === null || (payload as { v?: unknown }).v !== SHARE_VERSION) return undefined
    return payload
  } catch {
    return undefined
  }
}

/** Removes a share hash from the address so a later reload uses the saved workspace, and returns its setup. */
export function takeShareHash(): unknown {
  const { hash, pathname, search } = window.location
  if (!hash.startsWith(HASH_PREFIX)) return undefined
  window.history.replaceState(null, '', pathname + search)
  return readShareHash(hash)
}
