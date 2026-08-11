import { useState } from 'react'
import { zipSync } from 'fflate'
import { to3mf, toStl } from '@/geometry/exporters'
import { holderName, holderPlan, holderRiserConfig, holderRiserCount, riserName } from '@/geometry/holder'
import { baseName } from '@/geometry/outline'
import { exportSegmentsFor } from '@/geometry/quality'
import type { BaseConfig, HolderConfig } from '@/geometry/types'
import posthog from '@/lib/posthog'
import { buildMesh } from './buildMesh'
import { asMeshLike, download } from './download'

type ExportFormat = 'stl' | '3mf'

interface ExportOptions {
  model: 'base' | 'holder'
  base: BaseConfig
  holder: HolderConfig
  width: number
  length: number
}

export function useExport({ model, base, holder, width, length }: ExportOptions) {
  const [exporting, setExporting] = useState<ExportFormat>()
  const [error, setError] = useState<string>()
  const config: BaseConfig | HolderConfig = model === 'base' ? base : holder
  const name = model === 'base' ? baseName(base) : holderName(holder)

  const run = async <T>(format: ExportFormat, operation: () => Promise<T>): Promise<T | undefined> => {
    setExporting(format)
    setError(undefined)
    try {
      const result = await operation()
      posthog.capture(`${model}_exported`, { format, width, length, height: config.height })
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
        buildMesh({
          ...module.config,
          riser: { ...module.config.riser, enabled: false },
          segments: exportSegmentsFor(Math.max(module.layout.width, module.layout.length)),
        }),
      ),
    )
  const riserConfig = model === 'holder' && holder.riser.enabled ? holderRiserConfig(holder) : undefined
  const riserCount = model === 'holder' ? holderRiserCount(holder) : 0
  const buildRiser = () =>
    buildMesh({
      ...riserConfig!,
      segments: exportSegmentsFor(42),
    })

  const exportStl = () =>
    run('stl', async () => {
      if (plan && (plan.modules.length > 1 || riserConfig)) {
        const meshes = await buildModules()
        const files = Object.fromEntries(
          meshes.map((mesh, index) => {
            const moduleName = `module-${index + 1}-${holderName({
              ...plan.modules[index].config,
              riser: { ...plan.modules[index].config.riser, enabled: false },
            })}.stl`
            return [moduleName, toStl(asMeshLike(mesh), moduleName)]
          }),
        )
        if (riserConfig) {
          const riserMesh = await buildRiser()
          const supportName = `print-${riserCount}x-${riserName(riserConfig)}.stl`
          files[supportName] = toStl(asMeshLike(riserMesh), supportName)
        }
        download(`${name}.zip`, zipSync(files))
        return
      }
      const mesh = await build()
      const filename = `${name}.stl`
      download(filename, toStl(asMeshLike(mesh), filename))
    })

  const export3mf = () =>
    run('3mf', async () => {
      if (plan && (plan.modules.length > 1 || riserConfig)) {
        const meshes = await buildModules()
        const modules = meshes.map((mesh, index) => ({
          mesh: asMeshLike(mesh),
          name: `module-${index + 1}-${holderName({
            ...plan.modules[index].config,
            riser: { ...plan.modules[index].config.riser, enabled: false },
          })}`,
        }))
        if (riserConfig) {
          modules.push({ mesh: asMeshLike(await buildRiser()), name: `print-${riserCount}x-${riserName(riserConfig)}` })
        }
        const filename = riserConfig ? `${name}.3mf` : `${name.replace(/^holder-/, `holders-${modules.length}-`)}.3mf`
        download(filename, to3mf(modules, true))
        return
      }
      const mesh = await build()
      download(`${name}.3mf`, to3mf([{ mesh: asMeshLike(mesh), name }]))
    })

  return { exporting, error, exportStl, export3mf }
}
