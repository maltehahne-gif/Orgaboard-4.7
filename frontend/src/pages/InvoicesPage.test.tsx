import {cleanup, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn(), downloadFile: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

const toast = vi.fn()
vi.mock('../components/Toast', () => ({useToast: () => toast}))

import {api, downloadFile} from '../lib/api'
import {useAuth} from '../lib/auth'
import {InvoicesPage} from './InvoicesPage'

const mockApi = vi.mocked(api)
const mockDownload = vi.mocked(downloadFile)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
  mockDownload.mockReset()
  toast.mockReset()
})

function alsRolle(role: 'EMPLOYEE' | 'TEAM_LEADER') {
  mockUseAuth.mockReturnValue({
    me: {
      id: 'u1',
      email: 'mira@example.com',
      full_name: 'Mira Musterfrau',
      role,
      must_change_password: false,
      employee: {id: 'emp-1', display_name: 'Mira Musterfrau', position: 'Vertriebspartner', monthly_units_target: 30, weekly_revenue_target_cents: null},
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  } as never)
}

function rechnung(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    number: 'RE-2026-0001',
    sale_id: 's1',
    customer_id: 'k1',
    employee_id: 'emp-1',
    issued_on: '2026-06-05',
    service_on: '2026-06-05',
    issuer: {name: 'Björn Hahne', street: 'Schiffbrücke 5', postal_code: '24340', city: 'Eckernförde', phone: '0176/20204188'},
    customer: {name: 'Anna Beispiel', contact: null, street: 'Musterweg 1', postal_code: '24340', city: 'Eckernförde', phone: '0170/1234567', email: 'anna@example.test'},
    payment_method: null,
    payment_method_label: null,
    notes: null,
    items: [
      {id: 'i1', position: 1, product_id: 'p1', name: 'Kobold VK7', quantity: 1, unit_price_cents: 119000, vat_percent: 19, total_cents: 119000},
    ],
    subtotal_cents: 100000,
    vat_cents: 19000,
    total_cents: 119000,
    created_at: '2026-06-05T09:00:00Z',
    ...overrides,
  }
}

function antworteMit(rechnungen: unknown[]) {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/invoices') return rechnungen as never
    throw new Error(`Unerwarteter Aufruf: ${path}`)
  })
}

describe('Rechnungen – Übersicht', () => {
  it('listet die Rechnungen mit Nummer, Datum, Kunde und Gesamtbetrag', async () => {
    alsRolle('EMPLOYEE')
    antworteMit([rechnung()])
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    const zeile = screen.getByText('RE-2026-0001').closest('tr')!
    expect(within(zeile).getByText('05.06.2026')).toBeTruthy()
    expect(within(zeile).getByText('Anna Beispiel')).toBeTruthy()
    expect(within(zeile).getByText('1.190,00 €')).toBeTruthy()
  })

  it('zeigt einen Leerzustand, solange keine Rechnung vorliegt', async () => {
    alsRolle('EMPLOYEE')
    antworteMit([])
    render(<InvoicesPage />)

    await waitFor(() => expect(
      screen.getByText('Noch keine Rechnung vorhanden. Sie entsteht mit dem ersten Verkauf.'),
    ).toBeTruthy())
  })

  it('zeigt einem Mitarbeiter keine Beraterspalte', async () => {
    alsRolle('EMPLOYEE')
    antworteMit([rechnung()])
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    expect(screen.queryByRole('columnheader', {name: 'Berater'})).toBeNull()
  })

  it('zeigt einer Führungsrolle, wer die Rechnung erstellt hat', async () => {
    alsRolle('TEAM_LEADER')
    antworteMit([rechnung()])
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    expect(screen.getByRole('columnheader', {name: 'Berater'})).toBeTruthy()
    const zeile = screen.getByText('RE-2026-0001').closest('tr')!
    expect(within(zeile).getByText('Björn Hahne')).toBeTruthy()
  })
})

describe('Rechnungen – Öffnen und PDF', () => {
  it('öffnet die Rechnung mit Berater, Kunde, Positionen und Beträgen', async () => {
    alsRolle('EMPLOYEE')
    antworteMit([rechnung()])
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: /Öffnen/}))

    expect(screen.getByText('Rechnung RE-2026-0001')).toBeTruthy()
    expect(screen.getAllByText('Björn Hahne').length).toBeGreaterThan(0)
    expect(screen.getByText('Schiffbrücke 5')).toBeTruthy()
    expect(screen.getByText('Mobil: 0176/20204188')).toBeTruthy()
    expect(screen.getByText('Kobold VK7')).toBeTruthy()
    expect(screen.getByText('19 %')).toBeTruthy()
    expect(screen.getByText('1.000,00 €')).toBeTruthy()
    expect(screen.getByText('190,00 €')).toBeTruthy()
  })

  it('lädt die Rechnung als PDF herunter', async () => {
    alsRolle('EMPLOYEE')
    antworteMit([rechnung()])
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: /PDF/}))

    expect(mockDownload).toHaveBeenCalledWith('/invoices/r1/pdf', 'RE-2026-0001.pdf')
  })

  it('trägt die Zahlungsart nach, ohne die Beträge anzufassen', async () => {
    alsRolle('EMPLOYEE')
    mockApi.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/invoices' && !options) return [rechnung()] as never
      if (path === '/invoices/r1' && options?.method === 'PATCH') {
        return rechnung({payment_method: 'card', payment_method_label: 'Kartenzahlung'}) as never
      }
      throw new Error(`Unerwarteter Aufruf: ${path}`)
    })
    render(<InvoicesPage />)

    await waitFor(() => expect(screen.getByText('RE-2026-0001')).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: /Öffnen/}))
    await userEvent.selectOptions(screen.getByLabelText('Zahlungsart'), 'card')

    await waitFor(() => {
      const aufruf = mockApi.mock.calls.find(call => call[1]?.method === 'PATCH')
      expect(aufruf).toBeTruthy()
      expect(JSON.parse(String(aufruf![1]!.body))).toEqual({payment_method: 'card'})
    })
    await waitFor(() => expect(screen.getAllByText('Kartenzahlung').length).toBeGreaterThan(0))
  })
})
