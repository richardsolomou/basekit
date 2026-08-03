import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'

/** The drawing's title block carries the filename, the spec and the status. */
const footer = (page: Page) => page.locator('footer')
/** The viewport publishes the triangle count of the mesh it has actually drawn. */
const drawn = (page: Page) => page.locator('main [data-triangles]')
/** Footprint and height are read off the dimension leaders drawn on the part. */
const across = (page: Page) => page.locator('#label-across')
const tall = (page: Page) => page.locator('#label-height')
const sizeLabel = (page: Page) => page.getByLabel('Label text')

/** Options read "<size> <what it is for>", so anchor on the figure. */
const sizeOption = (page: Page, label: string) => page.getByRole('option', { name: new RegExp(`^${label.replaceAll('.', '\\.')}\\b`) })

async function pickSize(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Standard base size' }).click()
  await sizeOption(page, label).click()
}

async function pickChoice(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
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

test('builds the default base on load', { tag: '@ci' }, async ({ page }) => {
  await expect(across(page)).toHaveText('Ø32')
  await expect(tall(page)).toHaveText('4')
  await expect(footer(page)).toContainText('base-round-32mm')
  expect(await triangles(page)).toBeGreaterThan(0)
})

test('links to the source repository', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/richardsolomou/mini-bases')
})

test('keeps a half millimetre size exact', { tag: '@ci' }, async ({ page }) => {
  await pickSize(page, '28.5')
  await settled(page)
  await expect(across(page)).toHaveText('Ø28.5')
  // Rounding to 29 anywhere would defeat the whole point of the size label.
  await expect(sizeLabel(page)).toHaveAttribute('placeholder', '28.5')
})

test('uses an end pair for a medium oval base', async ({ page }) => {
  await pickChoice(page, 'Shape', 'Oval')
  await pickSize(page, '90×52')
  await expect(page.getByRole('combobox', { name: 'Magnets per base' })).toContainText('2')
})

test('marks and resets a changed value to its default', { tag: '@ci' }, async ({ page }) => {
  await pickSize(page, '28.5')
  await pickSize(page, 'Custom')
  const reset = page.getByRole('button', { name: 'Reset Diameter to 32.0 mm' })
  await expect(reset).toBeVisible()
  await expect(page.getByText('Diameter', { exact: true })).toHaveClass(/text-modified/)
  await reset.click()
  await expect(page.getByLabel('Diameter in mm', { exact: true })).toHaveValue('32.0')
  await expect(reset).not.toBeVisible()
})

test('marks and resets changed toggles and choices', async ({ page }) => {
  const labelToggle = page.getByRole('switch', { name: 'Show size label' })
  await labelToggle.click()
  const resetLabel = page.getByRole('button', { name: 'Reset Show size label to on' })
  await expect(resetLabel).toBeVisible()
  await resetLabel.click()
  await expect(labelToggle).toBeChecked()

  await pickChoice(page, 'Shape', 'Oval')
  const resetShape = page.getByRole('button', { name: 'Reset Shape to Round' })
  await expect(resetShape).toBeVisible()
  await resetShape.click()
  await expect(page.getByRole('combobox', { name: 'Shape' })).toContainText('Round')
})

test('aligns toggle and dimension reset columns', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await page.getByLabel('Between minis in mm').fill('1.5')
  await page.getByRole('switch', { name: 'Split into modules' }).click()
  const dimensionReset = await page.getByRole('button', { name: /Reset Between minis/ }).boundingBox()
  const toggleReset = await page.getByRole('button', { name: /Reset Split into modules/ }).boundingBox()
  const dimension = await page.getByLabel('Between minis in mm').boundingBox()
  const toggle = await page.getByRole('switch', { name: 'Split into modules' }).boundingBox()
  expect(toggleReset?.x).toBe(dimensionReset?.x)
  expect(toggle?.x).toBe(dimension?.x)
})

test('names the download after the shape and size', async ({ page }) => {
  await pickSize(page, '28.5')
  await settled(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download STL' }).click()
  expect((await download).suggestedFilename()).toBe('base-round-28.5mm.stl')
})

test('exports a 3MF as well', async ({ page }) => {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download 3MF' }).click()
  expect((await download).suggestedFilename()).toBe('base-round-32mm.3mf')
})

test('exports finer circular geometry than the preview', { tag: '@ci' }, async ({ page }) => {
  const previewTriangles = await triangles(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download STL' }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('download has no local path')
  const stl = await readFile(path)
  expect(stl.readUInt32LE(80)).toBeGreaterThan(previewTriangles)
})

test('builds and exports an automatically sized Gridfinity holder', async ({ page }) => {
  const before = await triangles(page)
  await page.getByRole('link', { name: 'Holders' }).click()
  await rebuilt(page, before)
  await expect(page).toHaveURL(/\/holders$/)
  await expect(across(page)).toHaveText('41.5 × 167.5')
  await expect(tall(page)).toHaveText('14')
  await expect(footer(page)).toContainText('holder-gridfinity-1x4-5x32mm')
  await expect(footer(page)).toContainText('5 × 5.2 mm hole')

  const previewTriangles = await triangles(page)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download STL' }).click()
  const saved = await download
  expect(saved.suggestedFilename()).toBe('holder-gridfinity-1x4-5x32mm.stl')
  const path = await saved.path()
  if (!path) throw new Error('download has no local path')
  expect((await readFile(path)).readUInt32LE(80)).toBeGreaterThan(previewTriangles)
})

test('loads the Gridfinity holder directly from its route', { tag: '@ci' }, async ({ page }) => {
  await page.goto('/holders')
  await settled(page)
  await expect(page).toHaveTitle('Gridfinity Mini Holders')
  await expect(page.getByRole('link', { name: 'Holders' })).toHaveAttribute('aria-current', 'page')
  await expect(footer(page)).toContainText('holder-gridfinity-1x4-5x32mm')
})

test('updates integer holder inputs immediately without losing focus', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  await expect(page.getByLabel(/^Maximum columns in/)).toHaveValue('7')
  await expect(page.getByLabel(/^Maximum rows in/)).toHaveValue('5')
  const quantity = page.getByLabel(/^Quantity 1 in/)
  const before = await triangles(page)
  await quantity.fill('4')
  await rebuilt(page, before)
  await expect(quantity).toBeFocused()
  await expect(quantity).toHaveValue('4')
})

test('caps oversized holder quantities before rendering', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  const quantity = page.getByLabel(/^Quantity 1 in/)
  const before = await triangles(page)
  await quantity.fill('100')
  await rebuilt(page, before)
  await expect(quantity).toBeFocused()
  await expect(quantity).toHaveValue('100')
  await expect(page.getByText(/\d+\/100 fitted/)).toBeVisible()
  await expect(page.getByText(/Only \d+ of 100 fit/)).toBeVisible()
})

test('switches between subtractive holder engraving locations', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  await expect(page.getByRole('switch', { name: 'Label base sizes' })).toBeChecked()
  await expect(page.getByRole('combobox', { name: 'Label location' })).toContainText('In slots')
  const before = await triangles(page)
  await pickChoice(page, 'Label location', 'On module')
  await rebuilt(page, before)
  await expect(page.getByRole('combobox', { name: 'Label location' })).toContainText('On module')
  const moduleTriangles = await triangles(page)
  await pickChoice(page, 'Label location', 'In slots')
  await rebuilt(page, moduleTriangles)
  await expect(page.getByRole('combobox', { name: 'Label location' })).toContainText('In slots')
})

test('keeps slot features above the Gridfinity foot', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  const depth = page.getByRole('spinbutton', { name: 'Slot depth in mm' })
  const magnets = page.getByRole('switch', { name: 'Slot magnets' })
  await expect(depth).toHaveAttribute('max', '6.5')
  await magnets.click()
  await expect(depth).toHaveAttribute('max', '8')
  await depth.fill('8')
  await depth.press('Enter')
  const before = await triangles(page)
  await magnets.click()
  await rebuilt(page, before)
  await expect(depth).toHaveValue('6.5')
})

test('moves to a second column when the row constraint requires it', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  const before = await triangles(page)
  await page.getByLabel(/^Maximum rows in/).fill('3')
  await page.getByLabel(/^Maximum rows in/).press('Enter')
  await rebuilt(page, before)
  await expect(across(page)).toHaveText('83.5 × 83.5')
  await expect(footer(page)).toContainText('1 in 2 × 2')
})

test('fits what it can and reports box overflow', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  await page.getByLabel(/^Maximum columns in/).fill('1')
  await page.getByLabel(/^Maximum columns in/).press('Enter')
  const before = await triangles(page)
  await page.getByLabel(/^Maximum rows in/).fill('1')
  await page.getByLabel(/^Maximum rows in/).press('Enter')
  await rebuilt(page, before)
  await expect(page.getByText('Only 1 of 5 fit')).toBeVisible()
  await expect(footer(page)).toContainText('4×Ø32')
})

test('uses clear wording when no holder miniatures fit', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  await page.getByLabel(/^Maximum columns in/).fill('1')
  await page.getByLabel(/^Maximum columns in/).press('Enter')
  const constrained = await triangles(page)
  await page.getByLabel(/^Maximum rows in/).fill('1')
  await page.getByLabel(/^Maximum rows in/).press('Enter')
  await rebuilt(page, constrained)
  await page.getByRole('combobox', { name: 'Standard base size 1' }).click()
  await page.getByRole('option', { name: '90 Greater daemons, big characters' }).click()
  await expect(page.getByRole('combobox', { name: 'Standard base size 1' })).toContainText('90')
  await expect(page.getByText('None of 5 fit')).toBeVisible()
  await expect(page.getByText(/Only 0 of/)).not.toBeVisible()
})

test('adds another miniature size to the holder', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  await expect(page.getByRole('switch', { name: 'Split into modules' })).toBeChecked()
  const before = await triangles(page)
  await page.getByRole('button', { name: 'Add size' }).click()
  await rebuilt(page, before)
  await expect(page.getByLabel(/^Quantity 2 in/)).toHaveValue('1')
  await expect(page.getByRole('combobox', { name: 'Standard base size 2' })).toContainText('40')
  await expect(footer(page)).toContainText('5×Ø32 · 1×Ø40')

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download STLs' }).click()
  const saved = await pending
  expect(saved.suggestedFilename()).toBe('holder-gridfinity-2x4-5x32-1x40mm.zip')
  const path = await saved.path()
  if (!path) throw new Error('download has no local path')
  expect(Object.keys(unzipSync(await readFile(path))).filter((name) => name.endsWith('.stl'))).toHaveLength(2)
})

test('changes holder slots to non-round base shapes', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  const before = await triangles(page)
  await pickChoice(page, 'Shape 1', 'Oval')
  await rebuilt(page, before)
  const oval = await triangles(page)
  await page.getByRole('combobox', { name: 'Standard base size 1' }).click()
  await page.getByRole('option', { name: /75×42\b.*Cavalry/ }).click()
  await rebuilt(page, oval)
  await expect(page.getByRole('combobox', { name: 'Standard base size 1' })).toContainText('75×42')
  await expect(footer(page)).toContainText('5×oval 75×42')
  await expect(footer(page)).toContainText('holder-gridfinity-4x4-5xoval-75x42mm')
  await page.getByRole('combobox', { name: 'Standard base size 1' }).click()
  await page.getByRole('option', { name: 'Custom exact dimensions' }).click()
  await expect(page.getByRole('combobox', { name: 'Standard base size 1' })).toContainText('Custom')
  await expect(page.getByText('Width', { exact: true })).toBeVisible()
  await expect(page.getByText('Depth', { exact: true })).toBeVisible()
  await expect(page.getByLabel(/^Base width 1 in/)).toHaveValue('75.0')
  await expect(page.getByLabel(/^Base depth 1 in/)).toHaveValue('42.0')
})

test('uses preset magnet layouts in holder slots', async ({ page }) => {
  await page.getByRole('link', { name: 'Holders' }).click()
  await settled(page)
  const before = await triangles(page)
  await page.getByRole('combobox', { name: 'Standard base size 1' }).click()
  await page.getByRole('option', { name: '65 Large monsters' }).click()
  await rebuilt(page, before)
  await expect(footer(page)).toContainText('15 × 5.2 mm hole')
})

const SHAPES = [
  { name: 'Oval', footprint: '60 × 35', mark: '60x35', chip: '170×105' },
  { name: 'Pill', footprint: '60 × 35', mark: '60x35', chip: '105×70' },
  { name: 'Rectangle', footprint: '25 × 50', mark: '25x50', chip: '50×100' },
  { name: 'Hex', footprint: 'Ø32', mark: '32', chip: '60' },
]

for (const entry of SHAPES) {
  test(`starts a ${entry.name.toLowerCase()} base on a standard size`, async ({ page }) => {
    await pickChoice(page, 'Shape', entry.name)
    await settled(page)
    await expect(page.getByRole('combobox', { name: 'Shape' })).toContainText(entry.name)
    // The size list swaps to that family's range.
    await page.getByRole('combobox', { name: 'Standard base size' }).click()
    await expect(sizeOption(page, entry.chip)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(across(page)).toHaveText(entry.footprint)
    await expect(sizeLabel(page)).toHaveAttribute('placeholder', entry.mark)
  })
}

test('marks even a cramped rank base', async ({ page }) => {
  await pickChoice(page, 'Shape', 'Rectangle')
  await settled(page)
  await pickSize(page, '20×20')
  await settled(page)
  await expect(sizeLabel(page)).toHaveAttribute('placeholder', '20x20')

  // A 20mm well is mostly boss and ribs. The label used to be dropped silently
  // when it would not fit, so compare the triangle count against an unmarked base.
  const withMark = await triangles(page)
  await page.getByRole('switch', { name: 'Show size label' }).click()
  await rebuilt(page, withMark)
  expect(withMark).toBeGreaterThan(await triangles(page))
})

test('still builds with the wall and floor wound to their limits', async ({ page }) => {
  // The dimension fields clamp to their limits, so no combination can reach an
  // unbuildable base. The geometry does throw outside those bounds, so this guards
  // the clamping rather than the geometry.
  const before = await triangles(page)
  for (const control of ['Wall thickness in mm', 'Top thickness in mm']) {
    // Well past the maximum: the field clamps, which is the behaviour being guarded.
    await page.getByLabel(control).fill('99')
    await page.getByLabel(control).blur()
  }
  await rebuilt(page, before)
  await expect(footer(page)).not.toContainText(/blocked/i)
})

test('caps the edge profile when the recess floor is thinned', async ({ page }) => {
  const floorBuild = triangles(page)
  await page.getByLabel('Top thickness in mm').fill('0.4')
  await page.getByLabel('Top thickness in mm').press('Enter')
  await rebuilt(page, floorBuild)

  const edgeBuild = triangles(page)
  await page.getByLabel('Edge size in mm').fill('3')
  await page.getByLabel('Edge size in mm').blur()
  await rebuilt(page, edgeBuild)
  await expect(page.getByLabel('Edge size in mm')).toHaveValue('1.7')
})

test('takes an exact typed dimension', async ({ page }) => {
  // The whole point of a typed field over a slider: 28.5 is reachable.
  await pickSize(page, 'Custom')
  const field = page.getByLabel('Diameter in mm', { exact: true })
  await field.fill('')
  await field.pressSequentially('28.5')
  await settled(page)
  await expect(across(page)).toHaveText('Ø28.5')
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('28.5')
})

test('clamps a dimension typed past its limit', async ({ page }) => {
  await pickSize(page, 'Custom')
  await page.getByLabel('Diameter in mm', { exact: true }).fill('999')
  await page.getByLabel('Diameter in mm', { exact: true }).blur()
  await settled(page)
  await expect(page.getByLabel('Diameter in mm', { exact: true })).toHaveValue('180.0')
})

test('scrubs a dimension from the empty reset space after its label', async ({ page }) => {
  await pickSize(page, 'Custom')
  const field = page.getByLabel('Diameter in mm', { exact: true })
  const before = await triangles(page)
  const label = page.getByText('Diameter', { exact: true })
  const box = await label.boundingBox()
  if (!box) throw new Error('no label to drag')
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 75, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await rebuilt(page, before)
  expect(Number(await field.inputValue())).toBeGreaterThan(32)
})

test('toggles a setting from the empty reset space after its label', async ({ page }) => {
  const toggle = page.getByRole('switch', { name: 'Show size label' })
  const label = page.getByText('Show size label', { exact: true })
  const box = await label.boundingBox()
  if (!box) throw new Error('no label to click')
  await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2)
  await expect(toggle).not.toBeChecked()
})

test('takes magnets out of the underside of a solid base', async ({ page }) => {
  await pickChoice(page, 'Underside', 'Solid')
  await settled(page)
  // No well means nowhere to emboss, and the copy should say so.
  await expect(page.getByText(/solid base has no well/i)).toBeVisible()
})

test('moves the controls into a drawer on a phone', { tag: '@ci' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // The docked panel is not rendered at all below `md`, so nothing is duplicated.
  await expect(page.getByLabel('Diameter in mm', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Base settings' }).click()
  await pickSize(page, 'Custom')
  const before = await triangles(page)
  await page.getByLabel('Diameter in mm', { exact: true }).fill('60')
  await page.getByLabel('Diameter in mm', { exact: true }).press('Enter')
  await rebuilt(page, before)
  await expect(across(page)).toHaveText('Ø60')
})
