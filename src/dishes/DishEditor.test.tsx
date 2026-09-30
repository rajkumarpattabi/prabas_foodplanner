import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const PONGAL_TA = 'வெண் பொங்கல்'
const SAMBAR = 'hh-1:dish:kathirikkai_sambar'
const CHUTNEY = 'hh-1:dish:thengai_chutney'

const dialog = () => screen.getByRole('dialog')
const click = (name: string | RegExp) => fireEvent.click(within(dialog()).getByRole('button', { name }))
const type = (label: string, value: string) => fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } })

async function editPongal(household = fakeHouseholdApi({ withHousehold: true })) {
  renderApp({ path: '/dishes', household })
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(PONGAL_TA) }))
  click('Edit dish')
  expect(screen.getByRole('dialog', { name: `Edit ${PONGAL_TA}` })).toBeTruthy()
  // Items load alongside dishes.
  await within(dialog()).findByRole('button', { name: /^அரிசி/ })
  return household
}

describe('adding a dish', () => {
  test('names, type, meal, an ingredient and a side; then it opens', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/dishes', household })
    fireEvent.click(await screen.findByRole('button', { name: '+ Add dish' }))
    expect(screen.getByRole('dialog', { name: 'New dish' })).toBeTruthy()

    type('Tamil name', 'கொள்ளு ரசம்')
    type('English name', 'Kollu rasam')
    type('Other names', 'kollu rasam, horse gram rasam')
    fireEvent.change(within(dialog()).getByLabelText('Type'), { target: { value: 'rasam' } })
    click('Lunch')
    click('Legume')

    click('+ Add ingredient')
    type('Ingredient', 'rice')
    fireEvent.click(await within(dialog()).findByRole('button', { name: /அரிசி/ }))
    expect((within(dialog()).getByLabelText('Amount for 5') as HTMLInputElement).value).toBe('1')
    type('Amount for 5', '100')
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'g' }))
    click('Add 100 g')
    expect(within(dialog()).getByText('Veg')).toBeTruthy()

    click('+ Add side')
    click(/தேங்காய் சட்னி/)
    click('Add dish')

    expect(await screen.findByText('கொள்ளு ரசம் added')).toBeTruthy()
    expect(await screen.findByRole('dialog', { name: 'கொள்ளு ரசம்' })).toBeTruthy()
    await waitFor(() =>
      expect(household.server.dishes().find((d) => d.name_en === 'Kollu rasam')).toMatchObject({
        type: 'rasam',
        meals: ['lunch'],
        tags: ['legume'],
        aliases: ['kollu rasam', 'horse gram rasam'],
        ingredients: [{ item_id: 'hh-1:rice', quantity: 100 }],
        side_ids: [CHUTNEY],
        is_veg: true,
        created_by: 'user-1',
      }),
    )
  })

  test('says what to fix', async () => {
    renderApp({ path: '/dishes' })
    fireEvent.click(await screen.findByRole('button', { name: '+ Add dish' }))
    click('Add dish')
    expect(within(dialog()).getByRole('alert').textContent).toBe('Both names are needed.')
    type('Tamil name', 'அடை')
    type('English name', 'Adai')
    click('Add dish')
    expect(within(dialog()).getByRole('alert').textContent).toBe('Pick at least one meal.')
  })
})

describe('editing a dish', () => {
  test('rename, reorder sides, swap an ingredient for egg (non-veg), save, and undo', async () => {
    const household = await editPongal()
    type('English name', 'Pongal')
    click('Move தேங்காய் சட்னி up')
    click('Remove அரிசி')
    click('+ Add ingredient')
    type('Ingredient', 'egg')
    click(/முட்டை/)
    click('Add 1 piece')
    expect(within(dialog()).getByText('Non-veg')).toBeTruthy()
    click('Save')

    expect(await screen.findByText(`${PONGAL_TA} saved`)).toBeTruthy()
    await waitFor(() =>
      expect(household.server.dishes().find((d) => d.id === PONGAL)).toMatchObject({
        name_en: 'Pongal',
        side_ids: [CHUTNEY, SAMBAR],
        ingredients: [{ item_id: 'hh-1:egg', quantity: 1 }],
        is_veg: false,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(household.server.dishes().find((d) => d.id === PONGAL)).toMatchObject({
        name_en: 'Ven pongal',
        side_ids: [SAMBAR, CHUTNEY],
        is_veg: true,
      }),
    )
  })

  test('change an ingredient amount, and mark it optional', async () => {
    const household = await editPongal()
    click(/^அரிசி/)
    type('Amount for 5', '0.5')
    fireEvent.click(within(dialog()).getByLabelText('Optional (not needed to cook it)'))
    click('Set 500 g')
    click('Save')
    await waitFor(() =>
      expect(household.server.dishes().find((d) => d.id === PONGAL)?.ingredients).toEqual([{ item_id: 'hh-1:rice', quantity: 500, optional: true }]),
    )
  })

  test('cancel changes nothing', async () => {
    const household = await editPongal()
    type('English name', 'Something else')
    click('Cancel')
    expect(screen.getByRole('dialog', { name: PONGAL_TA })).toBeTruthy()
    expect(household.server.dishes().find((d) => d.id === PONGAL)?.name_en).toBe('Ven pongal')
  })
})

describe('deleting a dish', () => {
  test('asks first; then it is gone for everyone and out of other dishes’ sides', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/dishes', household })
    fireEvent.click(await screen.findByRole('button', { name: /கத்தரிக்காய் சாம்பார்/ }))
    click('Edit dish')
    click('Delete dish')
    expect(within(dialog()).getByText(/Delete கத்தரிக்காய் சாம்பார் for everyone\?/)).toBeTruthy()
    click('Cancel')
    click('Delete dish')
    click('Delete dish')

    expect(await screen.findByText('கத்தரிக்காய் சாம்பார் deleted')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(household.server.dishes().some((d) => d.id === SAMBAR)).toBe(false))
    expect(household.server.dishes().find((d) => d.id === PONGAL)?.side_ids).toEqual([CHUTNEY])
    expect(screen.getByText('3 dishes')).toBeTruthy()
  })
})
