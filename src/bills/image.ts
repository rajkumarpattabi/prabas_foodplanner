// Cleaning up a phone photo of a bill before OCR: smaller, greyscale, then black ink on
// white. Phone cameras give 12-megapixel photos; OCR reads a 2000-pixel one faster and as
// well. (A whole-page contrast stretch was tried and dropped: on a shadowed photo it
// turned the shadowed paper black. The local threshold copes with shadows by itself.)
// The steps are pure functions on plain arrays, so they're tested without a canvas.

/** The longest side after shrinking. */
export const MAX_SIDE = 2000

/** Window for adaptive thresholding, as a share of the image width. */
const WINDOW = 1 / 16
/** A pixel this much darker than its neighbourhood counts as ink. */
const DARKER = 0.15

/** A light 3×3 box blur, to calm speckle noise before thresholding. */
export function boxBlur(grey: ArrayLike<number>, width: number, height: number): number[] {
  const out = new Array<number>(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          sum += grey[yy * width + xx]
          n++
        }
      }
      out[y * width + x] = sum / n
    }
  }
  return out
}

/**
 * Black ink on white paper, judged against each pixel's own neighbourhood rather than
 * the whole page (Bradley–Roth, with an integral image), so a shadow across part of the
 * bill doesn't swallow the text there.
 */
export function binarize(grey: ArrayLike<number>, width: number, height: number): number[] {
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 1; y <= height; y++) {
    let row = 0
    for (let x = 1; x <= width; x++) {
      row += grey[(y - 1) * width + (x - 1)]
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row
    }
  }
  const half = Math.max(4, Math.round((width * WINDOW) / 2))
  const out = new Array<number>(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(width, x + half + 1)
      const area = (x1 - x0) * (y1 - y0)
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0]
      out[y * width + x] = grey[y * width + x] * area < sum * (1 - DARKER) ? 0 : 255
    }
  }
  return out
}

/** The size to shrink to: the same shape, no side longer than MAX_SIDE. */
export function fitSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** The photo, shrunk, in greyscale, then black ink on white: ready for OCR. */
export async function prepareBillImage(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitSize(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const img = ctx.getImageData(0, 0, width, height)
  const grey = new Uint8ClampedArray(width * height)
  for (let i = 0; i < grey.length; i++) {
    const [r, g, b] = [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]
    grey[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  const out = binarize(boxBlur(grey, width, height), width, height)
  for (let i = 0; i < out.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = out[i]
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
