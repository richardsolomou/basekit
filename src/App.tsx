import { Box, Code2, Download, ImagePlus, PanelLeft, X } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Choice, Dimension, Section, SizeSelect, ToggleSetting } from '@/components/controls'
import { MiniatureGroupsEditor } from '@/components/MiniatureGroupsEditor'
import { Button, buttonVariants } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import { supportsFivePocketCross } from '@/geometry/base'
import {
  defaultHolderConfig,
  holderGroupLabel,
  holderLayout,
  holderName,
  holderPlan,
  maxHolderMagnetThickness,
  maxHolderSlotDepth,
  minHolderHeight,
} from '@/geometry/holder'
import { baseName, defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import {
  defaultBaseHeight,
  defaultFloorThickness,
  DEFAULT_PRESET,
  DEFAULT_SIZE,
  footprintKey,
  MAGNET_CHOICES,
  presetFor,
  resized,
  RIB_CHOICES,
  SIZES_BY_SHAPE,
  type SizePreset,
} from '@/geometry/presets'
import { defaultTokenConfig, maxTokenEdgeSize, MIN_TOKEN_TEXT_HEIGHT, tokenHeight, tokenName } from '@/geometry/token'
import { maxProfileSize } from '@/geometry/profile'
import {
  defaultPaintingTrayConfig,
  minimumPaintingTrayEdgeMargin,
  minimumPaintingTrayHeight,
  minimumPaintingTraySpacing,
  paintingHandleAxisCenter,
  paintingHandleDescription,
  paintingTrayAssemblyHeight,
  paintingTrayAssemblyMinZ,
  paintingTrayLayout,
  paintingTrayMagnetPocketCount,
  paintingTrayName,
} from '@/geometry/paintingTray'
import {
  CLASSIC_STEM_HEIGHTS,
  defaultFlightStemConfig,
  stemMaximumDiameter,
  stemName,
  stemNeckDiameter,
  stemOverallHeight,
} from '@/geometry/stem'
import type {
  BaseConfig,
  EdgeProfile,
  FlightStemConfig,
  TokenConfig,
  HolderConfig,
  HolderGroup,
  MagnetLayout,
  PaintingHandleShape,
  PaintingTrayConfig,
  ShapeKind,
} from '@/geometry/types'
import { loadTokenImage } from '@/lib/tokenImage'
import { useExport } from '@/lib/useExport'
import { useGenerator } from '@/lib/useGenerator'
import { useMediaQuery } from '@/lib/useMediaQuery'
import posthog from '@/lib/posthog'
import { loadWorkspace, saveWorkspace, synchronizeWorkspace, type WorkspaceState } from '@/lib/workspace'

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'polygon', label: 'Hex' },
]

const CUSTOM_HOLDER_SIZE = 'custom'

const PROFILES: { value: EdgeProfile; label: string }[] = [
  { value: 'taper', label: 'Taper' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'round', label: 'Round' },
  { value: 'straight', label: 'Straight' },
]

const MAGNET_LAYOUTS: { value: MagnetLayout; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'five-cross', label: 'Five-pocket cross' },
]
const counts = (values: number[]) => values.map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
const AUTOMATIC_MAGNET_COUNT = 'auto'
type MagnetCountChoice = number | typeof AUTOMATIC_MAGNET_COUNT
const RIB_COUNTS = counts(RIB_CHOICES)
const MODELS = [
  { value: 'base' as const, label: 'Bases', mobileLabel: 'Bases', href: '/' },
  { value: 'holder' as const, label: 'Holders', mobileLabel: 'Holders', href: '/holders' },
  { value: 'painting' as const, label: 'Spray tray', mobileLabel: 'Spray', href: '/spray-tray' },
  { value: 'stem' as const, label: 'Stems', mobileLabel: 'Stems', href: '/stems' },
  { value: 'token' as const, label: 'Tokens', mobileLabel: 'Tokens', href: '/tokens' },
]
const ENGRAVING_PLACEMENTS = [
  { value: 'slots' as const, label: 'In slots' },
  { value: 'module' as const, label: 'On module' },
]
const BASE_DEFAULTS = presetFor(DEFAULT_PRESET)
const HOLDER_DEFAULTS = defaultHolderConfig()
const PAINTING_DEFAULTS = defaultPaintingTrayConfig()
const PAINTING_HANDLE_SHAPES: { value: PaintingHandleShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval barrel' },
  { value: 'flared', label: 'Flared base' },
  { value: 'pistol', label: 'Pistol grip' },
]
const STEM_DEFAULTS = defaultFlightStemConfig()
const STEM_HEIGHTS = CLASSIC_STEM_HEIGHTS.map((value) => ({ value, label: `${value} mm` }))
const STEM_CONNECTIONS = [
  { value: 'peg' as const, label: 'Peg' },
  { value: 'ball' as const, label: 'Ball joint' },
]
const TOKEN_DEFAULTS = defaultTokenConfig()
type Generator = (typeof MODELS)[number]['value']

const modelForPath = (): Generator => MODELS.find((item) => item.href === window.location.pathname)?.value ?? 'base'
const modelLabel = (model: Generator) =>
  model === 'base' ? 'Base' : model === 'holder' ? 'Holder' : model === 'painting' ? 'Spray tray' : model === 'stem' ? 'Stem' : 'Token'

function fittedCounts(modules: { config: { groups: HolderGroup[] } }[]) {
  const fitted = new Map<string, number>()
  for (const module of modules) {
    for (const group of module.config.groups) fitted.set(group.id, (fitted.get(group.id) ?? 0) + group.quantity)
  }
  return fitted
}

function RepositoryLink() {
  return (
    <div className="flex justify-center px-5 pt-4">
      <a
        href="https://github.com/richardsolomou/basekit"
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: 'link', size: 'sm', className: 'text-muted-foreground' })}
      >
        <Code2 className="size-3.5" />
        GitHub
      </a>
    </div>
  )
}

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
  const tokenImageInput = useRef<HTMLInputElement>(null)
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
  const { preview, error } = useGenerator(partConfig)

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

  const safeEdgeSize = (next: BaseConfig) => Math.floor((maxProfileSize(next) + 1e-6) * 10) / 10
  const patch = (changes: Partial<BaseConfig>) =>
    setConfig((current) => {
      const next = { ...current, ...changes }
      return { ...next, profileSize: Math.min(next.profileSize, safeEdgeSize(next)) }
    })
  const { width, length } = footprint(config)
  const holderSize = useMemo(() => holderLayout(holder), [holder])
  const paintingSize = useMemo(() => paintingTrayLayout(paintingTray), [paintingTray])
  const maxSlotDepth = Math.max(1, Math.floor(maxHolderSlotDepth(holder) / 0.5) * 0.5)
  const maxBaseMagnetThickness = Math.max(0.5, config.height - config.floorThickness) - config.magnets.depthClearance
  const maxSharedMagnetThickness = Math.max(0.5, Math.min(maxBaseMagnetThickness, Math.floor(maxHolderMagnetThickness(holder) * 10) / 10))
  const maxBaseDepthClearance = config.height - config.floorThickness - config.magnets.thickness
  const maxHolderDepthClearance = maxHolderMagnetThickness(holder) + holder.magnets.depthClearance - holder.magnets.thickness
  const maxSharedDepthClearance = Math.max(0, Math.min(0.5, maxBaseDepthClearance, maxHolderDepthClearance))
  const fitSlotDepth = (next: HolderConfig) => ({
    ...next,
    ...(maxHolderSlotDepth(next) < 1
      ? { height: minHolderHeight({ ...next, slotDepth: 1 }), slotDepth: 1 }
      : { slotDepth: Math.min(next.slotDepth, Math.floor(maxHolderSlotDepth(next) / 0.5) * 0.5) }),
  })
  const plan = useMemo(() => holderPlan(holder), [holder])
  const requestedModels = useMemo(() => holder.groups.reduce((total, group) => total + group.quantity, 0), [holder.groups])
  const fittedByGroup = useMemo(() => fittedCounts(plan.modules), [plan])
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
  const {
    exporting,
    error: exportError,
    exportStl,
    export3mf,
  } = useExport({
    model,
    base: config,
    holder,
    paintingTray,
    stem,
    token,
    width: partWidth,
    length: partLength,
  })
  const elongated = isElongated(config.shape)
  const sizes = SIZES_BY_SHAPE[config.shape]
  const standard = sizes.find((size) => size.width === width && (size.length ?? size.width) === length)
  const footprintDefaultHeight = defaultBaseHeight(config.width, config.length)
  const footprintDefaultFloor = defaultFloorThickness(config.width, config.length)
  const magnetCountKey = footprintKey(config.shape, config.width, config.length)
  const magnetCountOverride = workspace.shared.magnetCounts[magnetCountKey]
  const magnetCountValue: MagnetCountChoice = magnetCountOverride ?? AUTOMATIC_MAGNET_COUNT
  const magnetCountOptions: { value: MagnetCountChoice; label: string }[] = [
    { value: AUTOMATIC_MAGNET_COUNT, label: `Auto · ${config.magnets.count}` },
    ...counts(MAGNET_CHOICES),
  ]
  const magnetLayoutOptions =
    config.magnets.patternVersion === 1 || supportsFivePocketCross(config.shape, config.width) ? MAGNET_LAYOUTS : MAGNET_LAYOUTS.slice(0, 1)
  const holderSupportsFiveCross =
    holder.magnets.patternVersion === 1 || holder.groups.some((group) => supportsFivePocketCross(group.shape, group.width))
  const holderMagnetLayout = holderSupportsFiveCross ? holder.magnets.layout : 'balanced'
  const holderMagnetLayoutOptions = holderSupportsFiveCross ? MAGNET_LAYOUTS : MAGNET_LAYOUTS.slice(0, 1)

  const loadPreset = (size: SizePreset) => {
    posthog.capture('base_size_selected', { size: size.label, shape: config.shape })
    setCustomBaseSize(false)
    setConfig(presetFor(size, config.magnets.maxCount, config.magnets.patternVersion))
  }

  const setSharedMagnets = (
    changes: Partial<Pick<BaseConfig['magnets'], 'layout' | 'diameter' | 'thickness' | 'clearance' | 'depthClearance'>>,
  ) => {
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

  const setSharedMagnetPlacement = (changes: Partial<Pick<BaseConfig, 'wallThickness'> & { bossWall: number }>) => {
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

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    posthog.capture('base_shape_selected', { shape })
    const target = DEFAULT_SIZE[shape]
    setCustomBaseSize(false)
    const next = resized({ ...config, shape }, target.width, target.length ?? target.width)
    setConfig(next)
  }

  const basePanel = (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      {/* Sections number themselves off this counter, in the order they appear. */}
      <aside aria-label="Base settings" className="pb-4 [counter-reset:schedule]">
        <Section title="Size & Shape">
          <Choice label="Shape" value={config.shape} defaultValue={BASE_DEFAULTS.shape} options={SHAPES} onChange={changeShape} />
          <SizeSelect
            value={!customBaseSize && standard ? standard.label : CUSTOM_HOLDER_SIZE}
            options={[
              ...sizes.map((size) => ({ value: size.label, use: size.use })),
              { value: CUSTOM_HOLDER_SIZE, label: 'Custom', use: 'exact dimensions' },
            ]}
            onChange={(label) => {
              if (label === CUSTOM_HOLDER_SIZE) {
                setCustomBaseSize(true)
                return
              }
              const size = sizes.find((s) => s.label === label)
              if (size) loadPreset(size)
            }}
          />
          {customBaseSize && (
            <Dimension
              label={elongated ? 'Width' : config.shape === 'round' ? 'Diameter' : 'Overall width'}
              value={config.width}
              min={15}
              max={180}
              step={0.5}
              defaultValue={BASE_DEFAULTS.width}
              onChange={(w) => {
                const next = resized(config, w, config.length)
                setConfig(next)
              }}
            />
          )}
          {customBaseSize && elongated && (
            <Dimension
              label="Depth"
              value={config.length}
              min={15}
              max={180}
              step={0.5}
              defaultValue={BASE_DEFAULTS.length}
              onChange={(l) => {
                const next = resized(config, config.width, l)
                setConfig(next)
              }}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.magnets.count === 0 ? 'none' : `${trimNumber(config.magnets.diameter + config.magnets.clearance)} mm hole`}
            </span>
          }
        >
          {config.magnets.count > 0 && (
            <>
              <Dimension
                label="Magnet diameter"
                value={config.magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={config.magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
            </>
          )}
          <Choice
            label="Pocket layout"
            value={config.magnets.layout}
            defaultValue={BASE_DEFAULTS.magnets.layout}
            options={magnetLayoutOptions}
            onChange={(layout) => setSharedMagnets({ layout })}
          />
          {config.magnets.layout !== 'five-cross' && (
            <Choice
              label="Magnets per base"
              value={magnetCountValue}
              defaultValue={AUTOMATIC_MAGNET_COUNT}
              options={magnetCountOptions}
              onChange={setMagnetCount}
            />
          )}
          <FieldDescription>
            {config.magnets.layout === 'five-cross'
              ? 'The cross always provides one centre and four outer pockets.'
              : 'Automatic balances the footprint using the selected magnet dimensions.'}
          </FieldDescription>
        </Section>

        <Section title="Size Label">
          <ToggleSetting
            label="Size labels"
            checked={config.label.enabled}
            defaultChecked={BASE_DEFAULTS.label.enabled}
            onChange={(enabled) => {
              posthog.capture('base_marking_toggled', { enabled })
              setSharedLabels(enabled)
            }}
          />
          {config.label.enabled && (
            <Field>
              <FieldLabel htmlFor="marking-text" className="sr-only">
                Label text
              </FieldLabel>
              <Input
                id="marking-text"
                value={config.label.text ?? ''}
                placeholder={defaultLabel(config)}
                onChange={(e) => patch({ label: { ...config.label, text: e.currentTarget.value } })}
                className="readout"
              />
            </Field>
          )}
        </Section>

        <Section title="Construction" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(config.height)}mm</span>}>
          <Dimension
            label="Base height"
            value={config.height}
            min={2}
            max={12}
            step={0.25}
            defaultValue={footprintDefaultHeight}
            onChange={(height) => patch({ height })}
          />
          <Dimension
            label="Wall thickness"
            value={config.wallThickness}
            min={1}
            max={6}
            step={0.1}
            defaultValue={BASE_DEFAULTS.wallThickness}
            onChange={(wallThickness) => setSharedMagnetPlacement({ wallThickness })}
          />
          <Dimension
            label="Top thickness"
            value={config.floorThickness}
            min={0.4}
            max={Math.max(0.5, config.height - 0.5)}
            step={0.1}
            defaultValue={footprintDefaultFloor}
            onChange={(floorThickness) => patch({ floorThickness })}
          />
          <Choice
            label="Bottom edge"
            value={config.profile}
            defaultValue={BASE_DEFAULTS.profile}
            options={PROFILES}
            onChange={(profile) => patch({ profile })}
          />
          {config.profile !== 'straight' && (
            <Dimension
              label="Edge size"
              value={config.profileSize}
              min={0}
              max={safeEdgeSize(config)}
              step={0.1}
              defaultValue={BASE_DEFAULTS.profileSize}
              onChange={(profileSize) => patch({ profileSize })}
            />
          )}
          {config.shape === 'rect' && (
            <Dimension
              label="Corner radius"
              value={config.cornerRadius}
              min={0}
              max={12}
              step={0.5}
              defaultValue={BASE_DEFAULTS.cornerRadius}
              onChange={(cornerRadius) => patch({ cornerRadius })}
            />
          )}
          {config.shape === 'polygon' && (
            <Dimension
              label="Sides"
              value={config.sides}
              min={3}
              max={12}
              step={1}
              unit=""
              defaultValue={BASE_DEFAULTS.sides}
              onChange={(sides) => patch({ sides })}
            />
          )}
        </Section>

        <Section
          title="Internal Supports"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.ribs.count === 0 ? 'none' : `${config.ribs.count} spokes`}
            </span>
          }
        >
          {config.magnets.layout !== 'five-cross' && (
            <Choice
              label="Number of supports"
              value={config.ribs.count}
              defaultValue={BASE_DEFAULTS.ribs.count}
              options={RIB_COUNTS}
              onChange={(count) => patch({ ribs: { ...config.ribs, count } })}
            />
          )}
          {config.ribs.count > 0 && (
            <>
              <Dimension
                label="Support thickness"
                value={config.ribs.thickness}
                min={0.8}
                max={4}
                step={0.1}
                defaultValue={BASE_DEFAULTS.ribs.thickness}
                onChange={(thickness) => patch({ ribs: { ...config.ribs, thickness } })}
              />
              <Dimension
                label="Support height"
                value={config.ribs.height}
                min={0.4}
                max={Math.max(0.5, config.height - config.floorThickness)}
                step={0.1}
                defaultValue={BASE_DEFAULTS.ribs.height}
                onChange={(height) => patch({ ribs: { ...config.ribs, height } })}
              />
            </>
          )}
        </Section>

        {(config.magnets.count > 0 || config.label.enabled) && (
          <Section
            title="Fit & Detail"
            aside={
              config.magnets.count > 0 ? (
                <span className="readout text-xs text-muted-foreground">Ø{trimNumber(config.magnets.clearance)} fit</span>
              ) : undefined
            }
          >
            {config.magnets.count > 0 && (
              <>
                <Dimension
                  label="Magnet diameter clearance"
                  value={config.magnets.clearance}
                  min={0}
                  max={0.6}
                  step={0.05}
                  defaultValue={BASE_DEFAULTS.magnets.clearance}
                  onChange={(clearance) => setSharedMagnets({ clearance })}
                />
                <Dimension
                  label="Magnet depth clearance"
                  value={config.magnets.depthClearance}
                  min={0}
                  max={maxSharedDepthClearance}
                  step={0.05}
                  defaultValue={BASE_DEFAULTS.magnets.depthClearance}
                  onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
                />
                <Dimension
                  label="Wall around pocket"
                  value={config.magnets.bossWall}
                  min={0.4}
                  max={3}
                  step={0.1}
                  defaultValue={BASE_DEFAULTS.magnets.bossWall}
                  onChange={(bossWall) => setSharedMagnetPlacement({ bossWall })}
                />
              </>
            )}
            {config.label.enabled && (
              <Dimension
                label="Label size"
                value={config.label.height}
                min={2}
                max={16}
                step={0.5}
                defaultValue={BASE_DEFAULTS.label.height}
                onChange={(height) => patch({ label: { ...config.label, height } })}
              />
            )}
            {config.label.enabled && (
              <Dimension
                label="Label thickness"
                value={config.label.emboss}
                min={0.2}
                max={1.5}
                step={0.1}
                defaultValue={BASE_DEFAULTS.label.emboss}
                onChange={(emboss) => patch({ label: { ...config.label, emboss } })}
              />
            )}
          </Section>
        )}
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )

  const holderPanel = (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Holder settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Miniatures"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holderSize.slotCenters.length}/{requestedModels} fitted
            </span>
          }
        >
          <MiniatureGroupsEditor
            groups={holder.groups}
            fittedByGroup={fittedByGroup}
            onChange={(groups) => setHolder({ ...holder, groups })}
          />
        </Section>

        <Section
          title="Layout"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holderSize.unitsWide} × {holderSize.unitsDeep} used
            </span>
          }
        >
          <Dimension
            label="Maximum columns"
            value={holder.maxColumns}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={HOLDER_DEFAULTS.maxColumns}
            onChange={(maxColumns) => setHolder({ ...holder, maxColumns: Math.round(maxColumns) })}
          />
          <Dimension
            label="Maximum rows"
            value={holder.maxRows}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={HOLDER_DEFAULTS.maxRows}
            onChange={(maxRows) => setHolder({ ...holder, maxRows: Math.round(maxRows) })}
          />
          <Dimension
            label="Between miniatures"
            value={holder.spacing}
            min={0}
            max={10}
            step={0.5}
            defaultValue={HOLDER_DEFAULTS.spacing}
            onChange={(spacing) =>
              setHolder({
                ...holder,
                spacing,
                edgeSpacing: holder.edgeSpacing === holder.spacing / 2 ? spacing / 2 : holder.edgeSpacing,
              })
            }
          />
          <Dimension
            label="From holder edge"
            value={holder.edgeSpacing}
            min={0}
            max={10}
            step={0.05}
            defaultValue={holder.spacing / 2}
            onChange={(edgeSpacing) => setHolder({ ...holder, edgeSpacing })}
          />
          <ToggleSetting
            label="Split into modules"
            checked={holder.splitGroups}
            defaultChecked={HOLDER_DEFAULTS.splitGroups}
            onChange={(splitGroups) => setHolder({ ...holder, splitGroups })}
          />
          <div className="space-y-1 border-y border-border py-3 text-xs">
            {plan.modules.map((module, index) => (
              <div
                key={`${module.config.groups[0].id}-${module.column}-${module.row}`}
                className="flex flex-wrap justify-between gap-x-3 gap-y-1"
              >
                <span className="text-muted-foreground">Module {index + 1}</span>
                <span className="readout text-right">
                  {module.config.groups.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' + ')} ·{' '}
                  {module.layout.unitsWide}×{module.layout.unitsDeep}
                </span>
              </div>
            ))}
          </div>
          <Dimension
            label="Holder height"
            value={holder.height}
            min={minHolderHeight(holder)}
            max={42}
            step={7}
            defaultValue={HOLDER_DEFAULTS.height}
            onChange={(height) => setHolder({ ...holder, height })}
          />
        </Section>

        <Section title="Slots" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(holder.slotDepth)}mm deep</span>}>
          <Dimension
            label="Slot depth"
            value={holder.slotDepth}
            min={1}
            max={maxSlotDepth}
            step={0.5}
            defaultValue={HOLDER_DEFAULTS.slotDepth}
            onChange={(slotDepth) => setHolder({ ...holder, slotDepth })}
          />
          <Dimension
            label="Slot clearance"
            value={holder.slotClearance}
            min={0.1}
            max={2}
            step={0.1}
            defaultValue={HOLDER_DEFAULTS.slotClearance}
            onChange={(slotClearance) => setHolder({ ...holder, slotClearance })}
          />
          <ToggleSetting
            label="Size labels"
            checked={holder.engraving.enabled}
            defaultChecked={HOLDER_DEFAULTS.engraving.enabled}
            onChange={setSharedLabels}
          />
          {holder.engraving.enabled && (
            <Choice
              label="Label location"
              value={holder.engraving.placement}
              defaultValue={HOLDER_DEFAULTS.engraving.placement}
              options={ENGRAVING_PLACEMENTS}
              onChange={(placement) => setHolder(fitSlotDepth({ ...holder, engraving: { ...holder.engraving, placement } }))}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holder.magnets.enabled ? `${trimNumber(holder.magnets.diameter + holder.magnets.clearance)} mm hole` : 'none'}
            </span>
          }
        >
          <ToggleSetting
            label="Slot magnets"
            checked={holder.magnets.enabled}
            defaultChecked={HOLDER_DEFAULTS.magnets.enabled}
            onChange={(enabled) => setHolder(fitSlotDepth({ ...holder, magnets: { ...holder.magnets, enabled } }))}
          />
          {holder.magnets.enabled && (
            <>
              <Choice
                label="Pocket layout"
                value={holderMagnetLayout}
                defaultValue={HOLDER_DEFAULTS.magnets.layout}
                options={holderMagnetLayoutOptions}
                onChange={(layout) => setSharedMagnets({ layout })}
              />
              <Dimension
                label="Magnet diameter"
                value={holder.magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={holder.magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
              <Dimension
                label="Magnet diameter clearance"
                value={holder.magnets.clearance}
                min={0}
                max={0.6}
                step={0.05}
                defaultValue={BASE_DEFAULTS.magnets.clearance}
                onChange={(clearance) => setSharedMagnets({ clearance })}
              />
              <Dimension
                label="Magnet depth clearance"
                value={holder.magnets.depthClearance}
                min={0}
                max={0.5}
                step={0.05}
                defaultValue={HOLDER_DEFAULTS.magnets.depthClearance}
                onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
              />
              <FieldDescription>Automatic base recommendations also apply to matching holder slots.</FieldDescription>
            </>
          )}
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )

  const paintingPanel = (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Spray tray settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Magnet grid"
          aside={<span className="readout text-xs text-muted-foreground">{paintingTrayMagnetPocketCount(paintingTray)} holes</span>}
        >
          <Dimension
            label="Columns"
            value={paintingTray.columns}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={PAINTING_DEFAULTS.columns}
            onChange={(columns) => setPaintingTray({ ...paintingTray, columns: Math.round(columns) })}
          />
          <Dimension
            label="Rows"
            value={paintingTray.rows}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={PAINTING_DEFAULTS.rows}
            onChange={(rows) => setPaintingTray({ ...paintingTray, rows: Math.round(rows) })}
          />
          <Dimension
            label="Centre spacing"
            value={paintingTray.spacing}
            min={minimumPaintingTraySpacing(paintingTray)}
            max={80}
            step={0.5}
            defaultValue={PAINTING_DEFAULTS.spacing}
            onChange={(spacing) => setPaintingTray({ ...paintingTray, spacing })}
          />
          <Dimension
            label="Edge margin"
            value={paintingTray.edgeMargin}
            min={minimumPaintingTrayEdgeMargin(paintingTray)}
            max={40}
            step={0.5}
            defaultValue={PAINTING_DEFAULTS.edgeMargin}
            onChange={(edgeMargin) => setPaintingTray({ ...paintingTray, edgeMargin })}
          />
          <FieldDescription>Offset holes between rows give smaller and mixed-size bases more placement options.</FieldDescription>
        </Section>

        <Section
          title="Construction"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(paintingSize.width)} × {trimNumber(paintingSize.length)}mm
            </span>
          }
        >
          <Dimension
            label="Tray thickness"
            value={paintingTray.height}
            min={minimumPaintingTrayHeight(paintingTray)}
            max={8}
            step={0.1}
            defaultValue={PAINTING_DEFAULTS.height}
            onChange={(height) => setPaintingTray({ ...paintingTray, height })}
          />
          <FieldDescription>The flat tray has no rim or recess to block spray from the sides.</FieldDescription>
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(paintingTray.magnets.diameter + paintingTray.magnets.clearance)} mm hole
            </span>
          }
        >
          <Dimension
            label="Magnet diameter"
            value={paintingTray.magnets.diameter}
            min={2}
            max={8}
            step={0.5}
            defaultValue={BASE_DEFAULTS.magnets.diameter}
            onChange={(diameter) => setSharedMagnets({ diameter })}
          />
          <Dimension
            label="Magnet thickness"
            value={paintingTray.magnets.thickness}
            min={0.5}
            max={maxSharedMagnetThickness}
            step={0.1}
            defaultValue={BASE_DEFAULTS.magnets.thickness}
            onChange={(thickness) => setSharedMagnets({ thickness })}
          />
          <Dimension
            label="Magnet diameter clearance"
            value={paintingTray.magnets.clearance}
            min={0}
            max={0.6}
            step={0.05}
            defaultValue={BASE_DEFAULTS.magnets.clearance}
            onChange={(clearance) => setSharedMagnets({ clearance })}
          />
          <Dimension
            label="Magnet depth clearance"
            value={paintingTray.magnets.depthClearance}
            min={0}
            max={maxSharedDepthClearance}
            step={0.05}
            defaultValue={PAINTING_DEFAULTS.magnets.depthClearance}
            onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
          />
          <FieldDescription>Pockets open at the top so installed magnets sit flush in an interleaved grid.</FieldDescription>
        </Section>
        <Section title="Handle" aside={<span className="readout text-xs text-muted-foreground">{paintingTray.handle.length} mm</span>}>
          <Choice
            label="Grip shape"
            value={paintingTray.handle.shape}
            defaultValue={PAINTING_DEFAULTS.handle.shape}
            options={PAINTING_HANDLE_SHAPES}
            onChange={(shape) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, shape } })}
          />
          <Dimension
            label="Grip length"
            value={paintingTray.handle.length}
            min={60}
            max={120}
            step={5}
            defaultValue={PAINTING_DEFAULTS.handle.length}
            onChange={(handleLength) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, length: handleLength } })}
          />
          <Dimension
            label="Grip width"
            value={paintingTray.handle.width}
            min={20}
            max={40}
            step={1}
            defaultValue={PAINTING_DEFAULTS.handle.width}
            onChange={(handleWidth) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, width: handleWidth } })}
          />
          <Dimension
            label="Lean angle"
            value={paintingTray.handle.angle}
            min={0}
            max={30}
            step={1}
            unit="°"
            defaultValue={PAINTING_DEFAULTS.handle.angle}
            onChange={(angle) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, angle } })}
          />
          <ToggleSetting
            label="Rounded end"
            checked={paintingTray.handle.roundedEnd}
            defaultChecked={PAINTING_DEFAULTS.handle.roundedEnd}
            onChange={(roundedEnd) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, roundedEnd } })}
          />
          <ToggleSetting
            label="Grip ribs"
            checked={paintingTray.handle.ribs}
            defaultChecked={PAINTING_DEFAULTS.handle.ribs}
            onChange={(ribs) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, ribs } })}
          />
          <FieldDescription>
            {paintingHandleDescription(paintingTray)}. An engraved + extends past the grip for alignment. The flat end superglues beneath
            the tray and exports as a separate upright, support-free part.
          </FieldDescription>
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )

  const stemPanel = (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Stem settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Stem"
          aside={<span className="readout text-xs text-muted-foreground">{trimNumber(stemOverallHeight(stem))}mm overall</span>}
        >
          <Choice
            label="Stem height"
            value={stem.bodyHeight}
            defaultValue={STEM_DEFAULTS.bodyHeight}
            options={STEM_HEIGHTS}
            onChange={(bodyHeight) => {
              posthog.capture('flight_stem_height_selected', { body_height: bodyHeight })
              setStem({ ...stem, bodyHeight })
            }}
          />
          <Dimension
            label="Body diameter"
            value={stem.bodyDiameter}
            min={stemNeckDiameter(stem)}
            max={8}
            step={0.1}
            defaultValue={STEM_DEFAULTS.bodyDiameter}
            onChange={(bodyDiameter) => setStem({ ...stem, bodyDiameter })}
          />
          <FieldDescription>Print upright from the flat foot, then glue it directly to the base.</FieldDescription>
        </Section>

        <Section
          title="Miniature Connection"
          aside={
            <span className="readout text-xs text-muted-foreground">
              Ø{trimNumber(stem.connection === 'peg' ? stem.modelPegDiameter : stem.ballDiameter)}
            </span>
          }
        >
          <Choice
            label="Connection"
            value={stem.connection}
            defaultValue={STEM_DEFAULTS.connection}
            options={STEM_CONNECTIONS}
            onChange={(connection) => {
              posthog.capture('flight_stem_connection_selected', { connection })
              const next = { ...stem, connection }
              setStem({ ...next, bodyDiameter: Math.max(next.bodyDiameter, stemNeckDiameter(next)) })
            }}
          />
          {stem.connection === 'peg' ? (
            <>
              <Dimension
                label="Model peg diameter"
                value={stem.modelPegDiameter}
                min={1}
                max={Math.min(4, stem.bodyDiameter)}
                step={0.1}
                defaultValue={STEM_DEFAULTS.modelPegDiameter}
                onChange={(modelPegDiameter) => setStem({ ...stem, modelPegDiameter })}
              />
              <Dimension
                label="Model peg length"
                value={stem.modelPegLength}
                min={1}
                max={8}
                step={0.1}
                defaultValue={STEM_DEFAULTS.modelPegLength}
                onChange={(modelPegLength) => setStem({ ...stem, modelPegLength })}
              />
            </>
          ) : (
            <Dimension
              label="Ball diameter"
              value={stem.ballDiameter}
              min={2}
              max={Math.min(8, stem.bodyDiameter * 2)}
              step={0.1}
              defaultValue={STEM_DEFAULTS.ballDiameter}
              onChange={(ballDiameter) => setStem({ ...stem, ballDiameter })}
            />
          )}
        </Section>

        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
  const tokenPanel = (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Token settings" className="pb-4 [counter-reset:schedule]">
        <Section title="Text">
          <Field>
            <FieldLabel htmlFor="token-text" className="sr-only">
              Token text
            </FieldLabel>
            <Input
              id="token-text"
              value={token.text}
              maxLength={40}
              placeholder="Oath of Moment"
              onChange={(e) => patchToken({ text: e.currentTarget.value })}
              className="readout"
            />
          </Field>
          <Dimension
            label="Text height"
            value={token.textHeight}
            min={MIN_TOKEN_TEXT_HEIGHT}
            max={60}
            step={0.5}
            defaultValue={TOKEN_DEFAULTS.textHeight}
            onChange={(textHeight) => patchToken({ textHeight })}
          />
          <FieldDescription>Long text wraps and shrinks to fit inside the edge.</FieldDescription>
        </Section>

        <Section
          title="Image"
          aside={
            token.image && (
              <span className="readout min-w-0 truncate text-xs text-muted-foreground" title={token.image.name}>
                {token.image.name}
              </span>
            )
          }
        >
          <input
            ref={tokenImageInput}
            type="file"
            accept="image/*"
            aria-label="Token image"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void addTokenImage(file)
            }}
          />
          <ButtonGroup className="w-full">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => tokenImageInput.current?.click()}>
              <ImagePlus />
              {token.image ? 'Replace image' : 'Add image'}
            </Button>
            {token.image && (
              <Button variant="outline" size="sm" onClick={() => patchToken({ image: null })}>
                <X />
                Remove
              </Button>
            )}
          </ButtonGroup>
          {tokenImageError && <FieldDescription className="text-destructive">{tokenImageError}</FieldDescription>}
          {token.image ? (
            <>
              <Dimension
                label="Threshold"
                value={Math.round(token.threshold * 100)}
                min={1}
                max={99}
                step={1}
                unit="%"
                defaultValue={Math.round(TOKEN_DEFAULTS.threshold * 100)}
                onChange={(threshold) => patchToken({ threshold: threshold / 100 })}
              />
              <ToggleSetting
                label="Raise light areas"
                checked={token.invert}
                defaultChecked={TOKEN_DEFAULTS.invert}
                onChange={(invert) => patchToken({ invert })}
              />
            </>
          ) : (
            <FieldDescription>Or drop one anywhere on the page. Dark areas are raised; high-contrast icons work best.</FieldDescription>
          )}
        </Section>

        <Section title="Relief" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(token.emboss)}mm</span>}>
          <Dimension
            label="Raised by"
            value={token.emboss}
            min={0.2}
            max={3}
            step={0.1}
            defaultValue={TOKEN_DEFAULTS.emboss}
            onChange={(emboss) => patchToken({ emboss })}
          />
        </Section>

        <Section title="Disc" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(token.diameter)}mm</span>}>
          <Dimension
            label="Diameter"
            value={token.diameter}
            min={15}
            max={120}
            step={0.5}
            defaultValue={TOKEN_DEFAULTS.diameter}
            onChange={(diameter) => patchToken({ diameter })}
          />
          <Dimension
            label="Thickness"
            value={token.thickness}
            min={1}
            max={10}
            step={0.1}
            defaultValue={TOKEN_DEFAULTS.thickness}
            onChange={(thickness) => patchToken({ thickness })}
          />
          <Choice
            label="Top edge"
            value={token.profile}
            defaultValue={TOKEN_DEFAULTS.profile}
            options={PROFILES}
            onChange={(profile) => patchToken({ profile })}
          />
          {token.profile !== 'straight' && (
            <Dimension
              label="Edge size"
              value={token.profileSize}
              min={0}
              max={maxTokenEdgeSize(token)}
              step={0.1}
              defaultValue={TOKEN_DEFAULTS.profileSize}
              onChange={(profileSize) => patchToken({ profileSize })}
            />
          )}
          <FieldDescription>Print flat on the table face; the artwork stands up from the top.</FieldDescription>
        </Section>

        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
  const panel =
    model === 'base'
      ? basePanel
      : model === 'holder'
        ? holderPanel
        : model === 'painting'
          ? paintingPanel
          : model === 'stem'
            ? stemPanel
            : tokenPanel

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
          <TitleBlock config={partConfig} status={error ? 'blocked' : 'ready'} name={partName} />
        </main>
      </div>
    </div>
  )
}
