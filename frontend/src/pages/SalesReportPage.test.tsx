import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import SalesReportPage from './SalesReportPage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function alsRolle(role: 'EMPLOYEE' | 'TEAM_LEADER' | 'REGIONAL_LEAD' | 'SYSTEM_ADMIN') {
  mockUseAuth.mockReturnValue({
    me: {
      id: 'me-1',
      email: 'me@example.com',
      full_name: 'Mira Musterfrau',
      role,
      must_change_password: false,
      employee: {id: 'emp-me', display_name: 'Mira Musterfrau', position: 'Vertriebspartner', monthly_units_target: 30, weekly_revenue_target_cents: null},
    } as any,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

function verkauf(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    customer_id: 'k1',
    customer_name: 'Familie Nachname',
    employee_id: 'emp-me',
    appointment_id: null,
    sold_at: '2026-06-05T09:00:00Z',
    channel: 'field',
    notes: null,
    items: [
      {id: 'i1', product_id: 'p1', name: 'VK7', quantity: 1, unit_price_cents: 250000, total_cents: 250000},
    ],
    total_cents: 250000,
    units: 1,
    cancelled: false,
    cancelled_at: null,
    cancellation_reason: null,
    counts_total_cents: 250000,
    counts_units: 1,
    ...overrides,
  }
}

function antworteMitVerkaeufen(sales: unknown[], employees: unknown[] = []) {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/sales') return sales as never
    if (path === '/team/employees') return employees as never
    throw new Error(`Unerwarteter Aufruf: ${path}`)
  })
}

describe('Verkaufstabelle – echte Daten statt Dummy-Werten', () => {
  it('zeigt keine fest eingebauten Namen wie Max Mustermann oder Firma Beispiel', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([verkauf()])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    expect(screen.queryByText('Max Mustermann')).toBeNull()
    expect(screen.queryByText('Firma Beispiel')).toBeNull()
    expect(screen.queryByText('Produkt A')).toBeNull()
    expect(screen.queryByText('Produkt B')).toBeNull()
  })

  it('zeigt mehrere Verkäufe als mehrere Zeilen', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([
      verkauf({id: 's1', customer_name: 'Kunde Eins'}),
      verkauf({id: 's2', customer_name: 'Kunde Zwei', items: [{id: 'i2', product_id: 'p2', name: 'SP7', quantity: 2, unit_price_cents: 100000, total_cents: 200000}]}),
    ])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Kunde Eins')).toBeTruthy())
    expect(screen.getByText('Kunde Zwei')).toBeTruthy()
    expect(screen.getByRole('cell', {name: '2'})).toBeTruthy()
  })

  it('zeigt jede Verkaufsposition eines Verkaufs mit mehreren Produkten einzeln', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([verkauf({
      items: [
        {id: 'i1', product_id: 'p1', name: 'VK7', quantity: 1, unit_price_cents: 250000, total_cents: 250000},
        {id: 'i2', product_id: 'p2', name: 'SP7', quantity: 3, unit_price_cents: 50000, total_cents: 150000},
      ],
    })])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('VK7')).toBeTruthy())
    expect(screen.getByText('SP7')).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(3) // Kopfzeile + 2 Positionen
  })

  it('zeigt bei keinen Verkäufen einen echten Leerzustand, keine Dummy-Zeilen', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Noch keine Verkäufe erfasst.')).toBeTruthy())
    expect(screen.queryByText('Max Mustermann')).toBeNull()
    const pdfButton = screen.getByRole('button', {name: /PDF exportieren/})
    expect(pdfButton.hasAttribute('disabled')).toBe(true)
  })

  it('markiert einen stornierten Verkauf eindeutig', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([verkauf({cancelled: true, cancellation_reason: 'Kunde zurückgetreten'})])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Storniert')).toBeTruthy())
    expect(screen.queryByText('Aktiv')).toBeNull()
  })
})

describe('Verkaufstabelle – Rollen-Scope', () => {
  it('zeigt einem Mitarbeiter keine Mitarbeiterspalte und keinen Mitarbeiterfilter', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([verkauf()])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    expect(screen.queryByText('Mitarbeiter')).toBeNull()
    expect(mockApi).not.toHaveBeenCalledWith('/team/employees')
  })

  it.each(['TEAM_LEADER', 'REGIONAL_LEAD', 'SYSTEM_ADMIN'] as const)(
    'zeigt %s die Mitarbeiterspalte und den Mitarbeiterfilter',
    async role => {
      alsRolle(role)
      antworteMitVerkaeufen(
        [verkauf({employee_id: 'emp-anna'})],
        [{id: 'emp-anna', display_name: 'Anna Mitarbeiterin'}],
      )
      render(<SalesReportPage />)

      await waitFor(() => expect(screen.getAllByText('Anna Mitarbeiterin').length).toBeGreaterThan(0))
      expect(screen.getByRole('columnheader', {name: 'Mitarbeiter'})).toBeTruthy()
    },
  )
})

describe('Verkaufstabelle – Filter', () => {
  it('filtert die Positionen über die Suche', async () => {
    alsRolle('EMPLOYEE')
    antworteMitVerkaeufen([
      verkauf({id: 's1', customer_name: 'Kunde Eins', items: [{id: 'i1', product_id: 'p1', name: 'VK7', quantity: 1, unit_price_cents: 250000, total_cents: 250000}]}),
      verkauf({id: 's2', customer_name: 'Kunde Zwei', items: [{id: 'i2', product_id: 'p1', name: 'VK7', quantity: 1, unit_price_cents: 250000, total_cents: 250000}]}),
    ])
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Kunde Eins')).toBeTruthy())
    const suche = screen.getByPlaceholderText(/Suchen/)
    await userEvent.type(suche, 'Eins')

    expect(screen.getByText('Kunde Eins')).toBeTruthy()
    expect(screen.queryByText('Kunde Zwei')).toBeNull()
  })
})
