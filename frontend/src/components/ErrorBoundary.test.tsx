import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ErrorBoundary} from './ErrorBoundary'

afterEach(cleanup)

beforeEach(() => {
  // React schreibt den abgefangenen Fehler zusätzlich selbst in die Konsole.
  // Das ist erwartet und soll die Testausgabe nicht fluten.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function Kaputt(): never {
  throw new Error('Cannot read properties of undefined (reading \'length\')')
}

function Heil() {
  return <p>Inhalt steht</p>
}

/**
 * Vor dieser Grenze legte ein einziger unerwarteter Wert die gesamte
 * Anwendung lahm: React räumt bei einem Fehler im Aufbau den kompletten
 * Baum ab, und übrig bleibt eine weiße Seite ohne Meldung und ohne Menü.
 */
describe('Absturzgrenze', () => {
  it('zeigt statt einer weißen Seite eine verständliche Meldung', () => {
    render(<ErrorBoundary bereich="Diese Seite"><Kaputt /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/konnte nicht angezeigt werden/)).toBeTruthy()
  })

  it('zeigt dem Benutzer keinen technischen Fehlertext', () => {
    render(<ErrorBoundary><Kaputt /></ErrorBoundary>)

    expect(screen.queryByText(/Cannot read properties/)).toBeNull()
    expect(screen.queryByText(/undefined/)).toBeNull()
  })

  it('lässt heile Inhalte unangetastet durch', () => {
    render(<ErrorBoundary><Heil /></ErrorBoundary>)

    expect(screen.getByText('Inhalt steht')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('gibt beim Seitenwechsel von selbst wieder frei', async () => {
    function Rahmen() {
      const [seite, setSeite] = useState('/kaputt')
      return (
        <>
          <button type="button" onClick={() => setSeite('/heil')}>weiter</button>
          <ErrorBoundary zuruecksetzenBei={seite}>
            {seite === '/kaputt' ? <Kaputt /> : <Heil />}
          </ErrorBoundary>
        </>
      )
    }

    render(<Rahmen />)
    expect(screen.getByRole('alert')).toBeTruthy()

    // Ohne das Zurücksetzen bliebe die Meldung bis zum Neuladen stehen –
    // die Anwendung wäre nach einem Fehler dauerhaft blockiert.
    await userEvent.click(screen.getByRole('button', {name: 'weiter'}))

    expect(screen.getByText('Inhalt steht')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
