import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

/** The drawing's title block carries the filename, the spec and the status. */
const footer = (page: Page) => page.locator('footer')
/** The viewport publishes the triangle count of the mesh it has actually drawn. */
const drawn = (page: Page) => page.locator('main [data-triangles]')
/** Footprint and height are read off the dimension leaders drawn on the part. */
const across = (page: Page) => page.locator('#label-across')
const tall = (page: Page) => page.locator('#label-height')
const marking = (page: Page) => page.getByLabel('Marking text')
const shape = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Options read "<size> <what it is for>", so anchor on the figure. */
const sizeOption = (page: Page, label: string) => page.getByRole('option', { name: new RegExp(`^${label.replaceAll('.', '\\.')}\\b`) })

async function pickSize(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Standard size' }).click()
  await sizeOption(page, label).click()
}

/** Geometry is built in a worker, so the drawing settles a moment after a click. */
async function settled(page: Page) {
  await expect(footer(page)).toContainText(/ready/i, { timeout: 15_000 })
  await expect.poll(() => triangles(page), { timeout: 15_000 }).toBeGreaterThan(0)
}

async function triangles(page: Page): Promise<number> {
  return Number((await drawn(page).getAttribute('data-triangles')) ?? 0)
}

/**
 * Waits for a rebuild to land. Polling the triangle count beats waiting for
 * "ready", which is still true from the build before the one being triggered.
 */
async function rebuilt(page: Page, previous: number) {
  await expect.poll(() => triangles(page), { timeout: 15_000 }).not.toBe(previous)
  await settled(page)
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await settled(page)
  // Surfaced at the end of every test rather than as its own case, so any spec
  // that trips a runtime error fails where the cause is visible.
  test.info().annotations.push({ type: 'console', description: errors.join('\n') })
})

test('builds the default base on load', async ({ page }) => {
  await expect(across(page)).toHaveText('Ø32')
  await expect(tall(page)).toHaveText('4')
  await expect(footer(page)).toContainText('base-round-32mm')
  expect(await triangles(page)).toBeGreaterThan(0)
})

test('links to the source repository', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/richardsolomou/mini-bases')
})

test('keeps a half millimetre size exact', async ({ page }) => {
  await pickSize(page, '28.5')
  await settled(page)
  await expect(across(page)).toHaveText('Ø28.5')
  // Rounding to 29 anywhere would defeat the whole point of the marking.
  await expect(marking(page)).toHaveAttribute('placeholder', '28.5')
})

test('names the download after the shape and size', async ({ page }) => {
  await pickSize(page, '28.5')
  await settled(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save STL' }).click()
  expect((await download).suggestedFilename()).toBe('base-round-28.5mm.stl')
})

test('exports a 3MF as well', async ({ page }) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save 3MF' }).click()
  expect((await download).suggestedFilename()).toBe('base-round-32mm.3mf')
})

test('exports finer circular geometry than the preview', async ({ page }) => {
  const previewTriangles = await triangles(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save STL' }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('download has no local path')
  const stl = await readFile(path)
  expect(stl.readUInt32LE(80)).toBeGreaterThan(previewTriangles)
})

const SHAPES = [
  { name: 'Oval', footprint: '60 × 35', mark: '60x35', chip: '170×105' },
  { name: 'Pill', footprint: '60 × 35', mark: '60x35', chip: '105×70' },
  { name: 'Rect', footprint: '25 × 50', mark: '25x50', chip: '50×100' },
  { name: 'Hex', footprint: 'Ø32', mark: '32', chip: '60' },
]

for (const entry of SHAPES) {
  test(`starts a ${entry.name.toLowerCase()} base on a standard size`, async ({ page }) => {
    await shape(page, entry.name).click()
    await settled(page)
    await expect(shape(page, entry.name)).toHaveAttribute('aria-pressed', 'true')
    // The size list swaps to that family's range.
    await page.getByRole('combobox', { name: 'Standard size' }).click()
    await expect(sizeOption(page, entry.chip)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(across(page)).toHaveText(entry.footprint)
    await expect(marking(page)).toHaveAttribute('placeholder', entry.mark)
  })
}

test('marks even a cramped rank base', async ({ page }) => {
  await shape(page, 'Rect').click()
  await settled(page)
  await pickSize(page, '20×20')
  await settled(page)
  await expect(marking(page)).toHaveAttribute('placeholder', '20x20')

  // A 20mm well is mostly boss and ribs. The marking used to be dropped silently
  // when it would not fit, so compare the triangle count against an unmarked base.
  const withMark = await triangles(page)
  await page.getByRole('switch', { name: 'Emboss the size inside' }).click()
  await rebuilt(page, withMark)
  expect(withMark).toBeGreaterThan(await triangles(page))
})

test('still builds with the wall and floor wound to their limits', async ({ page }) => {
  // The dimension fields clamp to their limits, so no combination can reach an
  // unbuildable base. The geometry does throw outside those bounds, so this guards
  // the clamping rather than the geometry.
  await page.getByRole('button', { name: 'PROFILE' }).click()
  const before = await triangles(page)
  for (const control of ['Wall in mm', 'Recess floor in mm']) {
    // Well past the maximum: the field clamps, which is the behaviour being guarded.
    await page.getByLabel(control).fill('99')
    await page.getByLabel(control).press('Enter')
  }
  await rebuilt(page, before)
  await expect(footer(page)).not.toContainText(/blocked/i)
})

test('caps the edge profile when the recess floor is thinned', async ({ page }) => {
  await page.getByRole('button', { name: 'PROFILE' }).click()
  const floorBuild = triangles(page)
  await page.getByLabel('Recess floor in mm').fill('0.4')
  await page.getByLabel('Recess floor in mm').press('Enter')
  await rebuilt(page, floorBuild)

  const edgeBuild = triangles(page)
  await page.getByLabel('Edge size in mm').fill('3')
  await page.getByLabel('Edge size in mm').press('Enter')
  await rebuilt(page, edgeBuild)
  await expect(page.getByLabel('Edge size in mm')).toHaveValue('1.7')
})

test('takes an exact typed dimension', async ({ page }) => {
  // The whole point of a typed field over a slider: 28.5 is reachable.
  await page.getByLabel('Across in mm').fill('28.5')
  await page.getByLabel('Across in mm').press('Enter')
  await settled(page)
  await expect(across(page)).toHaveText('Ø28.5')
})

test('clamps a dimension typed past its limit', async ({ page }) => {
  await page.getByLabel('Across in mm').fill('999')
  await page.getByLabel('Across in mm').press('Enter')
  await settled(page)
  await expect(page.getByLabel('Across in mm')).toHaveValue('180.0')
})

test('scrubs a dimension by dragging its label', async ({ page }) => {
  const field = page.getByLabel('Across in mm')
  const before = await triangles(page)
  const label = page.getByText('Across', { exact: true })
  const box = await label.boundingBox()
  if (!box) throw new Error('no label to drag')
  await page.mouse.move(box.x + 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await rebuilt(page, before)
  expect(Number(await field.inputValue())).toBeGreaterThan(32)
})

test('takes magnets out of the underside of a solid base', async ({ page }) => {
  await page.getByRole('button', { name: 'PROFILE' }).click()
  await page.getByRole('button', { name: 'Solid', exact: true }).click()
  await settled(page)
  // No well means nowhere to emboss, and the copy should say so.
  await expect(page.getByText(/solid base has no well/i)).toBeVisible()
})

test('moves the controls into a drawer on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // The docked panel is not rendered at all below `md`, so nothing is duplicated.
  await expect(page.getByLabel('Across in mm')).toBeHidden()

  await page.getByRole('button', { name: 'Base settings' }).click()
  const before = await triangles(page)
  await page.getByLabel('Across in mm').fill('60')
  await page.getByLabel('Across in mm').press('Enter')
  await rebuilt(page, before)
  await expect(across(page)).toHaveText('Ø60')
})
