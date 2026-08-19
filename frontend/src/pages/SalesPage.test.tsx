import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn(), downloadFile: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({pathname: '/verkaeufe', state: null}),
  useNavigate: () => vi.fn(),
}))

const toast = vi.fn()
vi.mock('../components/Toast', () => ({useToast: () => toast}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {SalesPage} from './SalesPage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
  toast.mockReset()
})

function alsMitarbeiter() {
  mockUseAuth.mockReturnValue({
    me: {
      id: 'u1',
      email: 'mira@example.com',
      full_name: 'Mira Musterfrau',
      role: 'EMPLOYEE',
      must_change_password: false,
      employee: {id: 'emp-1', display_name: 'Mira Musterfrau', position: 'Vertriebspartner', monthly_units_target: 30, weekly_revenue_target_cents: null},
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  } as never)
}

const KUNDE = {
  id: 'k1',
  employee_id: 'emp-1',
  first_name: 'Anna',
  last_name: 'Beispiel',
  full_name: 'Anna Beispiel',
  street: 'Musterweg',
  house_number: '1',
  postal_code: '24340',
  city: 'Eckernförde',
  phone: null,
  email: null,
  notes: null,
  address: 'Musterweg 1, 24340 Eckernförde',
}

const PRODUKTE = [
  {id: 'p1', name: 'VK7', category: 'Staubsauger', description: null, verified: true, price: {amount_cents: 250000, currency: 'EUR'}},
  {id: 'p2', name: 'SP7', category: 'Polsterdüse', description: null, verified: true, price: {amount_cents: 30000, currency: 'EUR'}},
  {id: 'p3', name: 'K70 Reiniger', category: 'K70', description: null, verified: true, price: {amount_cents: 1500, currency: 'EUR'}},
]

function verkauf(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    customer_id: 'k1',
    customer_name: 'Anna Beispiel',
    employee_id: 'emp-1',
    employee_name: 'Mira Musterfrau',
    appointment_id: null,
    sold_at: '2026-06-05T09:30:00Z',
    channel: 'field',
    notes: null,
    items: [
      {id: 'i1', product_id: 'p1', name: 'VK7', category: 'Staubsauger', is_k70: false, quantity: 1, unit_price_cents: 250000, total_cents: 250000},
      {id: 'i2', product_id: 'p3', name: 'K70 Reiniger', category: 'K70', is_k70: true, quantity: 4, unit_price_cents: 1500, total_cents: 6000},
    ],
    total_cents: 256000,
    k70_total_cents: 6000,
    product_total_cents: 250000,
    units: 1,
    cancelled: false,
    cancelled_at: null,
    cancellation_reason: null,
    counts_total_cents: 256000,
    counts_units: 1,
    counts_k70_cents: 6000,
    ...overrides,
  }
}

function antworteMit(sales: unknown[]) {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/sales') return sales as never
    if (path === '/customers') return [KUNDE] as never
    if (path.startsWith('/products')) return PRODUKTE as never
    if (path === '/team/employees') return [] as never
    throw new Error(`Unerwarteter Aufruf: ${path}`)
  })
}

describe('Verkaufsliste – Spalten', () => {
  it('zeigt Kunde, Datum, Uhrzeit, Produkt, Einheiten, Umsatz und Umsatz K70', async () => {
    alsMitarbeiter()
    antworteMit([verkauf()])
    render(<SalesPage />)

    await waitFor(() => expect(screen.getByRole('columnheader', {name: 'Kunde'})).toBeTruthy())
    for (const spalte of ['Kunde', 'Datum', 'Uhrzeit', 'Produkt', 'Einheiten', 'Umsatz', 'Umsatz K70']) {
      expect(screen.getByRole('columnheader', {name: spalte})).toBeTruthy()
    }
  })

  it('zeigt Umsatz und K70-Umsatz getrennt', async () => {
    alsMitarbeiter()
    antworteMit([verkauf()])
    render(<SalesPage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    const zeile = screen.getByText('Anna Beispiel').closest('tr')!
    expect(within(zeile).getByText('2.560,00 €')).toBeTruthy()
    expect(within(zeile).getByText('60,00 €')).toBeTruthy()
  })

  it('zeigt die verkauften Produkte mit ihrer Menge', async () => {
    alsMitarbeiter()
    antworteMit([verkauf()])
    render(<SalesPage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    expect(screen.getByText('VK7, 4× K70 Reiniger')).toBeTruthy()
  })

  it('zeigt Datum und Uhrzeit in getrennten Spalten', async () => {
    alsMitarbeiter()
    antworteMit([verkauf()])
    render(<SalesPage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    const zeile = screen.getByText('Anna Beispiel').closest('tr')!
    expect(within(zeile).getByText('05.06.2026')).toBeTruthy()
    expect(within(zeile).getByText('11:30')).toBeTruthy()
  })
})

describe('Verkauf erfassen – Produkte ankreuzen', () => {
  async function maskeOeffnen() {
    alsMitarbeiter()
    antworteMit([])
    render(<SalesPage />)
    await waitFor(() => expect(screen.getByText(/Keine Verkäufe/)).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: /Verkauf erfassen/}))
  }

  it('bietet jedes vorhandene Produkt als Ankreuzfeld an', async () => {
    await maskeOeffnen()
    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    expect(within(auswahl).getAllByRole('checkbox')).toHaveLength(PRODUKTE.length)
  })

  it('übernimmt beim Ankreuzen den hinterlegten Preis und rechnet den Umsatz', async () => {
    await maskeOeffnen()
    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    await userEvent.click(within(auswahl).getAllByRole('checkbox')[0])

    expect(screen.getByDisplayValue('2500.00')).toBeTruthy()
    expect(screen.getByText('1 Produkt gewählt')).toBeTruthy()
    // Menge 1 × 2.500,00 €
    expect(screen.getAllByText('2.500,00 €').length).toBeGreaterThan(0)
  })

  it('rechnet den Umsatz aus Menge × Verkaufspreis', async () => {
    await maskeOeffnen()
    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    await userEvent.click(within(auswahl).getAllByRole('checkbox')[1])

    fireEvent.change(screen.getByLabelText(/Menge/), {target: {value: '3'}})

    // 3 × 300,00 € = 900,00 €
    await waitFor(() => expect(screen.getAllByText('900,00 €').length).toBeGreaterThan(0))
  })

  it('weist den K70-Anteil eines Verkaufs gesondert aus', async () => {
    await maskeOeffnen()
    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    await userEvent.click(within(auswahl).getAllByRole('checkbox')[2])

    await waitFor(() => expect(screen.getByText('davon Umsatz K70')).toBeTruthy())
  })

  it('nimmt ein Produkt beim erneuten Klicken wieder aus dem Verkauf', async () => {
    await maskeOeffnen()
    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    const kasten = within(auswahl).getAllByRole('checkbox')[0]

    await userEvent.click(kasten)
    expect(screen.getByText('1 Produkt gewählt')).toBeTruthy()

    await userEvent.click(kasten)
    expect(screen.getByText('0 Produkte gewählt')).toBeTruthy()
    expect(screen.getByText('Noch kein Produkt angekreuzt.')).toBeTruthy()
  })

  it('filtert die Auswahlliste über die Produktsuche', async () => {
    await maskeOeffnen()
    await userEvent.type(screen.getByLabelText('Produkte durchsuchen'), 'SP7')

    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    expect(within(auswahl).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(auswahl).getByText('SP7')).toBeTruthy()
  })

  it('speichert Kunde, Zeitpunkt, Produkte, Menge und Preis', async () => {
    await maskeOeffnen()

    await userEvent.type(screen.getByPlaceholderText('Kunde suchen ...'), 'Anna')
    await userEvent.click(await screen.findByRole('button', {name: /Anna Beispiel/}))

    const auswahl = screen.getByRole('group', {name: 'Produkte auswählen'})
    await userEvent.click(within(auswahl).getAllByRole('checkbox')[0])
    await userEvent.click(screen.getByRole('button', {name: 'Verkauf speichern'}))

    await waitFor(() => {
      const aufruf = mockApi.mock.calls.find(call => call[0] === '/sales' && call[1]?.method === 'POST')
      expect(aufruf).toBeTruthy()
      const body = JSON.parse(String(aufruf![1]!.body))
      expect(body.customer_id).toBe('k1')
      expect(body.sold_at).toBeTruthy()
      expect(body.items).toEqual([{product_id: 'p1', quantity: 1, unit_price_cents: 250000}])
    })
  })

  it('speichert nicht ohne angekreuztes Produkt', async () => {
    await maskeOeffnen()

    await userEvent.type(screen.getByPlaceholderText('Kunde suchen ...'), 'Anna')
    await userEvent.click(await screen.findByRole('button', {name: /Anna Beispiel/}))
    await userEvent.click(screen.getByRole('button', {name: 'Verkauf speichern'}))

    expect(toast).toHaveBeenCalledWith('Bitte mindestens ein Produkt ankreuzen.')
    expect(mockApi.mock.calls.find(call => call[1]?.method === 'POST')).toBeUndefined()
  })
})
