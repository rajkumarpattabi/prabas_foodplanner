import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ToastProvider } from './components/ToastProvider.tsx'
import { useToast } from './components/toastContext.ts'
import { renderApp } from './test/renderApp.tsx'

afterEach(() => {
  vi.useRealTimers()
})

test('opens on Plan and switches tabs', async () => {
  renderApp()
  expect(await screen.findByRole('heading', { name: 'Plan' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Stock' }))
  expect(screen.getByRole('heading', { name: 'Stock' })).toBeTruthy()
})

test('Settings opens from Plan, and a manual theme applies at once and is saved to the profile', async () => {
  const { household } = renderApp({ path: '/plan' })
  fireEvent.click(await screen.findByRole('link', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('prabas_theme_pref')).toBe('dark')
  await waitFor(() => expect(household.server.profile('user-1')?.theme_pref).toBe('dark'))
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
