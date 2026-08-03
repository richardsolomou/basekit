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

function writeChanges(params: URLSearchParams, path: string, value: unknown, defaults: unknown): void {
  if (Array.isArray(value)) return
  if (value && defaults && typeof value === 'object' && typeof defaults === 'object') {
    for (const [key, child] of Object.entries(value)) {
      writeChanges(params, `${path}.${key}`, child, (defaults as Record<string, unknown>)[key])
    }
    return
  }
  if (!Object.is(value, defaults) && value !== undefined) params.set(path, String(value))
}

function readValue(raw: string | null, defaults: unknown): unknown {
  if (raw === null) return defaults
  if (typeof defaults === 'number') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : defaults
  }
  if (typeof defaults === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : defaults
  return typeof defaults === 'string' ? raw : defaults
}

function readConfig(params: URLSearchParams, path: string, defaults: unknown): unknown {
  if (Array.isArray(defaults)) return defaults
  if (defaults && typeof defaults === 'object') {
    return Object.fromEntries(Object.entries(defaults).map(([key, child]) => [key, readConfig(params, `${path}.${key}`, child)]))
  }
  return readValue(params.get(path), defaults)
}

function writeGroups(params: URLSearchParams, groups: HolderConfig['groups']): void {
  if (JSON.stringify(groups) === JSON.stringify(holderDefaults.groups)) return
  for (const group of groups) params.append('holder.group', `${group.quantity}x${group.diameter}`)
}

function readGroups(params: URLSearchParams): HolderConfig['groups'] {
  const values = params.getAll('holder.group')
  if (values.length === 0) return holderDefaults.groups
  const groups = values.map((value, index) => {
    const match = /^(\d+)x(\d+(?:\.\d+)?)$/.exec(value)
    if (!match) return undefined
    return { id: `models-${index + 1}`, quantity: Number(match[1]), diameter: Number(match[2]) }
  })
  return groups.every((group) => group !== undefined) ? groups : holderDefaults.groups
}

export function shareUrl(project: SharedProject, origin = window.location.origin): string {
  const url = new URL(project.model === 'holder' ? '/holders' : '/', origin)
  const base = {
    ...project.base,
    magnets: { ...project.base.magnets, diameter: undefined, thickness: undefined, clearance: undefined },
  }
  const holder = {
    ...project.holder,
    groups: undefined,
    magnets: { ...project.holder.magnets, diameter: undefined, thickness: undefined, clearance: undefined },
  }
  writeChanges(url.searchParams, 'base', base, baseDefaults)
  writeChanges(url.searchParams, 'holder', holder, holderDefaults)
  writeChanges(
    url.searchParams,
    'magnet',
    {
      diameter: project.base.magnets.diameter,
      thickness: project.base.magnets.thickness,
      clearance: project.base.magnets.clearance,
    },
    {
      diameter: baseDefaults.magnets.diameter,
      thickness: baseDefaults.magnets.thickness,
      clearance: baseDefaults.magnets.clearance,
    },
  )
  writeGroups(url.searchParams, project.holder.groups)
  if (url.searchParams.size > 0) url.searchParams.set('v', '1')
  return url.toString()
}

export function sharedProjectFromUrl(url: string): SharedProject | undefined {
  const parsed = new URL(url)
  const params = parsed.searchParams
  if (params.get('v') !== '1') return undefined
  const base = readConfig(params, 'base', baseDefaults) as BaseConfig
  const holder = { ...(readConfig(params, 'holder', holderDefaults) as HolderConfig), groups: readGroups(params) }
  const magnet = readConfig(params, 'magnet', {
    diameter: baseDefaults.magnets.diameter,
    thickness: baseDefaults.magnets.thickness,
    clearance: baseDefaults.magnets.clearance,
  }) as Pick<BaseConfig['magnets'], 'diameter' | 'thickness' | 'clearance'>
  base.magnets = { ...base.magnets, ...magnet }
  holder.magnets = { ...holder.magnets, ...magnet }
  const text = params.get('base.label.text')
  if (text !== null) base.label.text = text
  if (!validBase(base) || !validHolder(holder)) return undefined
  return { model: parsed.pathname === '/holders' ? 'holder' : 'base', base, holder }
}
