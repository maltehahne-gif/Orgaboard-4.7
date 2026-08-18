import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {CrmPipelinePage} from './CrmPipelinePage'

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

function karte(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: 'k1', customer_name: 'Kunde Eins', customer_phone: null, customer_email: null, customer_city: null,
    employee_id: 'e1', employee_name: 'Anna',
    team_id: null, team_name: null, district_id: null, district_name: null, region_id: null, region_name: null,
    stage: 'contact', stage_label: 'Kontakt',
    last_contact_at: '2026-06-01T10:00:00Z',
    next_action: 'Nachfassen',
    next_appointment: null, next_follow_up: null, open_offer: null, last_sale: null,
    potential_revenue_cents: null,
    ...overrides,
  }
}

function zeige() {
  return render(
    <MemoryRouter>
      <CrmPipelinePage />
    </MemoryRouter>,
  )
}

describe('Pipeline – keine veralteten Ergebnisse bei schneller Sucheingabe', () => {
  it('überschreibt ein aktuelles Suchergebnis nicht mit einer spät eintreffenden alten Antwort', async () => {
    alsMitarbeiter()

    let loeseErsteAuf!: (value: unknown) => void
    const ersteAntwort = new Promise(resolve => { loeseErsteAuf = resolve })
    mockApi.mockImplementationOnce(() => ersteAntwort as Promise<any>)

    zeige()
    const suche = screen.getByPlaceholderText(/Kunde suchen/i)

    await userEvent.type(suche, 'Mu')
    // Entprellzeit (300ms) abwarten, damit der erste Abruf wirklich
    // abgeschickt wird, bevor weitergetippt wird.
    await new Promise(r => setTimeout(r, 350))
    expect(mockApi).toHaveBeenCalledTimes(1)

    mockApi.mockImplementationOnce(async () => ({
      customers: [karte({customer_id: 'k2', customer_name: 'Kunde Zwei'})],
      counts: {},
    }))
    await userEvent.type(suche, 's')
    await waitFor(() => expect(screen.getByText('Kunde Zwei')).toBeTruthy(), {timeout: 1000})

    // Die längst überholte erste Antwort ("Mu") trifft jetzt erst ein.
    loeseErsteAuf({customers: [karte({customer_id: 'k1', customer_name: 'Kunde Eins'})], counts: {}})
    await new Promise(r => setTimeout(r, 20))

    expect(screen.getByText('Kunde Zwei')).toBeTruthy()
    expect(screen.queryByText('Kunde Eins')).toBeNull()
  }, 10000)

  it('entprellt die Sucheingabe statt bei jedem Tastendruck abzufragen', async () => {
    alsMitarbeiter()
    mockApi.mockResolvedValue({customers: [], counts: {}})
    zeige()

    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1)) // initialer Ladevorgang

    const suche = screen.getByPlaceholderText(/Kunde suchen/i)
    await userEvent.type(suche, 'Anna')
    // Ohne Entprellung würde jeder der vier Tastendrücke einen eigenen
    // Abruf auslösen.
    await new Promise(r => setTimeout(r, 350))

    expect(mockApi).toHaveBeenCalledTimes(2)
  })
})
