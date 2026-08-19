import {cleanup, render, screen, waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../App', () => ({letzterBesuchterPfad: () => '/verkaeufe'}))

import {api} from '../lib/api'
import {FeedbackPage} from './FeedbackPage'

const mockApi = vi.mocked(api)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

async function ausfuellen(betreff = 'Verkauf lässt sich nicht speichern', nachricht = 'Beim Klick auf Speichern passiert nichts. Reproduzierbar im Firefox.') {
  await userEvent.type(screen.getByLabelText(/Betreff/), betreff)
  await userEvent.type(screen.getByLabelText(/Nachricht/), nachricht)
}

describe('Feedback-Seite – rendert und ist vorbelegt', () => {
  it('rendert alle Pflichtfelder', () => {
    render(<FeedbackPage />)
    expect(screen.getByLabelText(/Kategorie/)).toBeTruthy()
    expect(screen.getByLabelText(/Betreff/)).toBeTruthy()
    expect(screen.getByLabelText(/Nachricht/)).toBeTruthy()
  })

  it('übernimmt die zuletzt besuchte Seite als Vorschlag für "Aktuelle Seite"', () => {
    render(<FeedbackPage />)
    const feld = screen.getByLabelText(/Aktuelle Seite/) as HTMLInputElement
    expect(feld.value).toBe('/verkaeufe')
  })

  it('bietet alle sechs Kategorien an', () => {
    render(<FeedbackPage />)
    const auswahl = screen.getByLabelText(/Kategorie/) as HTMLSelectElement
    const werte = Array.from(auswahl.options).map(o => o.value)
    expect(werte).toEqual(['bug', 'improvement', 'feature_request', 'design', 'performance', 'other'])
  })
})

describe('Feedback-Seite – Validierung', () => {
  it('verlangt Betreff und Nachricht vor dem Absenden (leer, per HTML required)', async () => {
    render(<FeedbackPage />)
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    // required verhindert hier bereits, dass das Formular überhaupt
    // abgeschickt wird - genau das ist die erste Verteidigungslinie.
    expect(mockApi).not.toHaveBeenCalled()
    expect(screen.queryByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeNull()
  })

  it('verlangt Betreff und Nachricht vor dem Absenden (nur Leerzeichen)', async () => {
    // required allein reicht nicht - reiner Leerraum zählt für den Browser
    // als ausgefüllt. Die eigene Prüfung muss ihn trotzdem abfangen.
    render(<FeedbackPage />)
    await userEvent.type(screen.getByLabelText(/Betreff/), '   ')
    await userEvent.type(screen.getByLabelText(/Nachricht/), '   ')
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toMatch(/Betreff und Nachricht/)
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('verlangt eine Mindestlänge für die Nachricht', async () => {
    render(<FeedbackPage />)
    await userEvent.type(screen.getByLabelText(/Betreff/), 'Kurztest')
    await userEvent.type(screen.getByLabelText(/Nachricht/), 'zu kurz')
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toMatch(/mindestens/)
    expect(mockApi).not.toHaveBeenCalled()
  })
})

describe('Feedback-Seite – Absenden', () => {
  it('sendet gültiges Feedback und zeigt die Erfolgsmeldung mit Referenz', async () => {
    mockApi.mockResolvedValue({ok: true, reference: 'FDB-2026-000042', recipients: 1})
    render(<FeedbackPage />)

    await ausfuellen()
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    expect(await screen.findByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeTruthy()
    expect(screen.getByText(/FDB-2026-000042/)).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/feedback', expect.objectContaining({method: 'POST'}))
  })

  it('setzt das Formular nach erfolgreichem Absenden zurück', async () => {
    mockApi.mockResolvedValue({ok: true, reference: 'FDB-2026-000042', recipients: 1})
    render(<FeedbackPage />)

    await ausfuellen()
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))
    await screen.findByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)

    expect((screen.getByLabelText(/Betreff/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Nachricht/) as HTMLTextAreaElement).value).toBe('')
  })

  it('deaktiviert den Button während des Sendens und erzeugt keinen Doppelrequest', async () => {
    let loeseAuf!: (value: unknown) => void
    mockApi.mockImplementationOnce(() => new Promise(resolve => { loeseAuf = resolve }))
    render(<FeedbackPage />)

    await ausfuellen()
    const button = screen.getByRole('button', {name: /Feedback senden/})
    await userEvent.click(button)
    await userEvent.click(button)
    await userEvent.click(button)

    expect(button.hasAttribute('disabled')).toBe(true)
    expect(mockApi).toHaveBeenCalledTimes(1)

    loeseAuf({ok: true, reference: 'FDB-2026-000042', recipients: 1})
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  })

  it('zeigt eine verständliche Fehlermeldung und reaktiviert den Button', async () => {
    mockApi.mockRejectedValue(new Error('Feedback konnte nicht gesendet werden.'))
    render(<FeedbackPage />)

    await ausfuellen()
    const button = screen.getByRole('button', {name: /Feedback senden/})
    await userEvent.click(button)

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toBe('Feedback konnte nicht gesendet werden.')
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    expect(screen.queryByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeNull()
  })

  it('zeigt die 429-Meldung des Servers bei zu vielen Einsendungen', async () => {
    mockApi.mockRejectedValue(new Error('Du hast in kurzer Zeit mehrere Feedbacks gesendet. Bitte versuche es in 10 Minuten erneut.'))
    render(<FeedbackPage />)

    await ausfuellen()
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toMatch(/kurzer Zeit mehrere Feedbacks/)
  })
})

describe('Feedback-Seite – Tastaturbedienung', () => {
  it('lässt sich vollständig mit der Tastatur ausfüllen und absenden', async () => {
    mockApi.mockResolvedValue({ok: true, reference: 'FDB-2026-000042', recipients: 1})
    render(<FeedbackPage />)

    await userEvent.tab() // Kategorie
    expect(document.activeElement).toBe(screen.getByLabelText(/Kategorie/))

    await userEvent.tab() // Betreff
    expect(document.activeElement).toBe(screen.getByLabelText(/Betreff/))
    await userEvent.keyboard('Kurztest per Tastatur')

    await userEvent.tab() // Nachricht
    expect(document.activeElement).toBe(screen.getByLabelText(/Nachricht/))
    await userEvent.keyboard('Vollständig über die Tastatur ausgefüllt und abgesendet.')

    await userEvent.tab() // Aktuelle Seite
    expect(document.activeElement).toBe(screen.getByLabelText(/Aktuelle Seite/))

    await userEvent.tab() // Senden-Button
    expect(document.activeElement).toBe(screen.getByRole('button', {name: /Feedback senden/}))
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeTruthy()
  })
})

/* Feedback läuft seit dieser Runde vollständig intern über das
   Nachrichtensystem. Die Oberfläche darf deshalb nirgends mehr behaupten,
   etwas sei "gespeichert, aber nicht versendet" - das war genau die
   Meldung, nach der Benutzer erneut klickten und ein zweites Feedback
   hinterliessen. */
describe('Feedback-Seite – keine Mail-Halbwahrheiten mehr', () => {
  it('zeigt nach Erfolg genau die zugesagte Bestätigung', async () => {
    mockApi.mockResolvedValue({ok: true, reference: 'FDB-2026-000042', recipients: 2})
    render(<FeedbackPage />)

    await ausfuellen()
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    const bestaetigung = await screen.findByRole('status')
    expect(bestaetigung.textContent).toContain('Dein Feedback wurde gesendet. Vielen Dank.')
    expect(bestaetigung.textContent).toContain('FDB-2026-000042')
    expect(bestaetigung.textContent).not.toMatch(/Versand/)
    expect(bestaetigung.textContent).not.toMatch(/E-Mail/)
  })

  it('nennt Versand per E-Mail an keiner Stelle der Seite', () => {
    render(<FeedbackPage />)
    expect(document.body.textContent).not.toMatch(/E-Mail/)
    expect(document.body.textContent).not.toMatch(/Mailversand/)
  })

  it('rendert einen Serverfehler als Text, niemals als [object Object]', async () => {
    // Wie ihn lib/api.ts aus einer FastAPI-Antwort erzeugt.
    mockApi.mockRejectedValue(new Error('subject: Field required'))
    render(<FeedbackPage />)

    await ausfuellen()
    await userEvent.click(screen.getByRole('button', {name: /Feedback senden/}))

    const meldung = await screen.findByRole('alert')
    expect(meldung.textContent).toBe('subject: Field required')
    expect(document.body.textContent).not.toContain('[object Object]')
  })
})
