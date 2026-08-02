import { expect, test, type Page } from '@playwright/test'

/** The status rail carries the live triangle, volume and footprint readout. */
const footer = (page: Page) => page.locator('footer')
const marking = (page: Page) => page.getByLabel('Marking text')
const sizeChip = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true }).first()
const shape = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Geometry is built in a worker, so the readout settles a moment after a click. */
async function settled(page: Page) {
  await expect(footer(page)).toContainText('ready', { timeout: 15_000 })
  await expect(footer(page)).toContainText('watertight')
}

async function triangles(page: Page): Promise<number> {
  const text = (await footer(page).innerText()).match(/([\d,]+) tris/)
  return Number(text?.[1].replaceAll(',', '') ?? 0)
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
  await expect(footer(page)).toContainText('Ø32 × 4mm')
  await expect(footer(page)).not.toContainText('0 tris')
})

test('keeps a half millimetre size exact', async ({ page }) => {
  await sizeChip(page, '28.5').click()
  await settled(page)
  await expect(footer(page)).toContainText('Ø28.5')
  // Rounding to 29 anywhere would defeat the whole point of the marking.
  await expect(marking(page)).toHaveAttribute('placeholder', '28.5')
})

test('names the download after the shape and size', async ({ page }) => {
  await sizeChip(page, '28.5').click()
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

const SHAPES = [
  { name: 'Oval', heading: 'OVAL SIZES', footprint: '60 × 35', mark: '60x35' },
  { name: 'Pill', heading: 'PILL SIZES', footprint: '60 × 35', mark: '60x35' },
  { name: 'Rect', heading: 'RANK SIZES', footprint: '25 × 50', mark: '25x50' },
  { name: 'Hex', heading: 'HEX SIZES', footprint: 'Ø32', mark: '32' },
]

for (const entry of SHAPES) {
  test(`starts a ${entry.name.toLowerCase()} base on a standard size`, async ({ page }) => {
    await shape(page, entry.name).click()
    await settled(page)
    await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible()
    await expect(footer(page)).toContainText(entry.footprint)
    await expect(marking(page)).toHaveAttribute('placeholder', entry.mark)
  })
}

test('marks even a cramped rank base', async ({ page }) => {
  await shape(page, 'Rect').click()
  await settled(page)
  await sizeChip(page, '20×20').click()
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
  // The sliders are clamped so no combination can reach an unbuildable base; this
  // guards that clamping, since the geometry does throw outside those bounds.
  await page.getByRole('button', { name: 'BODY' }).click()
  const before = await triangles(page)
  for (const control of ['Wall in mm', 'Floor under magnet in mm']) {
    const slider = page.getByLabel(control)
    // Setting the value directly beats holding an arrow key: every keypress would
    // queue its own rebuild, which is slow enough on CI to time the test out.
    await slider.fill((await slider.getAttribute('max')) ?? '')
  }
  await rebuilt(page, before)
  await expect(footer(page)).not.toContainText('blocked')
})

test('saves a pack of sizes as one zip', async ({ page }) => {
  await page.getByRole('button', { name: 'PACK' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Save \d+ STLs as zip/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^bases-\d+-pack\.zip$/)
})

test('takes magnets out of the underside of a solid base', async ({ page }) => {
  await page.getByRole('button', { name: 'BODY' }).click()
  await page.getByRole('button', { name: 'Solid', exact: true }).click()
  await settled(page)
  // No well means nowhere to emboss, and the copy should say so.
  await expect(page.getByText(/solid base has no well/i)).toBeVisible()
})
