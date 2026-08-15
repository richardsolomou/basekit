import { useState } from 'react'
import { zipSync } from 'fflate'
import { to3mf, toStl } from '@/geometry/exporters'
import { holderName, holderPlan } from '@/geometry/holder'
import { baseName } from '@/geometry/outline'
import { exportSegmentsFor } from '@/geometry/quality'
import { tierName } from '@/geometry/tier'
import type { BaseConfig, HolderConfig, PartConfig, TierConfig } from '@/geometry/types'
import posthog from '@/lib/posthog'
import { buildMesh } from './buildMesh'
import { asMeshLike, download } from './download'

type ExportFormat = 'stl' | '3mf'

interface ExportOptions {
  model: 'base' | 'holder' | 'tier'
  base: BaseConfig
  holder: HolderConfig
  tier: TierConfig
  width: number
  length: number
}

export function useExport({ model, base, holder, tier, width, length }: ExportOptions) {
  const [exporting, setExporting] = useState<ExportFormat>()
  const [error, setError] = useState<string>()
  const config: PartConfig = model === 'base' ? base : model === 'holder' ? holder : tier
  const name = model === 'base' ? baseName(base) : model === 'holder' ? holderName(holder) : tierName(tier)

  const run = async <T>(format: ExportFormat, operation: () => Promise<T>): Promise<T | undefined> => {
    setExporting(format)
    setError(undefined)
    try {
      const result = await operation()
      posthog.capture(`${model}_exported`, {
        format,
        width,
        length,
        height: config.kind === 'tier' ? config.clearance + config.deckThickness : config.height,
      })
      return result
    } catch (failure) {
      posthog.captureException(failure, { export_format: format, model })
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setExporting(undefined)
    }
  }

  const build = () => buildMesh({ ...config, segments: exportSegmentsFor(Math.max(width, length)) })
  const plan = model === 'holder' ? holderPlan(holder) : undefined
  const buildModules = () =>
    Promise.all(
      plan!.modules.map((module) =>
        buildMesh({ ...module.config, segments: exportSegmentsFor(Math.max(module.layout.width, module.layout.length)) }),
      ),
    )

  const exportStl = () =>
    run('stl', async () => {
      if (plan && plan.modules.length > 1) {
        const meshes = await buildModules()
        const files = Object.fromEntries(
          meshes.map((mesh, index) => {
            const moduleName = `module-${index + 1}-${holderName(plan.modules[index].config)}.stl`
            return [moduleName, toStl(asMeshLike(mesh), moduleName)]
          }),
        )
        download(`${name}.zip`, zipSync(files))
        return
      }
      const mesh = await build()
      const filename = `${name}.stl`
      download(filename, toStl(asMeshLike(mesh), filename))
    })

  const export3mf = () =>
    run('3mf', async () => {
      if (plan && plan.modules.length > 1) {
        const meshes = await buildModules()
        const modules = meshes.map((mesh, index) => ({
          mesh: asMeshLike(mesh),
          name: `module-${index + 1}-${holderName(plan.modules[index].config)}`,
        }))
        download(`${name.replace(/^holder-/, `holders-${modules.length}-`)}.3mf`, to3mf(modules, true))
        return
      }
      const mesh = await build()
      download(`${name}.3mf`, to3mf([{ mesh: asMeshLike(mesh), name }]))
    })

  return { exporting, error, exportStl, export3mf }
}
