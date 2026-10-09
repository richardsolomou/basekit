import { useState } from 'react'
import { zipSync } from 'fflate'
import { packPlates, to3mf, to3mfPlates, toStl } from '@/geometry/exporters'
import { holderName, holderPlan } from '@/geometry/holder'
import { movementTrayHeight, movementTrayName } from '@/geometry/movementTray'
import { tokenHeight, tokenName } from '@/geometry/token'
import { baseName, footprint } from '@/geometry/outline'
import { paintingHandleConfig, paintingHandleDimensions, paintingHandleName, paintingTrayName } from '@/geometry/paintingTray'
import { exportSegmentsFor } from '@/geometry/quality'
import { stemName, stemOverallHeight } from '@/geometry/stem'
import type {
  BaseConfig,
  FlightStemConfig,
  HolderConfig,
  MovementTrayConfig,
  TokenConfig,
  PaintingTrayConfig,
  PartConfig,
} from '@/geometry/types'
import posthog from '@/lib/posthog'
import { batchFileName } from './batch'
import { buildMesh } from './buildMesh'
import { asMeshLike, download } from './download'

export type ExportFormat = 'stl' | '3mf' | 'batch-stl' | 'batch-3mf'

interface BatchPart {
  config: BaseConfig
  quantity: number
}

interface ExportOptions {
  model: 'base' | 'holder' | 'movement' | 'painting' | 'stem' | 'token'
  base: BaseConfig
  holder: HolderConfig
  movementTray: MovementTrayConfig
  paintingTray: PaintingTrayConfig
  stem: FlightStemConfig
  token: TokenConfig
  width: number
  length: number
  batch: BatchPart[]
  batchName: string
}

export function useExport({
  model,
  base,
  holder,
  movementTray,
  paintingTray,
  stem,
  token,
  width,
  length,
  batch,
  batchName,
}: ExportOptions) {
  const [exporting, setExporting] = useState<ExportFormat>()
  const [error, setError] = useState<string>()
  const config: PartConfig =
    model === 'base'
      ? base
      : model === 'holder'
        ? holder
        : model === 'movement'
          ? movementTray
          : model === 'painting'
            ? paintingTray
            : model === 'stem'
              ? stem
              : token
  const name =
    model === 'base'
      ? baseName(base)
      : model === 'holder'
        ? holderName(holder)
        : model === 'movement'
          ? movementTrayName(movementTray)
          : model === 'painting'
            ? paintingTrayName(paintingTray)
            : model === 'stem'
              ? stemName(stem)
              : tokenName(token)

  const run = async (
    format: ExportFormat,
    operation: () => Promise<void>,
    event = `${model}_exported`,
    properties: Record<string, number> = {
      width,
      length,
      height:
        config.kind === 'stem'
          ? stemOverallHeight(config)
          : config.kind === 'token'
            ? tokenHeight(config)
            : config.kind === 'movement-tray'
              ? movementTrayHeight(config)
              : config.height,
    },
  ) => {
    setExporting(format)
    setError(undefined)
    try {
      await operation()
      posthog.capture(event, { format, ...properties })
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

  const batchProperties = { sizes: batch.length, bases: batch.reduce((total, part) => total + part.quantity, 0) }
  const buildBatch = () =>
    Promise.all(
      batch.map(async ({ config: part, quantity }) => {
        const size = footprint(part)
        const mesh = await buildMesh({ ...part, segments: exportSegmentsFor(Math.max(size.width, size.length)) })
        return { mesh: asMeshLike(mesh), config: part, quantity }
      }),
    )

  const exportBatchStl = () =>
    run(
      'batch-stl',
      async () => {
        const parts = await buildBatch()
        const files = Object.fromEntries(
          parts.map(({ mesh, config: part, quantity }) => {
            const filename = `${batchFileName(part, quantity)}.stl`
            return [filename, toStl(mesh, filename)]
          }),
        )
        download(`${batchName}.zip`, zipSync(files))
      },
      'base_batch_exported',
      batchProperties,
    )

  const exportBatch3mf = () =>
    run(
      'batch-3mf',
      async () => {
        const parts = await buildBatch()
        const plates = packPlates(
          parts.map(({ mesh }) => mesh),
          parts.map(({ quantity }) => quantity),
        )
        const meshes = parts.map(({ mesh, config: part }) => ({ mesh, name: baseName(part) }))
        download(
          `${batchName}.3mf`,
          to3mfPlates(
            meshes,
            plates.map((items, index) => ({ name: plates.length === 1 ? batchName : `${batchName}-plate-${index + 1}`, items })),
          ),
        )
      },
      'base_batch_exported',
      batchProperties,
    )

  return { exporting, error, exportStl, export3mf, exportBatchStl, exportBatch3mf }
}
