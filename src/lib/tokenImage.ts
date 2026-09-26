import type { TokenImage } from '@/geometry/types'

/** Longest side kept from an upload: about 0.14mm per pixel across a 40mm token, finer than any nozzle. */
const MAX_SIDE = 256
/** Size an SVG without intrinsic dimensions is rasterised at. */
const FALLBACK_SIDE = MAX_SIDE

/**
 * Decodes an uploaded image into the greyscale grid the tracer reads. Transparent
 * pixels count as white, so a logo on a transparent background raises its ink.
 * Only the downsampled grid is kept, which keeps the saved workspace small.
 */
export async function loadTokenImage(file: File): Promise<TokenImage> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const naturalWidth = image.naturalWidth || FALLBACK_SIDE
    const naturalHeight = image.naturalHeight || FALLBACK_SIDE
    const scale = Math.min(1, MAX_SIDE / Math.max(naturalWidth, naturalHeight))
    const width = Math.max(1, Math.round(naturalWidth * scale))
    const height = Math.max(1, Math.round(naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('This browser cannot read images')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)

    let binary = ''
    for (let i = 0; i < data.length; i += 4) {
      binary += String.fromCharCode(Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]))
    }
    return { name: file.name, width, height, luminance: btoa(binary) }
  } catch (error) {
    throw new Error(`Could not read ${file.name} as an image`, { cause: error })
  } finally {
    URL.revokeObjectURL(url)
  }
}
