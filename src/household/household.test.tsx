import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import { formatJoinCode, normaliseJoinCode } from './joinCode.ts'

describe('join codes', () => {
  test('accept what people type, and show split in two', () => {
    expect(normaliseJoinCode(' k7m-4qp ')).toBe('K7M4QP')
    expect(formatJoinCode('K7M4QP')).toBe('K7M-4QP')
    expect(formatJoinCode('K7')).toBe('K7')
  })
})

describe('first login', () => {
  test('start a household, then land on Plan', async () => {
    const household = fakeHouseholdApi()
    renderApp({ household })

    const name = await screen.findByLabelText('Your name')
    fireEvent.change(name, { target: { value: 'Raj' } })
    fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Prabas home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start household' }))

    expect(await screen.findByRole('heading', { name: 'Plan' })).toBeTruthy()
    expect(household.createHousehold).toHaveBeenCalledWith('Prabas home')
    await waitFor(() => expect(household.server.profile('user-1')?.display_name).toBe('Raj'))
  })

  test('a wrong join code explains itself; the right one joins', async () => {
    renderApp({ household: fakeHouseholdApi() })

    fireEvent.click(await screen.findByRole('radio', { name: 'Join with a code' }))
    const code = screen.getByLabelText('Join code')
    fireEvent.change(code, { target: { value: 'abc123' } })
    expect((code as HTMLInputElement).value).toBe('ABC-123')
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    expect((await screen.findByRole('alert')).textContent).toContain("didn't match a household")

    fireEvent.change(code, { target: { value: 'join me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    expect(await screen.findByRole('heading', { name: 'Plan' })).toBeTruthy()
  })

  test('the button waits for a name and a household name', async () => {
    renderApp({ household: fakeHouseholdApi() })
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: ' ' } })
    expect(screen.getByRole('button', { name: 'Start household' })).toHaveProperty('disabled', true)
  })
})

describe('Settings household section', () => {
  test('shows members, the join code, and the backup owner', async () => {
    renderApp({ path: '/settings' })
    expect(await screen.findByText('K7M-4QP')).toBeTruthy()
    expect(screen.getByText('(you)')).toBeTruthy()
    expect(screen.getByText('Amma')).toBeTruthy()
    expect(screen.getByText('Backup owner:').parentElement?.textContent).toContain('You')
  })

  test('rename applies at once, records who, and can be undone', async () => {
    const { household } = renderApp({ path: '/settings' })
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Chennai home' } })
    fireEvent.blur(name)

    expect(name.value).toBe('Chennai home')
    await waitFor(() => expect(household.server.household()?.name).toBe('Chennai home'))
    expect(await screen.findByText(/Updated by you/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(household.server.household()?.name).toBe('Prabas home'))
    await waitFor(() => expect(name.value).toBe('Prabas home'))
  })

  test('a change the server refuses is undone, with a message', async () => {
    const { household } = renderApp({ path: '/settings' })
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'x'.repeat(61) } })
    fireEvent.blur(name)

    expect(await screen.findByText("A change couldn't be saved, so it was undone.")).toBeTruthy()
    await waitFor(() => expect(name.value).toBe('Prabas home'))
    expect(household.server.household()?.name).toBe('Prabas home')
  })

  test('New code replaces the join code', async () => {
    renderApp({ path: '/settings' })
    fireEvent.click(await screen.findByRole('button', { name: 'New code' }))
    expect(await screen.findByText('The old one no longer works.', { exact: false })).toBeTruthy()
    expect(screen.queryByText('K7M-4QP')).toBeNull()
  })

  test('dish name order is saved to the profile', async () => {
    const { household } = renderApp({ path: '/settings' })
    fireEvent.click(await screen.findByRole('radio', { name: 'English first' }))
    expect(screen.getByRole('radio', { name: 'English first' }).getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(household.server.profile('user-1')?.script_pref).toBe('en_first'))
  })
})
