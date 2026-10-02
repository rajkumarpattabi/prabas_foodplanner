import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { OcrContext, tesseractOcr } from './bills/ocr.ts'
import { ToastProvider } from './components/ToastProvider.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import { Root } from './Root.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

// Made once; Tesseract itself loads only when a bill is first scanned.
const ocr = tesseractOcr()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <ToastProvider>
          <UpdateBanner />
          <OcrContext.Provider value={ocr}>
            <Root />
          </OcrContext.Provider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
