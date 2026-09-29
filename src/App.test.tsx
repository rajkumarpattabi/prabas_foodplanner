import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { ToastProvider } from './components/ToastProvider.tsx'
import { useToast } from './components/toastContext.ts'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
})

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

test('opens on Plan and switches tabs', () => {
  renderApp()
  expect(screen.getByRole('heading', { name: 'Plan' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Stock' }))
  expect(screen.getByRole('heading', { name: 'Stock' })).toBeTruthy()
})

test('Settings opens from Plan, and a manual theme applies at once', () => {
  renderApp('/plan')
  fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('prabas_theme_pref')).toBe('dark')
})

test('toast offers undo', () => {
  vi.useFakeTimers()
  const undo = vi.fn()
  function Trigger() {
    const toast = useToast()
    return <button onClick={() => toast('Item removed', { undo })}>Remove</button>
  }
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('Remove'))
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(undo).toHaveBeenCalledOnce()
  expect(screen.queryByText('Item removed')).toBeNull()

  fireEvent.click(screen.getByText('Remove'))
  act(() => vi.advanceTimersByTime(7000))
  expect(screen.queryByText('Item removed')).toBeNull()
})
