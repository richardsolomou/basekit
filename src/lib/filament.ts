/** Solid PLA weight of a built mesh; a slicer's walls and infill will print lighter. */
export function filamentEstimate(grams: number): string {
  if (grams < 0.05) return '<0.1 g solid PLA'
  return `≈${grams < 9.95 ? Number(grams.toFixed(1)) : Math.round(grams)} g solid PLA`
}
