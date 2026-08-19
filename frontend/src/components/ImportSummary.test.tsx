import {cleanup, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {gruppiereHinweise, ImportSummary} from './ImportSummary'

afterEach(cleanup)

/* Vorher landeten die Gründe für übersprungene Zeilen nur in console.info.
   Auf dem Bildschirm stand "12 angelegt, 40 übersprungen" - und der
   Benutzer hatte keine Möglichkeit herauszufinden, was mit den 40 Zeilen
   passiert ist. */

describe('gruppiereHinweise', () => {
  it('fasst gleiche Gründe zusammen und sammelt die Zeilennummern', () => {
    const gruppen = gruppiereHinweise([
      'Zeile 2: kein Nachname',
      'Zeile 5: kein Nachname',
      'Zeile 9: dieser Kunde ist bereits angelegt',
    ])

    expect(gruppen).toHaveLength(2)
    expect(gruppen[0]).toEqual({grund: 'kein Nachname', zeilen: [2, 5], anzahl: 2})
    expect(gruppen[1]).toEqual({
      grund: 'dieser Kunde ist bereits angelegt',
      zeilen: [9],
      anzahl: 1,
    })
  })

  it('sortiert den häufigsten Grund nach oben', () => {
    const gruppen = gruppiereHinweise([
      'Zeile 2: selten',
      'Zeile 3: häufig',
      'Zeile 4: häufig',
      'Zeile 5: häufig',
    ])
    expect(gruppen[0].grund).toBe('häufig')
  })

  it('verkraftet Hinweise ohne Zeilennummer', () => {
    const gruppen = gruppiereHinweise(['Die Datei enthält keine Kopfzeile'])
    expect(gruppen).toEqual([
      {grund: 'Die Datei enthält keine Kopfzeile', zeilen: [], anzahl: 1},
    ])
  })

  it('gibt bei gar keinen Hinweisen eine leere Liste zurück', () => {
    expect(gruppiereHinweise([])).toEqual([])
  })
})

describe('ImportSummary', () => {
  const zu = vi.fn()

  it('nennt angelegte und übersprungene Datensätze', () => {
    render(
      <ImportSummary
        ergebnis={{angelegt: 12, uebersprungen: 3, hinweise: ['Zeile 2: kein Nachname'], einheit: 'Kunden'}}
        onClose={zu}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('12 Kunden angelegt, 3 übersprungen')
  })

  it('zeigt die Gründe für übersprungene Zeilen sichtbar an', () => {
    render(
      <ImportSummary
        ergebnis={{
          angelegt: 1,
          uebersprungen: 3,
          hinweise: [
            'Zeile 2: kein Nachname',
            'Zeile 5: kein Nachname',
            'Zeile 9: dieser Kunde ist bereits angelegt',
          ],
          einheit: 'Kunden',
        }}
        onClose={zu}
      />,
    )

    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('kein Nachname')
    expect(text).toContain('dieser Kunde ist bereits angelegt')
    expect(text).toContain('Zeile 2, 5')
  })

  it('macht sichtbar, wenn mehr übersprungen wurde als begründet ist', () => {
    // Der Server schickt höchstens 20 Einzelhinweise mit. Ohne diese Zeile
    // sähe es aus, als wären die restlichen Zeilen grundlos verschwunden.
    render(
      <ImportSummary
        ergebnis={{angelegt: 0, uebersprungen: 50, hinweise: ['Zeile 2: kein Nachname'], einheit: 'Kunden'}}
        onClose={zu}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain(
      '49 × weitere übersprungene Zeilen ohne Einzelbegründung',
    )
  })

  it('rendert keine endlose Zeilenliste', () => {
    const hinweise = Array.from({length: 20}, (_, i) => `Zeile ${i + 2}: kein Nachname`)
    render(
      <ImportSummary
        ergebnis={{angelegt: 0, uebersprungen: 20, hinweise, einheit: 'Kunden'}}
        onClose={zu}
      />,
    )
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toContain('und 12 weitere')
    expect(text).not.toContain('Zeile 2, 3, 4, 5, 6, 7, 8, 9, 10')
  })

  it('lässt die Gründe weg, wenn nichts übersprungen wurde', () => {
    render(
      <ImportSummary
        ergebnis={{angelegt: 7, uebersprungen: 0, hinweise: [], einheit: 'Preise', taetigkeit: 'gesetzt'}}
        onClose={zu}
      />,
    )
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('7 Preise gesetzt')
    expect(status.textContent).not.toContain('übersprungen')
    expect(status.querySelector('.import-summary-reasons')).toBeNull()
  })

  it('lässt sich schließen', async () => {
    const schliessen = vi.fn()
    render(
      <ImportSummary
        ergebnis={{angelegt: 1, uebersprungen: 0, hinweise: [], einheit: 'Kunden'}}
        onClose={schliessen}
      />,
    )
    await userEvent.click(screen.getByRole('button', {name: 'Importergebnis schließen'}))
    expect(schliessen).toHaveBeenCalledTimes(1)
  })
})
