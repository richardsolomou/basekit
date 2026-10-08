import { ImagePlus, X } from 'lucide-react'
import { useRef } from 'react'
import { Choice, Dimension, Section, ToggleSetting } from '@/components/controls'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { trimNumber } from '@/geometry/outline'
import { defaultTokenConfig, maxTokenEdgeSize, MIN_TOKEN_TEXT_HEIGHT } from '@/geometry/token'
import type { TokenConfig, TokenShape } from '@/geometry/types'
import { PanelFooter, PROFILES, type ResetAction } from './shared'

const TOKEN_DEFAULTS = defaultTokenConfig()

const SHAPES: { value: TokenShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'hex', label: 'Hex' },
]

/** Every shape is sized across its flats, the way a hex grid or a ruler laid edge to edge measures it. */
const SIZE_LABELS: Record<TokenShape, string> = { round: 'Diameter', square: 'Width', hex: 'Across flats' }

interface Props {
  resets: ResetAction[]
  token: TokenConfig
  patchToken: (changes: Partial<TokenConfig>) => void
  addTokenImage: (file: File) => Promise<void>
  tokenImageError: string | undefined
}

export function TokenPanel({ token, patchToken, addTokenImage, tokenImageError, resets }: Props) {
  const tokenImageInput = useRef<HTMLInputElement>(null)

  return (
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

        <Section title="Body" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(token.size)}mm</span>}>
          <Choice
            label="Shape"
            value={token.shape}
            defaultValue={TOKEN_DEFAULTS.shape}
            options={SHAPES}
            onChange={(shape) => patchToken({ shape })}
          />
          <Dimension
            label={SIZE_LABELS[token.shape]}
            value={token.size}
            min={15}
            max={120}
            step={0.1}
            defaultValue={TOKEN_DEFAULTS.size}
            onChange={(size) => patchToken({ size })}
          />
          {token.shape === 'square' && (
            <Dimension
              label="Corner radius"
              value={token.cornerRadius}
              min={0}
              max={token.size / 2}
              step={0.5}
              defaultValue={TOKEN_DEFAULTS.cornerRadius}
              onChange={(cornerRadius) => patchToken({ cornerRadius })}
            />
          )}
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

        <PanelFooter resets={resets} />
      </aside>
    </ScrollArea>
  )
}
