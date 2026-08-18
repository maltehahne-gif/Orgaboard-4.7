import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter, useLocation} from 'react-router-dom'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

import {api} from '../lib/api'
import {GlobalSearch} from './GlobalSearch'

const mockApi = vi.mocked(api)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function zeige() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <GlobalSearch />
      <LocationDisplay />
    </MemoryRouter>,
  )
}

function treffer(overrides: Partial<{kind: string; id: string; title: string; subtitle: string}> = {}) {
  return {kind: 'customer', id: 'k1', title: 'Familie Nachname', subtitle: 'Musterstraße 1', ...overrides}
}

describe('GlobalSearch – echte Navigation', () => {
  it('navigiert bei einem Kunden-Treffer zur Kundenakte', async () => {
    mockApi.mockResolvedValue([treffer()])
    zeige()

    await userEvent.type(screen.getByRole('combobox'), 'Nach')
    const ergebnis = await screen.findByRole('option', {name: /Familie Nachname/})
    await userEvent.click(ergebnis)

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/kunden/k1'))
  })

  it('navigiert bei einem Produkt-Treffer zum Produktkatalog', async () => {
    mockApi.mockResolvedValue([treffer({kind: 'product', id: 'p1', title: 'VK7', subtitle: 'Sauger'})])
    zeige()

    await userEvent.type(screen.getByRole('combobox'), 'VK7')
    const ergebnis = await screen.findByRole('option', {name: /VK7/})
    await userEvent.click(ergebnis)

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/produkte'))
  })

  it('navigiert bei einem Verkaufs-Treffer zur Verkaufsliste', async () => {
    mockApi.mockResolvedValue([treffer({kind: 'sale', id: 's1', title: 'Verkauf: Anna Kundin', subtitle: '250,00 €'})])
    zeige()

    await userEvent.type(screen.getByRole('combobox'), 'Anna')
    const ergebnis = await screen.findByRole('option', {name: /Verkauf: Anna Kundin/})
    await userEvent.click(ergebnis)

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/verkaeufe'))
  })

  it('schließt das Suchergebnis und leert den Suchtext nach der Navigation', async () => {
    mockApi.mockResolvedValue([treffer()])
    zeige()

    const eingabe = screen.getByRole('combobox')
    await userEvent.type(eingabe, 'Nach')
    const ergebnis = await screen.findByRole('option', {name: /Familie Nachname/})
    await userEvent.click(ergebnis)

    await waitFor(() => expect(screen.queryByRole('option')).toBeNull())
    expect((eingabe as HTMLInputElement).value).toBe('')
  })
})

describe('GlobalSearch – Tastaturbedienung', () => {
  it('wählt Ergebnisse mit Pfeiltasten aus und übernimmt sie mit Enter', async () => {
    mockApi.mockResolvedValue([
      treffer({id: 'k1', title: 'Kunde Eins'}),
      treffer({id: 'k2', title: 'Kunde Zwei'}),
    ])
    zeige()

    const eingabe = screen.getByRole('combobox')
    await userEvent.type(eingabe, 'Kunde')
    await screen.findByRole('option', {name: /Kunde Eins/})

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/kunden/k2'))
  })

  it('schließt die Ergebnisliste mit Escape', async () => {
    mockApi.mockResolvedValue([treffer()])
    zeige()

    await userEvent.type(screen.getByRole('combobox'), 'Nach')
    await screen.findByRole('option')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('option')).toBeNull()
  })
})

describe('GlobalSearch – keine veralteten Ergebnisse (Request-Race)', () => {
  it('überschreibt neuere Ergebnisse nicht mit einer spät eintreffenden alten Antwort', async () => {
    let loeseErsteAuf!: (value: unknown) => void
    const ersteAntwort = new Promise(resolve => { loeseErsteAuf = resolve })
    mockApi.mockImplementationOnce(() => ersteAntwort as Promise<any>)

    zeige()
    const eingabe = screen.getByRole('combobox')

    await userEvent.type(eingabe, 'Mu')
    // Debounce abwarten, damit der erste Request wirklich abgeschickt wird,
    // bevor weitergetippt wird - sonst würde ihn schon der Debounce
    // verhindern, und die eigentliche Race-Situation (Antwort kommt spät,
    // nicht: Request wird spät gestellt) entstünde gar nicht erst.
    await new Promise(r => setTimeout(r, 300))
    expect(mockApi).toHaveBeenCalledTimes(1)

    mockApi.mockImplementationOnce(async () => [treffer({id: 'k2', title: 'Kunde Zwei'})])
    await userEvent.type(eingabe, 's')
    const kundeZwei = await screen.findByRole('option', {name: /Kunde Zwei/})
    expect(kundeZwei).toBeTruthy()

    // Die längst überholte erste Antwort ("M") trifft jetzt erst ein.
    loeseErsteAuf([treffer({id: 'k1', title: 'Kunde Eins'})])
    await new Promise(r => setTimeout(r, 20))

    expect(screen.getByRole('option', {name: /Kunde Zwei/})).toBeTruthy()
    expect(screen.queryByRole('option', {name: /Kunde Eins/})).toBeNull()
  }, 10000)
})
