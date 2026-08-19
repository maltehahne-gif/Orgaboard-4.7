import {cleanup, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {ProductsPage} from './ProductsPage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function alsRolle(role: 'EMPLOYEE' | 'TEAM_LEADER' | 'REGIONAL_LEAD' | 'SYSTEM_ADMIN') {
  mockUseAuth.mockReturnValue({
    me: {id: 'u1', email: 'a@b.de', full_name: 'A B', role, must_change_password: false, employee: null} as any,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

/**
 * B: der Backend-Endpunkt /products/import verlangt Teamleiter-Rechte
 * (require_team_leader). "Neues Produkt" durfte deshalb nicht für jede
 * angemeldete Rolle angeboten werden - sonst öffnet ein einfacher
 * Mitarbeiter ein Formular, dessen Absenden das Backend ohnehin ablehnt.
 */
describe('Produktberechtigungen im Frontend', () => {
  it('bietet einem einfachen Mitarbeiter kein "Neues Produkt" an', async () => {
    alsRolle('EMPLOYEE')
    mockApi.mockResolvedValue([])
    render(<ProductsPage />)

    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(screen.queryByRole('button', {name: /Neues Produkt/})).toBeNull()
  })

  it.each(['TEAM_LEADER', 'REGIONAL_LEAD', 'SYSTEM_ADMIN'] as const)(
    'bietet %s "Neues Produkt" an',
    async role => {
      alsRolle(role)
      mockApi.mockResolvedValue([])
      render(<ProductsPage />)

      await waitFor(() => expect(mockApi).toHaveBeenCalled())
      expect(screen.getByRole('button', {name: /Neues Produkt/})).toBeTruthy()
    },
  )

  it('bietet einem einfachen Mitarbeiter weder Preisverwaltung noch Archiv an', async () => {
    alsRolle('EMPLOYEE')
    mockApi.mockResolvedValue([])
    render(<ProductsPage />)

    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(screen.queryByRole('button', {name: /Preise/})).toBeNull()
    expect(screen.queryByRole('button', {name: /Archiv/})).toBeNull()
  })
})

/**
 * Der Dialog "Neues Produkt" brach in der Produktion mit einem 422 ab, weil
 * source_url nur beim Preis mitging, nicht beim Produkt selbst - im Dialog
 * stand dann "[object Object]". Diese Tests nageln den Vertrag zum Backend
 * fest (backend/app/routers/products.py: ProductImport.source_url ist
 * Pflicht) und prüfen, dass eine Fehlermeldung beim Benutzer ankommt.
 */
describe('Neues Produkt speichern', () => {
  // Innerhalb des Dialogs suchen, nicht auf der ganzen Seite: "Kategorie"
  // gibt es auch als Filter über der Produktliste.
  async function dialogOeffnen() {
    alsRolle('TEAM_LEADER')
    mockApi.mockResolvedValue([])
    render(<ProductsPage />)
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', {name: /Neues Produkt/}))
    return within(screen.getByRole('dialog'))
  }

  async function formularAusfuellen(dialog: ReturnType<typeof within>) {
    await userEvent.type(dialog.getByLabelText(/Produktname/), 'Kobold VK7')
    await userEvent.type(dialog.getByLabelText(/Kategorie/), 'Akku-Staubsauger')
    await userEvent.type(dialog.getByLabelText(/Beschreibung/), 'Kabellos mit Wechselakku.')
    await userEvent.type(dialog.getByLabelText(/Preis in EUR/), '949,00')
  }

  it('schickt source_url auch auf Produktebene, nicht nur beim Preis', async () => {
    const dialog = await dialogOeffnen()
    await formularAusfuellen(dialog)

    mockApi.mockClear()
    mockApi.mockResolvedValue({} as never)
    await userEvent.click(dialog.getByRole('button', {name: 'Produkt speichern'}))

    await waitFor(() => {
      const aufruf = mockApi.mock.calls.find(([pfad]) => pfad === '/products/import')
      expect(aufruf).toBeTruthy()
    })

    const aufruf = mockApi.mock.calls.find(([pfad]) => pfad === '/products/import')!
    const rumpf = JSON.parse((aufruf[1] as RequestInit).body as string)
    expect(rumpf.source_url).toBe('manual-entry')
    expect(rumpf.price.source_url).toBe('manual-entry')
    expect(rumpf.source_kind).toBe('manual_verified')
    expect(rumpf.verified).toBe(true)
    expect(rumpf.price.amount_cents).toBe(94900)
  })

  it('zeigt einen Serverfehler im Dialog an, statt ihn zu verschlucken', async () => {
    const dialog = await dialogOeffnen()
    await formularAusfuellen(dialog)

    mockApi.mockClear()
    mockApi.mockRejectedValue(new Error('source_url: Field required'))
    await userEvent.click(dialog.getByRole('button', {name: 'Produkt speichern'}))

    expect(await screen.findByText('source_url: Field required')).toBeTruthy()
    expect(dialog.getByRole('button', {name: 'Produkt speichern'})).toBeTruthy()
  })

  it('verlangt Pflichtfelder, bevor überhaupt eine Anfrage rausgeht', async () => {
    const dialog = await dialogOeffnen()
    await userEvent.type(dialog.getByLabelText(/Produktname/), 'Nur ein Name')

    mockApi.mockClear()
    await userEvent.click(dialog.getByRole('button', {name: 'Produkt speichern'}))

    expect(mockApi.mock.calls.filter(([pfad]) => pfad === '/products/import')).toHaveLength(0)
  })

  it('löst bei einem Doppelklick keine zweite Anfrage aus', async () => {
    const dialog = await dialogOeffnen()
    await formularAusfuellen(dialog)

    mockApi.mockClear()
    let aufloesen: (wert: unknown) => void = () => {}
    mockApi.mockImplementation(() => new Promise(res => {aufloesen = res}) as never)

    const speichern = dialog.getByRole('button', {name: 'Produkt speichern'})
    await userEvent.click(speichern)
    await userEvent.click(speichern)

    expect(mockApi.mock.calls.filter(([pfad]) => pfad === '/products/import')).toHaveLength(1)
    aufloesen({})
  })
})
