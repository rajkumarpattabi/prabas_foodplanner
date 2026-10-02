import { describe, expect, test } from 'vitest'
import { binarize, boxBlur, fitSize, MAX_SIDE } from './image.ts'

/** A width × height greyscale image, each pixel's value given by `at`. */
function page(width: number, height: number, at: (x: number, y: number) => number) {
  const out: number[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out.push(at(x, y))
  return out
}

describe('cleaning up the photo', () => {
  test('shrinks to MAX_SIDE on the longest side, keeping the shape; small photos stay', () => {
    expect(fitSize(3000, 4000)).toEqual({ width: 1500, height: MAX_SIDE })
    expect(fitSize(4000, 3000)).toEqual({ width: MAX_SIDE, height: 1500 })
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  test('blur averages each pixel with its neighbours, edges included', () => {
    expect(boxBlur([0, 0, 0, 0, 90, 0, 0, 0, 0], 3, 3)).toEqual([22.5, 15, 22.5, 15, 10, 15, 22.5, 15, 22.5])
  })

  test('ink turns black and paper white, even where a shadow darkens the paper', () => {
    const width = 160
    const height = 40
    // Paper fades from 250 on the left to 80 in shadow on the right; a vertical stroke of
    // ink every 20 pixels, at 40% of the paper around it. Ink on the left (100) is lighter
    // than paper on the right, so no single cut-off would do.
    const shade = (x: number) => 250 - (170 * x) / width
    const isInk = (x: number) => x % 20 === 10
    const out = binarize(page(width, height, (x) => (isInk(x) ? shade(x) * 0.4 : shade(x))), width, height)
    const row = out.slice(20 * width, 21 * width)
    expect(row.filter((v, x) => isInk(x) && v === 0)).toHaveLength(8)
    expect(row.filter((v, x) => !isInk(x) && v === 255)).toHaveLength(width - 8)
  })

  test('plain paper stays white', () => {
    expect(new Set(binarize(page(50, 50, () => 200), 50, 50))).toEqual(new Set([255]))
  })
})
