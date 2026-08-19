import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

const navigate = vi.fn()

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

vi.mock('react-router-dom', () => ({useNavigate: () => navigate}))

vi.mock('../components/Toast', () => ({useToast: () => vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {BuntewochePage, blockLayout} from './BuntewochePage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

const RASTER = {start_minutes: 6 * 60, end_minutes: 22 * 60, step_minutes: 15}

afterEach(() => {
  cleanup()
  mockApi.mockReset()
  navigate.mockReset()
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
    } as never,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  } as never)
}

function termin(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    day_index: 0,
    hour: 6,
    start_at: '2026-06-01T04:00:00Z',
    end_at: '2026-06-01T08:00:00Z',
    label: 'Anna Beispiel',
    customer_id: 'k1',
    customer_name: 'Anna Beispiel',
    start_minutes: 6 * 60,
    end_minutes: 10 * 60,
    duration_minutes: 240,
    time_label: '06:00 - 10:00',
    appointment_type: 'customer',
    status: 'planned',
    ...overrides,
  }
}

function woche(appointments: unknown[]) {
  const days = Array.from({length: 7}, (_, i) => ({
    date: `2026-06-0${i + 1}`,
    area_target_cents: null,
    area_actual_cents: 0,
    total_target_cents: null,
    total_actual_cents: 0,
    k70_cents: 0,
    units: 0,
  }))
  return {
    employee: {id: 'emp-1', name: 'Mira Musterfrau'},
    week_start: '2026-06-01',
    week_end: '2026-06-07',
    calendar_week: 23,
    appointments,
    days,
    week_revenue_cents: 0,
    week_units: 0,
    monthly_units_target: 30,
    slots: [],
    grid: RASTER,
    legend: {},
  }
}

function antworteMit(appointments: unknown[]) {
  mockApi.mockImplementation(async (path: string) => {
    if (path.startsWith('/buntewoche')) return woche(appointments) as never
    throw new Error(`Unerwarteter Aufruf: ${path}`)
  })
}

describe('Buntewoche – Terminblöcke', () => {
  it('zeigt Kundenname, Uhrzeit und Zeitraum eines belegten Termins', async () => {
    alsMitarbeiter()
    antworteMit([termin()])
    render(<BuntewochePage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    expect(screen.getByText('06:00 - 10:00')).toBeTruthy()
    const block = screen.getByRole('button', {name: /Anna Beispiel/})
    expect(block.textContent).toContain('06:00')
  })

  it('zieht einen mehrstündigen Termin über den kompletten Zeitraum', async () => {
    alsMitarbeiter()
    antworteMit([termin()])
    render(<BuntewochePage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    // 06:00–10:00 sind vier Stunden, im 15-Minuten-Raster also 16 Zeilen.
    const zelle = screen.getByRole('button', {name: /Anna Beispiel/}).closest('td')
    expect(zelle?.getAttribute('rowspan')).toBe('16')
  })

  it('öffnet beim Klick auf den Terminblock die vorhandene Terminansicht', async () => {
    alsMitarbeiter()
    antworteMit([termin()])
    render(<BuntewochePage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: /Anna Beispiel/}))

    expect(navigate).toHaveBeenCalledWith('/termine', {state: {openAppointmentId: 't1'}})
  })

  it('färbt ausschließlich belegte Zellen ein – freie Zeit bleibt ohne Terminblock', async () => {
    alsMitarbeiter()
    antworteMit([termin()])
    const {container} = render(<BuntewochePage />)

    await waitFor(() => expect(screen.getByText('Anna Beispiel')).toBeTruthy())
    expect(container.querySelectorAll('.bunte-appt')).toHaveLength(1)
    expect(container.querySelectorAll('.bunte-free').length).toBeGreaterThan(0)
  })

  it('zeigt bei einem Termin ohne Kunde die Bezeichnung des Termins', async () => {
    alsMitarbeiter()
    antworteMit([termin({customer_id: null, customer_name: null, label: 'Telefonie'})])
    render(<BuntewochePage />)

    await waitFor(() => expect(screen.getByText('Telefonie')).toBeTruthy())
  })
})

describe('Buntewoche – Rasterberechnung', () => {
  it('belegt für eine Viertelstunde genau eine Zeile', () => {
    const {blocks} = blockLayout(
      [termin({start_minutes: 9 * 60, end_minutes: 9 * 60 + 15, duration_minutes: 15}) as never],
      RASTER,
    )
    expect(blocks[0].span).toBe(1)
    expect(blocks[0].row).toBe((9 * 60 - 6 * 60) / 15)
  })

  it('belegt für eine halbe Stunde zwei Zeilen', () => {
    const {blocks} = blockLayout(
      [termin({start_minutes: 9 * 60, end_minutes: 9 * 60 + 30, duration_minutes: 30}) as never],
      RASTER,
    )
    expect(blocks[0].span).toBe(2)
  })

  it('belegt für eine volle Stunde vier Zeilen', () => {
    const {blocks} = blockLayout(
      [termin({start_minutes: 9 * 60, end_minutes: 10 * 60, duration_minutes: 60}) as never],
      RASTER,
    )
    expect(blocks[0].span).toBe(4)
  })

  it('belegt für mehrere Stunden entsprechend viele Zeilen', () => {
    const {blocks} = blockLayout(
      [termin({start_minutes: 6 * 60, end_minutes: 10 * 60, duration_minutes: 240}) as never],
      RASTER,
    )
    expect(blocks[0].span).toBe(16)
  })

  it('zeigt zwei überschneidende Termine beide an, ohne Zeilen doppelt zu belegen', () => {
    const {blocks} = blockLayout(
      [
        termin({id: 'a', start_minutes: 9 * 60, end_minutes: 11 * 60, duration_minutes: 120}) as never,
        termin({id: 'b', start_minutes: 10 * 60, end_minutes: 12 * 60, duration_minutes: 120}) as never,
      ],
      RASTER,
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[0].row + blocks[0].span).toBeLessThanOrEqual(blocks[1].row)
  })
})
