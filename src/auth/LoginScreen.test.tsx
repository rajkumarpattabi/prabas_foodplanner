import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { Root } from '../Root.tsx'
import { fakeAuth, fakeSession, TEST_CODE } from '../test/fakeAuth.ts'
import { ThemeProvider } from '../theme/ThemeProvider.tsx'
import { PENDING_TTL_MS, savePending } from './pendingLogin.ts'

afterEach(() => localStorage.clear())

function renderRoot(auth: ReturnType<typeof fakeAuth>) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <Root auth={auth} />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

test('email, then code, then the app', async () => {
  const auth = fakeAuth()
  renderRoot(auth)

  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: ' Raj@Example.test ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

  const code = await screen.findByLabelText(/Code sent to/)
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'raj@example.test', options: { shouldCreateUser: true } })
  expect(screen.getByRole('button', { name: /Resend in/ })).toHaveProperty('disabled', true)

  fireEvent.change(code, { target: { value: `${TEST_CODE} ` } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('heading', { name: 'Plan' })).toBeTruthy()
  expect(localStorage.getItem('prabas_login_pending')).toBeNull()
})

test('a wrong code shows a plain message and stays on the code step', async () => {
  savePending('raj@example.test')
  renderRoot(fakeAuth())

  fireEvent.change(await screen.findByLabelText(/Code sent to/), { target: { value: '000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

  expect((await screen.findByRole('alert')).textContent).toContain("That code didn't work")
})

test('the rate limit gets its own message', async () => {
  renderRoot(fakeAuth({ sendError: { code: 'over_email_send_rate_limit', status: 429 } }))
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'raj@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Too many codes sent')
})

test('reopening the app resumes at the code step, until the code expires', async () => {
  savePending('raj@example.test')
  const { unmount } = renderRoot(fakeAuth())
  expect(await screen.findByText('raj@example.test')).toBeTruthy()
  unmount()

  savePending('raj@example.test', Date.now() - PENDING_TTL_MS - 1)
  renderRoot(fakeAuth())
  expect(await screen.findByLabelText('Email')).toBeTruthy()
})

test('a saved session opens the app, and log out returns to login', async () => {
  renderRoot(fakeAuth({ session: fakeSession() }))
  fireEvent.click(await screen.findByRole('link', { name: 'Settings' }))
  expect(screen.getByText('raj@example.test')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
  expect(await screen.findByLabelText('Email')).toBeTruthy()
})
