import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

import {api} from '../lib/api'
import {HistoryPage} from './HistoryPage'
import {TeamPage} from './TeamPage'
import {TeamStatsPage} from './TeamStatsPage'

const mockApi = vi.mocked(api)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function zeige(element: React.ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>)
}

/**
 * Ein fehlgeschlagener Abruf und "es gibt nichts" dürfen nicht gleich
 * aussehen. Wer die Meldung "Noch keine Historie vorhanden" liest, während in
 * Wahrheit der Server nicht antwortet, sucht den Fehler an der falschen
 * Stelle – oder hält gepflegte Daten für verloren.
 */
describe('Ladefehler statt leerer Seite', () => {
  it('zeigt bei einem Serverfehler im Verlauf eine Meldung statt "keine Historie"', async () => {
    mockApi.mockRejectedValue(new Error('Fehler 500'))

    zeige(<HistoryPage />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(screen.getByText('Fehler 500')).toBeTruthy()
    expect(screen.queryByText(/Noch keine relevante Kundenhistorie/)).toBeNull()
  })

  it('lädt den Verlauf auf Knopfdruck erneut', async () => {
    mockApi.mockRejectedValueOnce(new Error('Fehler 503'))
    mockApi.mockResolvedValueOnce([
      {
        customer_id: 'k1',
        name: 'Familie Meyer',
        address: 'Hauptweg 3',
        phone: null,
        email: null,
        purchased_products: [],
      },
    ])

    zeige(<HistoryPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    await userEvent.click(screen.getByRole('button', {name: 'Erneut versuchen'}))

    await waitFor(() => {
      expect(screen.getByText('Familie Meyer')).toBeTruthy()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('unterscheidet in der Mitarbeiterübersicht Fehler und leeres Team', async () => {
    mockApi.mockRejectedValue(new Error('Kein Zugriff'))

    zeige(<TeamPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Kein Zugriff')).toBeTruthy()
    expect(screen.queryByText(/keine Mitarbeiter zugeordnet/)).toBeNull()
  })

  it('meldet ein leeres Team als leeres Team, nicht als Fehler', async () => {
    mockApi.mockResolvedValue([])

    zeige(<TeamPage />)

    await waitFor(() => {
      expect(screen.getByText(/keine Mitarbeiter zugeordnet/)).toBeTruthy()
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('bleibt bei den Teamstatistiken nicht ewig im Ladezustand hängen', async () => {
    mockApi.mockRejectedValue(new Error('Fehler 500'))

    zeige(<TeamStatsPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByText(/Teamstatistiken werden geladen/)).toBeNull()
  })
})
