import { Box, Download, PanelLeft } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { BasePanel } from '@/components/panels/BasePanel'
import { HolderPanel } from '@/components/panels/HolderPanel'
import { PaintingTrayPanel } from '@/components/panels/PaintingTrayPanel'
import {
  AUTOMATIC_MAGNET_COUNT,
  fitSlotDepth,
  safeEdgeSize,
  type MagnetCountChoice,
  type ResetAction,
  type SharedMagnetChanges,
  type SharedMagnetPlacementChanges,
} from '@/components/panels/shared'
import { StemPanel } from '@/components/panels/StemPanel'
import { TokenPanel } from '@/components/panels/TokenPanel'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import { holderLayout, holderName, holderPlan, maxHolderMagnetThickness } from '@/geometry/holder'
import { baseName, footprint, isElongated } from '@/geometry/outline'
import { footprintKey, SIZES_BY_SHAPE } from '@/geometry/presets'
import { maxTokenEdgeSize, tokenHeight, tokenName } from '@/geometry/token'
import {
  paintingHandleAxisCenter,
  paintingTrayAssemblyHeight,
  paintingTrayAssemblyMinZ,
  paintingTrayLayout,
  paintingTrayName,
} from '@/geometry/paintingTray'
import { stemMaximumDiameter, stemName, stemOverallHeight } from '@/geometry/stem'
import type { BaseConfig, FlightStemConfig, TokenConfig, HolderConfig, PaintingTrayConfig } from '@/geometry/types'
import { loadTokenImage } from '@/lib/tokenImage'
import { batchBaseConfig, batchName } from '@/lib/batch'
import { useExport } from '@/lib/useExport'
import { useGenerator } from '@/lib/useGenerator'
import { useMediaQuery } from '@/lib/useMediaQuery'
import posthog from '@/lib/posthog'
import {
  loadWorkspace,
  resetGenerator,
  resetShared,
  saveWorkspace,
  synchronizeWorkspace,
  type GeneratorSettings,
  type WorkspaceState,
} from '@/lib/workspace'

const MODELS = [
  { value: 'base' as const, label: 'Bases', mobileLabel: 'Bases', href: '/' },
  { value: 'holder' as const, label: 'Holders', mobileLabel: 'Holders', href: '/holders' },
  { value: 'painting' as const, label: 'Spray tray', mobileLabel: 'Spray', href: '/spray-tray' },
  { value: 'stem' as const, label: 'Stems', mobileLabel: 'Stems', href: '/stems' },
  { value: 'token' as const, label: 'Tokens', mobileLabel: 'Tokens', href: '/tokens' },
]
type Generator = (typeof MODELS)[number]['value']

const modelForPath = (): Generator => MODELS.find((item) => item.href === window.location.pathname)?.value ?? 'base'
const modelLabel = (model: Generator) =>
  model === 'base' ? 'Base' : model === 'holder' ? 'Holder' : model === 'painting' ? 'Spray tray' : model === 'stem' ? 'Stem' : 'Token'

export function App() {
  const [workspace, setWorkspaceState] = useState(() => loadWorkspace(window.localStorage))
  const config = workspace.base
  const holder = workspace.holder
  const paintingTray = workspace.paintingTray
  const stem = workspace.stem
  const token = workspace.token
  const setWorkspace = (next: WorkspaceState | ((current: WorkspaceState) => WorkspaceState)) =>
    setWorkspaceState((current) => synchronizeWorkspace(typeof next === 'function' ? next(current) : next))
  const setConfig = (next: BaseConfig | ((current: BaseConfig) => BaseConfig)) =>
    setWorkspace((current) => ({ ...current, base: typeof next === 'function' ? next(current.base) : next }))
  const setHolder = (next: HolderConfig | ((current: HolderConfig) => HolderConfig)) =>
    setWorkspace((current) => ({ ...current, holder: typeof next === 'function' ? next(current.holder) : next }))
  const setPaintingTray = (next: PaintingTrayConfig | ((current: PaintingTrayConfig) => PaintingTrayConfig)) =>
    setWorkspace((current) => ({
      ...current,
      paintingTray: typeof next === 'function' ? next(current.paintingTray) : next,
    }))
  const setStem = (next: FlightStemConfig | ((current: FlightStemConfig) => FlightStemConfig)) =>
    setWorkspace((current) => ({ ...current, stem: typeof next === 'function' ? next(current.stem) : next }))
  const patchToken = (changes: Partial<TokenConfig>) =>
    setWorkspace((current) => {
      const next = { ...current.token, ...changes }
      return { ...current, token: { ...next, profileSize: Math.min(next.profileSize, maxTokenEdgeSize(next)) } }
    })
  const [customBaseSize, setCustomBaseSize] = useState(() => {
    const { width, length } = footprint(workspace.base)
    return !SIZES_BY_SHAPE[workspace.base.shape].some((size) => size.width === width && (size.length ?? size.width) === length)
  })
  const [model, setModel] = useState<Generator>(modelForPath)
  const [tokenImageError, setTokenImageError] = useState<string>()
  const addTokenImage = async (file: File) => {
    setTokenImageError(undefined)
    try {
      const image = await loadTokenImage(file)
      posthog.capture('token_image_added', { width: image.width, height: image.height, type: file.type })
      patchToken({ image })
    } catch (failure) {
      setTokenImageError(failure instanceof Error ? failure.message : String(failure))
    }
  }
  const dropTokenImage = useEffectEvent((file: File) => void addTokenImage(file))
  useEffect(() => {
    if (model !== 'token') return
    const accept = (event: DragEvent) => event.preventDefault()
    const drop = (event: DragEvent) => {
      event.preventDefault()
      const file = event.dataTransfer?.files[0]
      if (file) dropTokenImage(file)
    }
    window.addEventListener('dragover', accept)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', accept)
      window.removeEventListener('drop', drop)
    }
  }, [model])
  // Tailwind's `md`, the width at which the panel stops needing to slide in.
  const docked = useMediaQuery('(min-width: 48rem)')
  const partConfig =
    model === 'base' ? config : model === 'holder' ? holder : model === 'painting' ? paintingTray : model === 'stem' ? stem : token
  const { preview, grams, error } = useGenerator(partConfig)

  useEffect(() => {
    const syncRoute = () => setModel(modelForPath())
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  useEffect(() => {
    document.title = `BaseKit — ${
      model === 'base'
        ? 'Bases'
        : model === 'holder'
          ? 'Holders'
          : model === 'painting'
            ? 'Spray Trays'
            : model === 'stem'
              ? 'Flying Stems'
              : 'Tokens'
    }`
  }, [model])

  useEffect(() => saveWorkspace(window.localStorage, workspace), [workspace])

  const generators = useRef<HTMLElement>(null)
  useEffect(() => {
    const href = MODELS.find((item) => item.value === model)!.href
    generators.current?.querySelector(`[href="${href}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [model])

  const changeModel = (next: Generator) => {
    if (next === model) return
    posthog.capture('generator_selected', { generator: next })
    window.history.pushState(null, '', MODELS.find((item) => item.value === next)!.href)
    setModel(next)
  }

  const patch = (changes: Partial<BaseConfig>) =>
    setConfig((current) => {
      const next = { ...current, ...changes }
      return { ...next, profileSize: Math.min(next.profileSize, safeEdgeSize(next)) }
    })
  const { width, length } = footprint(config)
  const holderSize = useMemo(() => holderLayout(holder), [holder])
  const paintingSize = useMemo(() => paintingTrayLayout(paintingTray), [paintingTray])
  const maxBaseMagnetThickness = Math.max(0.5, config.height - config.floorThickness) - config.magnets.depthClearance
  const maxSharedMagnetThickness = Math.max(0.5, Math.min(maxBaseMagnetThickness, Math.floor(maxHolderMagnetThickness(holder) * 10) / 10))
  const maxBaseDepthClearance = config.height - config.floorThickness - config.magnets.thickness
  const maxHolderDepthClearance = maxHolderMagnetThickness(holder) + holder.magnets.depthClearance - holder.magnets.thickness
  const maxSharedDepthClearance = Math.max(0, Math.min(0.5, maxBaseDepthClearance, maxHolderDepthClearance))
  const plan = useMemo(() => holderPlan(holder), [holder])
  const stemDiameter = stemMaximumDiameter(stem)
  const partWidth =
    model === 'base'
      ? width
      : model === 'holder'
        ? holderSize.width
        : model === 'painting'
          ? paintingSize.width
          : model === 'stem'
            ? stemDiameter
            : token.diameter
  const partLength =
    model === 'base'
      ? length
      : model === 'holder'
        ? holderSize.length
        : model === 'painting'
          ? paintingSize.length
          : model === 'stem'
            ? stemDiameter
            : token.diameter
  const partHeight =
    model === 'base'
      ? config.height
      : model === 'holder'
        ? holder.height
        : model === 'painting'
          ? paintingTrayAssemblyHeight(paintingTray)
          : model === 'stem'
            ? stemOverallHeight(stem)
            : tokenHeight(token)
  const partName =
    model === 'base'
      ? baseName(config)
      : model === 'holder'
        ? holderName(holder)
        : model === 'painting'
          ? paintingTrayName(paintingTray)
          : model === 'stem'
            ? stemName(stem)
            : tokenName(token)
  const batch = useMemo(
    () => workspace.batch.map((entry) => ({ config: batchBaseConfig(workspace, entry), quantity: entry.quantity })),
    [workspace],
  )
  const {
    exporting,
    error: exportError,
    exportStl,
    export3mf,
    exportBatchStl,
    exportBatch3mf,
  } = useExport({
    model,
    base: config,
    holder,
    paintingTray,
    stem,
    token,
    width: partWidth,
    length: partLength,
    batch,
    batchName: batchName(workspace.batch),
  })
  const elongated = isElongated(config.shape)
  const magnetCountKey = footprintKey(config.shape, config.width, config.length)
  const magnetCountOverride = workspace.shared.magnetCounts[magnetCountKey]
  const magnetCountValue: MagnetCountChoice = magnetCountOverride ?? AUTOMATIC_MAGNET_COUNT

  const setSharedMagnets = (changes: SharedMagnetChanges) => {
    setWorkspace((current) => ({
      ...current,
      shared: { ...current.shared, magnets: { ...current.shared.magnets, ...changes } },
    }))
  }

  const setMagnetCount = (count: MagnetCountChoice) =>
    setWorkspace((current) => {
      const magnetCounts = { ...current.shared.magnetCounts }
      if (count === AUTOMATIC_MAGNET_COUNT) delete magnetCounts[magnetCountKey]
      else magnetCounts[magnetCountKey] = count
      return { ...current, shared: { ...current.shared, magnetCounts } }
    })

  const setSharedLabels = (labelsEnabled: boolean) =>
    setWorkspace((current) => ({
      ...current,
      shared: { ...current.shared, labelsEnabled },
      holder: labelsEnabled
        ? fitSlotDepth({ ...current.holder, engraving: { ...current.holder.engraving, enabled: true } })
        : current.holder,
    }))

  const setSharedMagnetPlacement = (changes: SharedMagnetPlacementChanges) => {
    setWorkspace((current) => {
      const shared = {
        ...current.shared,
        ...('wallThickness' in changes ? { wallThickness: changes.wallThickness } : {}),
        ...('bossWall' in changes ? { magnetBossWall: changes.bossWall } : {}),
      }
      const base = {
        ...current.base,
        wallThickness: shared.wallThickness,
        magnets: { ...current.base.magnets, bossWall: shared.magnetBossWall },
      }
      return {
        ...current,
        shared,
        base: { ...base, profileSize: Math.min(base.profileSize, safeEdgeSize(base)) },
      }
    })
  }

  const resetPart = (part: GeneratorSettings, label: string, shared: boolean): ResetAction => ({
    label,
    description: `Every ${label} setting returns to its default${part === 'base' ? ' and the batch list empties' : ''}. ${shared ? 'Shared settings and the' : 'The'} other generators keep their values.`,
    onReset: () => {
      posthog.capture('settings_reset', { scope: part })
      if (part === 'base') setCustomBaseSize(false)
      if (part === 'token') setTokenImageError(undefined)
      setWorkspace((current) => resetGenerator(current, part))
    },
  })
  const resetSharedSettings: ResetAction = {
    label: 'shared settings',
    description:
      'Magnet size and fit, pocket layout, magnet counts, wall thickness, magnet boss wall and the labels toggle return to their defaults on bases, holders and spray trays.',
    onReset: () => {
      posthog.capture('settings_reset', { scope: 'shared' })
      setWorkspace(resetShared)
    },
  }

  const panel =
    model === 'base' ? (
      <BasePanel
        config={config}
        setConfig={setConfig}
        patch={patch}
        customBaseSize={customBaseSize}
        setCustomBaseSize={setCustomBaseSize}
        magnetCountValue={magnetCountValue}
        setMagnetCount={setMagnetCount}
        maxSharedMagnetThickness={maxSharedMagnetThickness}
        maxSharedDepthClearance={maxSharedDepthClearance}
        setSharedMagnets={setSharedMagnets}
        setSharedLabels={setSharedLabels}
        setSharedMagnetPlacement={setSharedMagnetPlacement}
        batch={workspace.batch}
        setBatch={(next) => setWorkspace((current) => ({ ...current, batch: next(current.batch) }))}
        exporting={exporting}
        exportBatchStl={exportBatchStl}
        exportBatch3mf={exportBatch3mf}
        resets={[resetPart('base', 'base', true), resetSharedSettings]}
      />
    ) : model === 'holder' ? (
      <HolderPanel
        holder={holder}
        setHolder={setHolder}
        holderSize={holderSize}
        plan={plan}
        maxSharedMagnetThickness={maxSharedMagnetThickness}
        setSharedMagnets={setSharedMagnets}
        setSharedLabels={setSharedLabels}
        resets={[resetPart('holder', 'holder', true), resetSharedSettings]}
      />
    ) : model === 'painting' ? (
      <PaintingTrayPanel
        paintingTray={paintingTray}
        setPaintingTray={setPaintingTray}
        paintingSize={paintingSize}
        maxSharedMagnetThickness={maxSharedMagnetThickness}
        maxSharedDepthClearance={maxSharedDepthClearance}
        setSharedMagnets={setSharedMagnets}
        resets={[resetPart('paintingTray', 'spray tray', true), resetSharedSettings]}
      />
    ) : model === 'stem' ? (
      <StemPanel stem={stem} setStem={setStem} resets={[resetPart('stem', 'stem', false)]} />
    ) : (
      <TokenPanel
        token={token}
        patchToken={patchToken}
        addTokenImage={addTokenImage}
        tokenImageError={tokenImageError}
        resets={[resetPart('token', 'token', false)]}
      />
    )

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          {/* Same panel, same order; on a narrow screen it slides in from the left
              instead of standing beside the sheet. */}
          {!docked && (
            <Sheet>
              <SheetTrigger render={<Button size="icon-sm" variant="outline" aria-label={`${modelLabel(model)} settings`} />}>
                <PanelLeft />
              </SheetTrigger>
              <SheetContent side="left" className="max-w-[85vw] gap-0 p-0 data-[side=left]:w-81">
                {/* A header row of its own, so the close button has somewhere to sit
                    that is not on top of the first section heading. */}
                <SheetHeader className="shrink-0 border-b border-border px-5 py-3.5">
                  <SheetTitle className="note">{modelLabel(model)} settings</SheetTitle>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
              </SheetContent>
            </Sheet>
          )}
          <h1 className="shrink-0 py-3 text-sm font-medium tracking-[0.18em] uppercase max-sm:hidden">
            Base<span className="text-measure">Kit</span>
          </h1>
          {/* Scrolls sideways on a phone rather than running under the export buttons. */}
          <nav ref={generators} aria-label="Generators" className="flex min-w-0 self-stretch overflow-x-auto [scrollbar-width:none]">
            {MODELS.map((item) => (
              <a
                key={item.value}
                href={item.href}
                aria-label={item.label}
                aria-current={model === item.value ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  changeModel(item.value)
                }}
                className="note relative flex shrink-0 items-center px-1.5 text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-measure after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:scale-x-0 after:bg-measure after:transition-transform aria-[current=page]:after:scale-x-100 sm:px-3 sm:after:inset-x-3"
              >
                <span aria-hidden="true" className="sm:hidden">
                  {item.mobileLabel}
                </span>
                <span aria-hidden="true" className="max-sm:hidden">
                  {item.label}
                </span>
              </a>
            ))}
          </nav>
        </div>
        <ButtonGroup>
          {/* The labels fold away on a phone; the icons and the names still read out. */}
          <Button size="sm" onClick={exportStl} disabled={!preview || exporting !== undefined}>
            <Download />
            <span className="max-sm:sr-only">
              {exporting === 'stl' ? 'Building STL' : model === 'holder' && plan.modules.length > 1 ? 'Download STLs' : 'Download STL'}
            </span>
          </Button>
          <Button size="sm" variant="outline" onClick={export3mf} disabled={!preview || exporting !== undefined}>
            <Box />
            <span className="max-sm:sr-only">{exporting === '3mf' ? 'Building 3MF' : 'Download 3MF'}</span>
          </Button>
        </ButtonGroup>
      </header>

      <div className="flex min-h-0 flex-1">
        {docked && panel}

        <main className="relative min-w-0 flex-1">
          <Viewer
            viewKey={model}
            mesh={preview}
            width={partWidth}
            length={partLength}
            height={partHeight}
            minZ={model === 'painting' ? paintingTrayAssemblyMinZ(paintingTray) : 0}
            orbitTarget={model === 'painting' ? paintingHandleAxisCenter(paintingTray) : undefined}
            round={model === 'stem' || model === 'token' || (model === 'base' && !elongated)}
            fitToPart={model !== 'base'}
          />
          {(error || exportError) && (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 border-b border-destructive/50 bg-destructive/10 px-5 py-2 text-xs text-destructive"
            >
              {error ? `${error}. Showing the last model that built.` : `Export failed: ${exportError}`}
            </div>
          )}
          <TitleBlock config={partConfig} status={error ? 'blocked' : 'ready'} name={partName} grams={grams} />
        </main>
      </div>
    </div>
  )
}
