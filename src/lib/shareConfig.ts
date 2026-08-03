import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

export type SharedProject = {
  model: 'base' | 'holder'
  base: BaseConfig
  holder: HolderConfig
}

const baseDefaults = presetFor(DEFAULT_PRESET)
const holderDefaults = defaultHolderConfig()

function matches(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) return Array.isArray(value)
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return Object.entries(template).every(([key, expected]) => matches((value as Record<string, unknown>)[key], expected))
  }
  return typeof value === typeof template
}

function validHolder(value: unknown): value is HolderConfig {
  if (!matches(value, holderDefaults)) return false
  const config = value as HolderConfig
  return (
    config.kind === 'holder' &&
    ['slots', 'module'].includes(config.engraving.placement) &&
    config.groups.length > 0 &&
    config.groups.every((group) => matches(group, holderDefaults.groups[0]))
  )
}

function validBase(value: unknown): value is BaseConfig {
  if (!matches(value, baseDefaults)) return false
  const config = value as BaseConfig
  return (
    ['round', 'oval', 'pill', 'rect', 'polygon'].includes(config.shape) &&
    ['taper', 'straight', 'bevel', 'round'].includes(config.profile) &&
    ['well', 'solid'].includes(config.underside)
  )
}

function changed(value: unknown, defaults: unknown): unknown {
  if (Array.isArray(value)) return JSON.stringify(value) === JSON.stringify(defaults) ? undefined : value
  if (value && defaults && typeof value === 'object' && typeof defaults === 'object') {
    const delta = Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, changed(child, (defaults as Record<string, unknown>)[key])])
        .filter(([, child]) => child !== undefined),
    )
    return Object.keys(delta).length === 0 ? undefined : delta
  }
  return Object.is(value, defaults) ? undefined : value
}

function restored(defaults: unknown, delta: unknown): unknown {
  if (Array.isArray(defaults)) return Array.isArray(delta) ? delta : defaults
  if (defaults && typeof defaults === 'object') {
    const changes = delta && typeof delta === 'object' && !Array.isArray(delta) ? (delta as Record<string, unknown>) : {}
    return Object.fromEntries(
      Object.entries(defaults).map(([key, child]) => [key, Object.hasOwn(changes, key) ? restored(child, changes[key]) : child]),
    )
  }
  return delta === undefined ? defaults : delta
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64ToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function encodeSharedProject(project: SharedProject): string {
  const payload = {
    version: 1,
    model: project.model,
    base: changed(project.base, baseDefaults) ?? {},
    holder: changed(project.holder, holderDefaults) ?? {},
  }
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeSharedProject(value: string | null): SharedProject | undefined {
  if (!value) return undefined
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(base64ToBytes(value)))
    if (!payload || typeof payload !== 'object') return undefined
    const { version, model, base, holder } = payload as Record<string, unknown>
    if (version !== 1 || (model !== 'base' && model !== 'holder')) return undefined
    const restoredBase = restored(baseDefaults, base)
    const restoredHolder = restored(holderDefaults, holder)
    const labelDelta =
      base &&
      typeof base === 'object' &&
      !Array.isArray(base) &&
      (base as Record<string, unknown>).label &&
      typeof (base as Record<string, unknown>).label === 'object'
        ? ((base as Record<string, { text?: unknown }>).label.text ?? undefined)
        : undefined
    if (restoredBase && typeof restoredBase === 'object' && 'label' in restoredBase && typeof labelDelta === 'string') {
      const restoredConfig = restoredBase as BaseConfig
      restoredConfig.label.text = labelDelta
    }
    if (validBase(restoredBase) && validHolder(restoredHolder)) return { model, base: restoredBase, holder: restoredHolder }
  } catch {
    return undefined
  }
  return undefined
}

export function sharedProjectFromUrl(url: string): SharedProject | undefined {
  return decodeSharedProject(new URL(url).searchParams.get('share'))
}

export function shareUrl(project: SharedProject, origin = window.location.origin): string {
  const url = new URL(project.model === 'holder' ? '/holders' : '/', origin)
  url.searchParams.set('share', encodeSharedProject(project))
  return url.toString()
}
