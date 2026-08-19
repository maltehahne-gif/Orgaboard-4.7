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
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  } as never)
}

const SPALTEN = {
  contact_ways: [
    {key: 'promotion', label: 'Promotion'},
    {key: 'recommendation', label: 'Empfehlung'},
    {key: 'premium', label: 'Premium Check-in'},
    {key: 'kd_daten', label: 'KD-Daten'},
    {key: 'adm', label: 'ADM'},
  ],
  profi: [
    {key: 'job_ticket', label: 'Job-Ticket'},
    {key: 'recommendation', label: 'Empfehlung'},
    {key: 'premium', label: 'Premium Check-in'},
  ],
  products: [
    {key: 'roboter', label: 'Roboter'},
    {key: 'kobold', label: 'Kobold'},
    {key: 'tiger', label: 'Tiger'},
    {key: 'elektrobuerste', label: 'Elektrobürste'},
    {key: 'saugwischer', label: 'Saugwischer'},
    {key: 'polsterbuerste', label: 'Polsterbürste'},
    {key: 'service', label: 'Service'},
    {key: 'demotuecher', label: 'Demotücher'},
  ],
}

function leereProdukte(overrides: Record<string, {sold:number; presented:boolean}> = {}) {
  const out: Record<string, {sold:number; presented:boolean}> = {}
  for (const spalte of SPALTEN.products) out[spalte.key] = {sold: 0, presented: false}
  return {...out, ...overrides}
}

function zeile(overrides: Record<string, unknown> = {}) {
  return {
    sale_id: 's1',
    time: '10:30',
    customer_name: 'Familie Nachname',
    customer_address: 'Musterweg 1, 24340 Eckernförde',
    contact_way: 'kd_daten',
    is_customer: true,
    is_target_customer: false,
    area: 'field',
    profi: null,
    trade_in: false,
    products: leereProdukte({kobold: {sold: 1, presented: false}}),
    units: 1,
    product_revenue_cents: 250000,
    k70_revenue_cents: 6000,
    cancelled: false,
    ...overrides,
  }
}

function blatt(zeilenJeTag: Record<number, unknown[]> = {}, totals?: Record<string, unknown>) {
  const wochentage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
  const leereSumme = {units: 0, product_revenue_cents: 0, k70_revenue_cents: 0, products: {}}
  return {
    employee: {id: 'emp-me', name: 'Mira Musterfrau'},
    week_start: '2026-06-01',
    week_end: '2026-06-07',
    calendar_week: 23,
    days: wochentage.map((weekday, index) => ({
      date: `2026-06-0${index + 1}`,
      weekday,
      rows: zeilenJeTag[index] || [],
      totals: leereSumme,
    })),
    totals: totals || {units: 0, product_revenue_cents: 0, k70_revenue_cents: 0, products: {}},
    columns: SPALTEN,
  }
}

function antworteMit(daten: unknown, employees: unknown[] = []) {
  mockApi.mockImplementation(async (path: string) => {
    if (path.startsWith('/sales/wochentabelle')) return daten as never
    if (path === '/team/employees') return employees as never
    throw new Error(`Unerwarteter Aufruf: ${path}`)
  })
}

describe('Verkaufstabelle – echte Daten statt Dummy-Werten', () => {
  it('zeigt keine fest eingebauten Namen wie Max Mustermann oder Firma Beispiel', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    expect(screen.queryByText('Max Mustermann')).toBeNull()
    expect(screen.queryByText('Firma Beispiel')).toBeNull()
    expect(screen.queryByText('Produkt A')).toBeNull()
    expect(screen.queryByText('Produkt B')).toBeNull()
  })

  it('zeigt mehrere Verkäufe als mehrere Zeilen', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({
      0: [zeile({sale_id: 's1', customer_name: 'Kunde Eins'})],
      2: [zeile({sale_id: 's2', customer_name: 'Kunde Zwei'})],
    }))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Kunde Eins')).toBeTruthy())
    expect(screen.getByText('Kunde Zwei')).toBeTruthy()
  })

  it('zeigt bei keinen Verkäufen einen echten Leerzustand, keine Dummy-Zeilen', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt())
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('In dieser Woche wurde noch kein Verkauf erfasst.')).toBeTruthy())
    expect(screen.queryByText('Max Mustermann')).toBeNull()
    const pdfButton = screen.getByRole('button', {name: /PDF exportieren/})
    expect(pdfButton.hasAttribute('disabled')).toBe(true)
  })
})

describe('Verkaufstabelle – Aufbau nach der Vorlage', () => {
  it('führt alle sieben Wochentage als eigenen Block', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    for (const tag of ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']) {
      expect(screen.getByRole('rowheader', {name: tag})).toBeTruthy()
    }
  })

  it('führt die Kopfzeilen der Vorlage', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    for (const kopf of ['Uhrzeit', 'Kunde, Anschrift', 'Kontaktweg', 'Gebiet', 'Profi', 'Vorgeführt = X / Verkauft = Anzahl', 'Einheiten und Umsätze']) {
      expect(screen.getByRole('columnheader', {name: kopf})).toBeTruthy()
    }
  })

  it('führt jede Produktspalte der Vorlage', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    for (const spalte of SPALTEN.products) {
      expect(screen.getByRole('columnheader', {name: spalte.label})).toBeTruthy()
    }
  })

  it('kreuzt den Kontaktweg in der Farbspalte der Vorlage an', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile({contact_way: 'promotion'})]}))
    const {container} = render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    const reihe = screen.getByText('Familie Nachname').closest('tr')!
    expect(reihe.querySelector('td.sheet-contact-promotion')?.textContent).toBe('X')
    expect(reihe.querySelector('td.sheet-contact-ko')?.textContent).toBe('')
    // Die Farben stehen ausschließlich in den Klassen der Vorlage.
    expect(container.querySelector('td[style]')).toBeNull()
  })

  it('zeigt verkaufte Stückzahl als Anzahl und Vorgeführtes als X', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({
      0: [zeile({products: leereProdukte({
        kobold: {sold: 2, presented: false},
        saugwischer: {sold: 0, presented: true},
      })})],
    }))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    const reihe = screen.getByText('Familie Nachname').closest('tr')!
    const zellen = within(reihe).getAllByText((_, element) => element?.classList.contains('sales-sheet-product-cell') === true)
    expect(zellen.map(z => z.textContent)).toEqual(['', '2', '', '', 'X', '', '', ''])
  })

  it('zeigt einen Summenbereich mit Einheiten, Produktumsatz und K70-Umsatz', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt(
      {0: [zeile()]},
      {units: 3, product_revenue_cents: 500000, k70_revenue_cents: 12000, products: {kobold: 2}},
    ))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    const summe = screen.getByRole('rowheader', {name: 'Summe'}).closest('tr')!
    expect(within(summe).getByText('3')).toBeTruthy()
    expect(within(summe).getByText('5.000,00 €')).toBeTruthy()
    expect(within(summe).getByText('120,00 €')).toBeTruthy()
  })
})

describe('Verkaufstabelle – Rollen-Scope', () => {
  it('zeigt einem Mitarbeiter keinen Mitarbeiterfilter', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    expect(screen.queryByLabelText('Mitarbeiter')).toBeNull()
    expect(mockApi).not.toHaveBeenCalledWith('/team/employees')
  })

  it.each(['TEAM_LEADER', 'REGIONAL_LEAD', 'SYSTEM_ADMIN'] as const)(
    'zeigt %s den Mitarbeiterfilter',
    async role => {
      alsRolle(role)
      antworteMit(blatt({0: [zeile()]}), [{id: 'emp-anna', display_name: 'Anna Mitarbeiterin'}])
      render(<SalesReportPage />)

      await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
      expect(screen.getByLabelText('Mitarbeiter')).toBeTruthy()
      expect(await screen.findByRole('option', {name: 'Anna Mitarbeiterin'})).toBeTruthy()
    },
  )
})

describe('Verkaufstabelle – Wochenwechsel', () => {
  it('lädt beim Blättern die Woche davor', async () => {
    alsRolle('EMPLOYEE')
    antworteMit(blatt({0: [zeile()]}))
    render(<SalesReportPage />)

    await waitFor(() => expect(screen.getByText('Familie Nachname')).toBeTruthy())
    const ersteWoche = mockApi.mock.calls.filter(c => String(c[0]).startsWith('/sales/wochentabelle')).length

    await userEvent.click(screen.getByRole('button', {name: 'Vorherige Woche'}))

    await waitFor(() => {
      const jetzt = mockApi.mock.calls.filter(c => String(c[0]).startsWith('/sales/wochentabelle')).length
      expect(jetzt).toBeGreaterThan(ersteWoche)
    })
  })
})
