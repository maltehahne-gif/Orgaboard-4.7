import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

// Muss vor dem Import der Komponente stehen - vi.mock wird hochgezogen.
vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

import {api} from '../lib/api'
import {RentalDevices} from './RentalDevices'

afterEach(cleanup)

const geraet = (rest: Record<string, unknown> = {}) => ({
  key: 'p1:VK7-1000',
  product_id: 'p1',
  product_name: 'Kobold VK7',
  serial_number: 'VK7-1000',
  loans: 3,
  days_out: 17,
  late_returns: 0,
  customers: 2,
  first_issued_at: '2026-01-01T09:00:00Z',
  last_issued_at: '2026-08-01T09:00:00Z',
  in_use: false,
  current: null,
  ...rest,
})

function antworte(geraete: unknown[], verlauf?: unknown) {
  vi.mocked(api).mockImplementation(async (pfad: string) => {
    if (pfad.startsWith('/rentals/devices/history')) return verlauf as never
    if (pfad === '/rentals/devices') return geraete as never
    return [] as never
  })
}

describe('RentalDevices', () => {
  it('nennt Ausgaben, Tage und Kunden in der richtigen Einzahl/Mehrzahl', async () => {
    antworte([geraet({loans: 1, days_out: 1, customers: 1})])
    render(<RentalDevices />)

    expect(await screen.findByText('VK7-1000')).toBeTruthy()
    expect(screen.getByText(/^Ausgabe$/)).toBeTruthy()
    expect(screen.getByText(/^Kunde$/)).toBeTruthy()
  })

  it('setzt bei mehreren die Mehrzahl', async () => {
    antworte([geraet({loans: 3, customers: 2})])
    render(<RentalDevices />)

    expect(await screen.findByText(/^Ausgaben$/)).toBeTruthy()
    expect(screen.getByText(/^Kunden$/)).toBeTruthy()
  })

  it('zeigt verspätete Rückgaben nur, wenn es welche gab', async () => {
    antworte([geraet({late_returns: 0})])
    const {unmount} = render(<RentalDevices />)
    expect(await screen.findByText('VK7-1000')).toBeTruthy()
    expect(screen.queryByText(/zu spät zurück/)).toBeNull()

    unmount()
    antworte([geraet({late_returns: 2})])
    render(<RentalDevices />)
    expect(await screen.findByText(/zu spät zurück/)).toBeTruthy()
  })

  it('unterscheidet "unterwegs" von "im Bestand"', async () => {
    antworte([
      geraet({key: 'a', serial_number: 'A-1', in_use: false, current: null}),
      geraet({
        key: 'b',
        serial_number: 'B-1',
        in_use: true,
        current: {
          rental_id: 'r1',
          customer_id: 'c1',
          customer_name: 'Anna Lindner',
          issued_at: '2026-08-10T09:00:00Z',
          due_at: '2026-08-20T09:00:00Z',
          is_overdue: false,
          due_soon: false,
          days_until_due: 5,
          days_overdue: 0,
        },
      }),
    ])
    render(<RentalDevices />)

    expect(await screen.findByText('im Bestand')).toBeTruthy()
    expect(screen.getByText('unterwegs')).toBeTruthy()
    expect(screen.getByText(/Anna Lindner/)).toBeTruthy()
  })

  it('meldet ein überfälliges Gerät mit der Anzahl Tage', async () => {
    antworte([
      geraet({
        in_use: true,
        current: {
          rental_id: 'r1',
          customer_id: 'c1',
          customer_name: 'Anna Lindner',
          issued_at: '2026-07-01T09:00:00Z',
          due_at: '2026-07-08T09:00:00Z',
          is_overdue: true,
          due_soon: false,
          days_until_due: -3,
          days_overdue: 3,
        },
      }),
    ])
    render(<RentalDevices />)

    expect(await screen.findByText(/3 Tage überfällig/)).toBeTruthy()
  })

  it('holt den Verlauf erst beim Aufklappen', async () => {
    antworte([geraet()], {
      product_name: 'Kobold VK7',
      serial_number: 'VK7-1000',
      loans: 1,
      days_out: 6,
      customers: 1,
      late_returns: 1,
      first_issued_at: '2026-01-01T09:00:00Z',
      history: [{
        id: 'r1',
        customer_name: 'Familie Weber',
        issued_at: '2026-06-20T09:00:00Z',
        due_at: '2026-06-27T09:00:00Z',
        returned_at: '2026-07-04T09:00:00Z',
        status: 'returned',
        notes: 'Bürste getauscht',
        days_out: 14,
        returned_late: true,
      }],
    })
    render(<RentalDevices />)

    await screen.findByText('VK7-1000')
    expect(screen.queryByText('Familie Weber')).toBeNull()

    await userEvent.click(screen.getByRole('button', {name: /VK7-1000/}))

    expect(await screen.findByText('Familie Weber')).toBeTruthy()
    expect(screen.getByText(/zu spät zurück/)).toBeTruthy()
    expect(screen.getByText('Bürste getauscht')).toBeTruthy()
  })

  it('erklärt bei leerer Liste, warum nichts da ist', async () => {
    antworte([])
    render(<RentalDevices />)

    // Der Hinweis muss die Ursache nennen, nicht nur "keine Daten".
    expect(await screen.findByText(/Seriennummer/)).toBeTruthy()
  })

  it('filtert über die Suche nach Seriennummer', async () => {
    antworte([
      geraet({key: 'a', serial_number: 'VK7-1000'}),
      geraet({key: 'b', serial_number: 'TM6-2000', product_name: 'Thermomix TM6'}),
    ])
    render(<RentalDevices />)

    await screen.findByText('VK7-1000')
    await userEvent.type(screen.getByRole('searchbox'), 'TM6')

    await waitFor(() => expect(screen.queryByText('VK7-1000')).toBeNull())
    expect(screen.getByText('TM6-2000')).toBeTruthy()
  })
})
