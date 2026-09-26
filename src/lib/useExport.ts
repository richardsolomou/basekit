import { useState } from 'react'
import { zipSync } from 'fflate'
import { to3mf, toStl } from '@/geometry/exporters'
import { holderName, holderPlan } from '@/geometry/holder'
import { tokenHeight, tokenName } from '@/geometry/token'
import { baseName } from '@/geometry/outline'
import { paintingHandleConfig, paintingHandleDimensions, paintingHandleName, paintingTrayName } from '@/geometry/paintingTray'
import { exportSegmentsFor } from '@/geometry/quality'
import { stemName, stemOverallHeight } from '@/geometry/stem'
import type { BaseConfig, FlightStemConfig, HolderConfig, TokenConfig, PaintingTrayConfig, PartConfig } from '@/geometry/types'
import posthog from '@/lib/posthog'
import { buildMesh } from './buildMesh'
import { asMeshLike, download } from './download'

type ExportFormat = 'stl' | '3mf'

interface ExportOptions {
  model: 'base' | 'holder' | 'painting' | 'stem' | 'token'
  base: BaseConfig
  holder: HolderConfig
  paintingTray: PaintingTrayConfig
  stem: FlightStemConfig
  token: TokenConfig
  width: number
  length: number
}

export function useExport({ model, base, holder, paintingTray, stem, token, width, length }: ExportOptions) {
  const [exporting, setExporting] = useState<ExportFormat>()
  const [error, setError] = useState<string>()
  const config: PartConfig =
    model === 'base' ? base : model === 'holder' ? holder : model === 'painting' ? paintingTray : model === 'stem' ? stem : token
  const name =
    model === 'base'
      ? baseName(base)
      : model === 'holder'
        ? holderName(holder)
        : model === 'painting'
          ? paintingTrayName(paintingTray)
          : model === 'stem'
            ? stemName(stem)
            : tokenName(token)

  const run = async <T>(format: ExportFormat, operation: () => Promise<T>): Promise<T | undefined> => {
    setExporting(format)
    setError(undefined)
    try {
      const result = await operation()
      posthog.capture(`${model}_exported`, {
        format,
        width,
        length,
        height: config.kind === 'stem' ? stemOverallHeight(config) : config.kind === 'token' ? tokenHeight(config) : config.height,
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
  const buildPaintingParts = async () => {
    const handleConfig = paintingHandleConfig(paintingTray)
    const handleSize = paintingHandleDimensions(handleConfig)
    const [trayMesh, handleMesh] = await Promise.all([
      buildMesh({ ...paintingTray, assembly: false, segments: exportSegmentsFor(Math.max(width, length)) }),
      buildMesh({ ...handleConfig, segments: exportSegmentsFor(Math.max(handleSize.width, handleSize.length)) }),
    ])
    return [
      { mesh: asMeshLike(trayMesh), name: paintingTrayName(paintingTray) },
      { mesh: asMeshLike(handleMesh), name: paintingHandleName(paintingTray) },
    ]
  }

  const exportStl = () =>
    run('stl', async () => {
      if (model === 'painting') {
        const parts = await buildPaintingParts()
        const files = Object.fromEntries(parts.map((part) => [`${part.name}.stl`, toStl(part.mesh, part.name)]))
        download(`${name}.zip`, zipSync(files))
        return
      }
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
      if (model === 'painting') {
        download(`${name}.3mf`, to3mf(await buildPaintingParts(), true))
        return
      }
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
