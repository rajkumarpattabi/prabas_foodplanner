// Reading a bill photo on the phone with Tesseract (English and Tamil). The library is
// loaded only when the scanner is used, so it doesn't add to the app's own size. Its
// engine and language data download from the jsDelivr CDN the first time and are then
// cached; the photo itself never leaves the phone.

import { createContext, useContext } from 'react'

export interface Ocr {
  /** The text in the image, line by line. `onProgress` gets 0 to 1. */
  read(image: HTMLCanvasElement | Blob, onProgress?: (fraction: number, stage: string) => void): Promise<string>
}

/** Languages read: Tamil script and English, together (bills mix them). */
export const OCR_LANGUAGES = ['eng', 'tam']

type Worker = import('tesseract.js').Worker

/** The real thing. One engine, made on first use and kept for the next bill. */
export function tesseractOcr(): Ocr {
  let worker: Promise<Worker> | null = null
  let report: ((fraction: number, stage: string) => void) | undefined
  const engine = () => {
    worker ??= import('tesseract.js').then(async ({ createWorker, PSM }) => {
      const w = await createWorker(OCR_LANGUAGES, 1, {
        logger: (m: { status: string; progress: number }) => report?.(m.progress, m.status),
      })
      // A bill is one column of short lines: read it as a single block, keep spacing.
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
      return w
    })
    return worker
  }
  return {
    async read(image, onProgress) {
      report = onProgress
      try {
        const w = await engine()
        const { data } = await w.recognize(image)
        return data.text
      } catch (e) {
        // A failed download (offline the first time) can be tried again next time.
        worker = null
        throw e
      } finally {
        report = undefined
      }
    },
  }
}

export const OcrContext = createContext<Ocr | null>(null)
export const useOcr = () => useContext(OcrContext)
