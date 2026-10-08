import { describe, expect, it } from 'vitest'
import { filamentEstimate } from './filament'

describe('filament estimate', () => {
  it('gives a small part to a tenth of a gram', () => {
    expect(filamentEstimate(1.637)).toBe('≈1.6 g solid PLA')
  })

  it('gives a large part to the whole gram', () => {
    expect(filamentEstimate(187.275)).toBe('≈187 g solid PLA')
  })

  it('moves to whole grams once a tenth would round up to ten', () => {
    expect(filamentEstimate(9.96)).toBe('≈10 g solid PLA')
  })

  it('drops a trailing zero tenth', () => {
    expect(filamentEstimate(3.04)).toBe('≈3 g solid PLA')
  })

  it('never rounds a printable part down to nothing', () => {
    expect(filamentEstimate(0.02)).toBe('<0.1 g solid PLA')
  })
})
