import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn(), downloadFile: vi.fn()}
})

import {api, downloadFile} from '../lib/api'
import {ReportsPage} from './ReportsPage'

afterEach(cleanup)

function bericht(rest: Record<string, unknown> = {}) {
  return {
    kind: 'week',
    label: 'KW 32 (03.08. – 09.08.2026)',
    is_complete: true,
    metrics: {
      revenue_cents: 1847500,
      revenue_previous_cents: 1210000,
      revenue_change_percent: 52.7,
      units: 14,
      units_previous: 9,
      sales: 11,
      appointments_total: 19,
      appointments_done: 16,
      appointments_done_previous: 12,
      appointments_with_sale: 9,
      presentations: 13,
      close_rate_percent: 56.3,
      close_rate_percent_previous: 41.7,
      revenue_per_appointment_cents: 115469,
    },
    products: [],
    rentals: {issued: 7, returned: 5, still_out: 6, overdue: 0},
    follow_ups: {created: 12, open: 23, overdue: 0},
    highlights: [],
    team: null,
    ...rest,
  }
}

function antworte(daten: unknown) {
  vi.mocked(api).mockImplementation(async () => daten as never)
}

describe('ReportsPage – Veränderung', () => {
  it('zeigt einen Anstieg mit Pluszeichen und grün', async () => {
    antworte(bericht())
    const {container} = render(<ReportsPage />)

    expect(await screen.findByText(/\+52,7 %/)).toBeTruthy()
    expect(container.querySelector('.bericht-delta.auf')).toBeTruthy()
  })

  it('zeigt einen Rückgang ohne Pluszeichen und in Warnfarbe', async () => {
    antworte(bericht({
      metrics: {...bericht().metrics, revenue_change_percent: -18.4},
    }))
    const {container} = render(<ReportsPage />)

    expect(await screen.findByText(/-18,4 %/)).toBeTruthy()
    expect(container.querySelector('.bericht-delta.ab')).toBeTruthy()
  })

  it('behauptet ohne Vorwert keine Prozentzahl', async () => {
    // "+100 %" oder "unendlich" waeren beide falsch.
    antworte(bericht({
      metrics: {...bericht().metrics, revenue_change_percent: null},
    }))
    render(<ReportsPage />)

    expect(await screen.findByText(/kein Vorwert/)).toBeTruthy()
  })

  it('schreibt eine unveränderte Zahl als ±0 %', async () => {
    antworte(bericht({
      metrics: {...bericht().metrics, revenue_change_percent: 0},
    }))
    render(<ReportsPage />)

    expect(await screen.findByText(/±0 %/)).toBeTruthy()
  })
})

describe('ReportsPage – Darstellung', () => {
  it('schreibt Beträge deutsch', async () => {
    antworte(bericht())
    render(<ReportsPage />)

    expect(await screen.findByText(/18\.475,00/)).toBeTruthy()
  })

  it('weist darauf hin, wenn der Zeitraum noch läuft', async () => {
    antworte(bericht({is_complete: false}))
    render(<ReportsPage />)

    expect(await screen.findByText(/Zwischenstand/)).toBeTruthy()
  })

  it('lässt den Hinweis bei einem abgeschlossenen Zeitraum weg', async () => {
    antworte(bericht({is_complete: true}))
    render(<ReportsPage />)

    await screen.findByText(/18\.475,00/)
    expect(screen.queryByText(/Zwischenstand/)).toBeNull()
  })

  it('hebt überfällige Geräte und Wiedervorlagen hervor', async () => {
    antworte(bericht({
      rentals: {issued: 7, returned: 5, still_out: 6, overdue: 2},
      follow_ups: {created: 12, open: 23, overdue: 4},
    }))
    render(<ReportsPage />)

    expect(await screen.findByText(/2 überfällig/)).toBeTruthy()
    expect(screen.getByText(/4 überfällig/)).toBeTruthy()
  })

  it('sagt es, wenn im Zeitraum nichts verkauft wurde', async () => {
    antworte(bericht({products: []}))
    render(<ReportsPage />)

    expect(await screen.findByText(/nichts verkauft/)).toBeTruthy()
  })

  it('zeigt die Teamtabelle nur, wenn der Server eine liefert', async () => {
    antworte(bericht({team: null}))
    const {unmount} = render(<ReportsPage />)
    await screen.findByText(/18\.475,00/)
    expect(screen.queryByText('Team')).toBeNull()

    unmount()
    antworte(bericht({
      team: [{
        employee_id: 'e1', name: 'Jessica Wunder', revenue_cents: 842300,
        revenue_change_percent: 31.4, units: 7, appointments_done: 7, close_rate_percent: 57.1,
      }],
    }))
    render(<ReportsPage />)
    expect(await screen.findByText('Jessica Wunder')).toBeTruthy()
  })
})

describe('ReportsPage – Steuerung', () => {
  it('startet beim abgeschlossenen Zeitraum, nicht beim laufenden', async () => {
    // Ein Bericht ueber eine halbe Woche ist als Bericht wenig wert.
    antworte(bericht())
    render(<ReportsPage />)

    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalled())
    expect(vi.mocked(api).mock.calls[0][0]).toBe('/reports/week?offset=1')
  })

  it('blättert weiter zurück', async () => {
    antworte(bericht())
    render(<ReportsPage />)
    await screen.findByText(/18\.475,00/)

    await userEvent.click(screen.getByTitle('Weiter zurück'))

    await waitFor(() => {
      const pfade = vi.mocked(api).mock.calls.map(c => c[0])
      expect(pfade).toContain('/reports/week?offset=2')
    })
  })

  it('wechselt auf den Monat und beginnt dort wieder beim letzten', async () => {
    antworte(bericht())
    render(<ReportsPage />)
    await screen.findByText(/18\.475,00/)

    await userEvent.click(screen.getByRole('button', {name: 'Monat'}))

    await waitFor(() => {
      const pfade = vi.mocked(api).mock.calls.map(c => c[0])
      expect(pfade).toContain('/reports/month?offset=1')
    })
  })

  it('lädt die Textfassung desselben Zeitraums herunter', async () => {
    antworte(bericht())
    render(<ReportsPage />)
    await screen.findByText(/18\.475,00/)

    await userEvent.click(screen.getByRole('button', {name: /Als Text speichern/}))

    await waitFor(() => {
      expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
        '/reports/week/text?offset=1',
        expect.stringContaining('Wochenbericht'),
      )
    })
  })

  it('nimmt keine Schrägstriche aus dem Zeitraumnamen in den Dateinamen', async () => {
    // "KW 32 (03.08. - 09.08.2026)" ist harmlos, ein "/" waere es nicht.
    antworte(bericht({label: 'KW 32 03/08 – 09/08'}))
    render(<ReportsPage />)
    await screen.findByText(/18\.475,00/)

    await userEvent.click(screen.getByRole('button', {name: /Als Text speichern/}))

    await waitFor(() => {
      const name = vi.mocked(downloadFile).mock.calls.at(-1)?.[1] ?? ''
      expect(name).not.toContain('/')
    })
  })
})
