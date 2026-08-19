import {cleanup, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn(), downloadFile: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {OffersPage} from './OffersPage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function alsMitarbeiter() {
  mockUseAuth.mockReturnValue({
    me: {id: 'u1', email: 'a@b.de', full_name: 'A B', role: 'EMPLOYEE', must_change_password: false, employee: null} as any,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

const KUNDE = {id: 'k1', full_name: 'Familie Nachname', first_name: 'Fam', last_name: 'Nachname', address: 'Weg 1', phone: null, email: null}
const PRODUKT = {id: 'p1', name: 'Kobold VK7', category: 'Staubsauger', price: {amount_cents: 94900}}

/** Antwortet je nach abgerufenem Pfad – die Seite lädt drei Listen parallel. */
function ladenErfolgreich() {
  mockApi.mockImplementation((pfad: string) => {
    if (pfad.startsWith('/offers')) return Promise.resolve([]) as never
    if (pfad.startsWith('/customers')) return Promise.resolve([KUNDE]) as never
    if (pfad.startsWith('/products')) return Promise.resolve([PRODUKT]) as never
    return Promise.resolve([]) as never
  })
}

function zeige() {
  return render(
    <MemoryRouter initialEntries={['/angebote']}>
      <OffersPage />
    </MemoryRouter>,
  )
}

/* Ein fehlgeschlagener Abruf ging vorher nur in die Entwicklerkonsole. Auf
   dem Bildschirm blieb die Liste leer - nicht zu unterscheiden von "es gibt
   noch keine Angebote". */
describe('Angebote – Ladefehler statt leerer Liste', () => {
  it('zeigt eine Fehlermeldung, wenn die Angebote nicht geladen werden können', async () => {
    alsMitarbeiter()
    mockApi.mockRejectedValue(new Error('Die Angebote sind gerade nicht erreichbar.'))
    zeige()

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toContain('Die Angebote sind gerade nicht erreichbar.')
    expect(meldung.textContent).toContain('Daten konnten nicht geladen werden.')
  })

  it('bietet einen zweiten Versuch an, der die Meldung wieder entfernt', async () => {
    alsMitarbeiter()
    mockApi.mockRejectedValue(new Error('Serverfehler'))
    zeige()

    await screen.findByRole('alert')

    ladenErfolgreich()
    await userEvent.click(screen.getByRole('button', {name: 'Erneut versuchen'}))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('zeigt keine Fehlermeldung, wenn schlicht keine Angebote vorliegen', async () => {
    alsMitarbeiter()
    ladenErfolgreich()
    zeige()

    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/* Preis und Menge werden im Formular in die Werte umgerechnet, die das
   Backend erwartet. Aus einer Fehleingabe entstand dabei still ein NaN, das
   JSON.stringify zu `null` machte - der Server lehnte dann ein Feld ab, das
   im Formular gar nicht vorkommt. */
describe('Angebote – Positionen vor dem Absenden prüfen', () => {
  async function formularOeffnen() {
    alsMitarbeiter()
    ladenErfolgreich()
    zeige()
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', {name: /Angebot erstellen/}))
    return within(await screen.findByRole('dialog'))
  }

  async function kundeWaehlen(dialog: ReturnType<typeof within>) {
    const suche = dialog.getByPlaceholderText(/Kunde suchen/i)
    await userEvent.type(suche, 'Nachname')
    await userEvent.click(await dialog.findByText('Familie Nachname'))
  }

  it('sendet keine Anfrage, wenn kein Produkt gewählt wurde', async () => {
    const dialog = await formularOeffnen()
    await kundeWaehlen(dialog)

    mockApi.mockClear()
    await userEvent.click(dialog.getByRole('button', {name: /Angebot speichern/}))

    expect(mockApi.mock.calls.filter(([pfad]) => pfad === '/offers')).toHaveLength(0)
  })
})
