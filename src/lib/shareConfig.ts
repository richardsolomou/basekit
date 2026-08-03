import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig, PartConfig } from '../geometry/types'

export type SharedConfig = { model: 'base'; config: BaseConfig } | { model: 'holder'; config: HolderConfig }

const baseTemplate = presetFor(DEFAULT_PRESET)
const holderTemplate = defaultHolderConfig()

function matches(value: unknown, template: unknown): boolean {
  if (Array.isArray(template)) return Array.isArray(value)
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return Object.entries(template).every(([key, expected]) => matches((value as Record<string, unknown>)[key], expected))
  }
  return typeof value === typeof template
}

function validHolder(value: unknown): value is HolderConfig {
  if (!matches(value, holderTemplate)) return false
  const config = value as HolderConfig
  return (
    config.kind === 'holder' &&
    ['slots', 'module'].includes(config.engraving.placement) &&
    config.groups.length > 0 &&
    config.groups.every((group) => matches(group, holderTemplate.groups[0]))
  )
}

function validBase(value: unknown): value is BaseConfig {
  if (!matches(value, baseTemplate)) return false
  const config = value as BaseConfig
  return (
    ['round', 'oval', 'pill', 'rect', 'polygon'].includes(config.shape) &&
    ['taper', 'straight', 'bevel', 'round'].includes(config.profile) &&
    ['well', 'solid'].includes(config.underside)
  )
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

export function encodeSharedConfig(config: PartConfig): string {
  const payload = config.kind === 'holder' ? { version: 1, model: 'holder', config } : { version: 1, model: 'base', config }
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeSharedConfig(value: string | null): SharedConfig | undefined {
  if (!value) return undefined
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(base64ToBytes(value)))
    if (!payload || typeof payload !== 'object') return undefined
    const { version, model, config } = payload as Record<string, unknown>
    if (version !== 1) return undefined
    if (model === 'base' && validBase(config)) return { model, config }
    if (model === 'holder' && validHolder(config)) return { model, config }
  } catch {
    return undefined
  }
  return undefined
}

export function sharedConfigFromUrl(url: string): SharedConfig | undefined {
  const parsed = new URL(url)
  const shared = decodeSharedConfig(parsed.searchParams.get('config'))
  const model = parsed.pathname === '/holders' ? 'holder' : 'base'
  return shared?.model === model ? shared : undefined
}

export function shareUrl(config: PartConfig, origin = window.location.origin): string {
  const url = new URL(config.kind === 'holder' ? '/holders' : '/', origin)
  url.searchParams.set('config', encodeSharedConfig(config))
  return url.toString()
}
