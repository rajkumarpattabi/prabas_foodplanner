import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL_TA = 'வெண் பொங்கல்'
const rowOf = (name: string) => screen.getByText(name).closest('li')!
const names = () => within(screen.getByRole('main')).getAllByRole('listitem').map((li) => li.querySelector('.font-medium')!.textContent)

describe('Dishes screen', () => {
  test('lists the library by type, in the chosen script first, with icons and labels', async () => {
    renderApp({ path: '/dishes' })
    expect(await screen.findByText('4 dishes')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Tiffin',
      'Sambar',
      'Chutney',
      'Non-veg gravy',
    ])
    const pongal = rowOf(PONGAL_TA)
    expect(within(pongal).getByText('Ven pongal')).toBeTruthy()
    expect(within(pongal).getByRole('img', { name: 'Tiffin' })).toBeTruthy()
    expect(within(pongal).getByText('Veg')).toBeTruthy()
    expect(within(rowOf('முட்டைக் குழம்பு')).getByText('Non-veg')).toBeTruthy()
    expect(within(rowOf('முட்டைக் குழம்பு')).getByText('Protein')).toBeTruthy()
  })

  test('search in either script or Tanglish', async () => {
    renderApp({ path: '/dishes' })
    const search = await screen.findByLabelText('Search dishes')
    fireEvent.change(search, { target: { value: 'pongal' } })
    expect(names()).toEqual([PONGAL_TA])
    fireEvent.change(search, { target: { value: 'சட்னி' } })
    expect(names()).toEqual(['தேங்காய் சட்னி'])
    fireEvent.change(search, { target: { value: 'biryani' } })
    expect(screen.getByText('No dishes match "biryani".')).toBeTruthy()
  })

  test('filter by meal and type, then clear', async () => {
    renderApp({ path: '/dishes' })
    fireEvent.click(await screen.findByRole('button', { name: 'Dinner', pressed: false }))
    expect(names()).toEqual(['தேங்காய் சட்னி', 'முட்டைக் குழம்பு'])
    fireEvent.click(screen.getByRole('button', { name: 'Chutney' }))
    expect(names()).toEqual(['தேங்காய் சட்னி'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('4 dishes')).toBeTruthy()
  })

  test('favourites and not-suggested, including changes from the other phone', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/dishes', household })
    fireEvent.click(await screen.findByRole('button', { name: 'Favourites' }))
    expect(screen.getByText('No dishes match these filters.')).toBeTruthy()

    act(() => household.server.otherPhoneEditsDish('hh-1:dish:ven_pongal', { is_favourite: true, dont_suggest: true }))
    expect(await screen.findByText('1 dish')).toBeTruthy()
    expect(within(rowOf(PONGAL_TA)).getByText('Favourite')).toBeTruthy()
    expect(within(rowOf(PONGAL_TA)).getByText('Not suggested')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }))
    fireEvent.click(screen.getByRole('button', { name: 'Not suggested' }))
    expect(names()).toEqual([PONGAL_TA])
  })
})
