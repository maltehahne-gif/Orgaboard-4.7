import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

import {api} from '../lib/api'
import {ProductPrices} from './ProductPrices'

afterEach(cleanup)

const preis = (rest: Record<string, unknown> = {}) => ({
  id: 'x1',
  amount_cents: 129900,
  currency: 'EUR',
  valid_from: '2026-06-01',
  valid_to: null,
  source_url: 'Preisliste 06/2026',
  verified: true,
  fetched_at: '2026-06-01T09:00:00Z',
  ...rest,
})

const zeile = (rest: Record<string, unknown> = {}) => ({
  product_id: 'p1',
  name: 'Kobold VK7',
  category: 'Staubsauger',
  verified: true,
  price: preis(),
  unverified_count: 0,
  history_count: 1,
  ...rest,
})

function antworte(zeilen: unknown[], ohnePreis: number, verlauf: unknown[] = [preis()]) {
  vi.mocked(api).mockImplementation(async (pfad: string) => {
    if (pfad === '/products/prices/overview') {
      return {products: zeilen, without_price: ohnePreis} as never
    }
    if (pfad.endsWith('/prices')) return verlauf as never
    return {} as never
  })
}

describe('ProductPrices', () => {
  it('zeigt Beträge deutsch', async () => {
    antworte([zeile()], 0)
    render(<ProductPrices />)

    const betrag = await screen.findByText(/1\.299,00/)
    expect(betrag).toBeTruthy()
  })

  it('schreibt das Datum deutsch statt in ISO-Form', async () => {
    antworte([zeile()], 0)
    render(<ProductPrices />)

    expect(await screen.findByText('01.06.2026')).toBeTruthy()
    expect(screen.queryByText('2026-06-01')).toBeNull()
  })

  it('markiert ein Produkt ohne Preis, statt 0,00 € zu zeigen', async () => {
    antworte([zeile({price: null, history_count: 0})], 1)
    render(<ProductPrices />)

    expect(await screen.findByText('nicht hinterlegt')).toBeTruthy()
    expect(screen.queryByText(/0,00/)).toBeNull()
  })

  it('weist auf fehlende Preise hin und begründet, warum das stört', async () => {
    antworte([zeile({price: null})], 3)
    render(<ProductPrices />)

    expect(await screen.findByText(/Bei 3 Produkten fehlt der Preis/)).toBeTruthy()
    expect(screen.getByText(/von Hand eingetragen/)).toBeTruthy()
  })

  it('formuliert den Hinweis bei genau einem Produkt in der Einzahl', async () => {
    antworte([zeile({price: null})], 1)
    render(<ProductPrices />)

    expect(await screen.findByText(/Bei einem Produkt fehlt der Preis/)).toBeTruthy()
  })

  it('lässt den Hinweis weg, wenn überall ein Preis steht', async () => {
    antworte([zeile()], 0)
    render(<ProductPrices />)

    await screen.findByText('Kobold VK7')
    expect(screen.queryByText(/fehlt der Preis/)).toBeNull()
  })

  it('blendet mit "Nur ohne Preis" die vollständigen Zeilen aus', async () => {
    antworte([
      zeile(),
      zeile({product_id: 'p2', name: 'Thermomix TM6', price: null, history_count: 0}),
    ], 1)
    render(<ProductPrices />)

    await screen.findByText('Kobold VK7')
    await userEvent.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(screen.queryByText('Kobold VK7')).toBeNull())
    expect(screen.getByText('Thermomix TM6')).toBeTruthy()
  })

  it('zeigt den Verlauf erst nach dem Aufklappen', async () => {
    antworte([zeile({history_count: 2})], 0, [
      preis(),
      preis({id: 'x0', amount_cents: 119900, valid_from: '2025-09-01', valid_to: '2026-05-31',
             source_url: 'Preisliste 09/2025'}),
    ])
    render(<ProductPrices />)

    await screen.findByText('Kobold VK7')
    expect(screen.queryByText('Preisliste 09/2025')).toBeNull()

    await userEvent.click(screen.getByText('Kobold VK7'))

    expect(await screen.findByText('Preisliste 09/2025')).toBeTruthy()
    // Ein laufender Preis hat kein Enddatum - das muss auch so dastehen.
    expect(screen.getByText('offen')).toBeTruthy()
    expect(screen.getByText('31.05.2026')).toBeTruthy()
  })

  it('kennzeichnet unbestätigte Preise', async () => {
    antworte([zeile()], 0, [preis({verified: false})])
    render(<ProductPrices />)

    await userEvent.click(await screen.findByText('Kobold VK7'))
    expect(await screen.findByText('unbestätigt')).toBeTruthy()
  })
})

describe('ProductPrices – Eingabe', () => {
  beforeEach(() => antworte([zeile()], 0))

  it('rechnet einen deutsch geschriebenen Betrag in Cent um', async () => {
    render(<ProductPrices />)
    await userEvent.click(await screen.findByText('Kobold VK7'))

    await userEvent.type(screen.getByPlaceholderText('1.299,00'), '1.499,50')
    await userEvent.type(screen.getByPlaceholderText(/Preisliste 08/), 'Preisliste 08/2026')
    await userEvent.click(screen.getByRole('button', {name: 'Preis setzen'}))

    await waitFor(() => {
      const aufruf = vi.mocked(api).mock.calls
        .find(([pfad, opt]) => (opt as RequestInit | undefined)?.method === 'POST' && String(pfad).includes('/prices'))
      expect(aufruf).toBeTruthy()
      expect(JSON.parse(String((aufruf![1] as RequestInit).body)).amount_cents).toBe(149950)
    })
  })

  it('schickt nichts ab, solange keine Quelle eingetragen ist', async () => {
    render(<ProductPrices />)
    await userEvent.click(await screen.findByText('Kobold VK7'))

    await userEvent.type(screen.getByPlaceholderText('1.299,00'), '999')
    await userEvent.click(screen.getByRole('button', {name: 'Preis setzen'}))

    const gesendet = vi.mocked(api).mock.calls
      .some(([, opt]) => (opt as RequestInit | undefined)?.method === 'POST')
    expect(gesendet).toBe(false)
  })
})
