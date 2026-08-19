import {describe, expect, it} from 'vitest'
import {betragAusText, MAX_MENGE, MAX_PREIS_EUR, positionenFehler, preisInCent} from './positionen'

/* Angebot und Verkauf rechnen Preis und Menge selbst um. Ohne diese
   Prüfung entstand aus einer Fehleingabe still ein NaN, aus dem
   JSON.stringify ein `null` machte - der Server lehnte dann ein Feld ab,
   das im Formular gar nicht vorkommt. */

describe('betragAusText', () => {
  it.each([
    ['1299,00', 1299],
    ['1.299,00', 1299],
    ['1299.00', 1299],
    ['1299', 1299],
    ['  949,50  ', 949.5],
    ['949,50 €', 949.5],
  ])('liest %s als %s', (eingabe, erwartet) => {
    expect(betragAusText(eingabe)).toBe(erwartet)
  })

  it.each(['', '   ', 'abc', '12,34,56', '1e5', '--5', '1,2.3', '1.2345,00', '1..2'])(
    'macht aus „%s“ kein stilles Ergebnis',
    eingabe => {
      expect(Number.isNaN(betragAusText(eingabe))).toBe(true)
    },
  )

  it('liest einen einzelnen Punkt als Dezimaltrennzeichen – wie das Backend', () => {
    // backend/app/routers/products.py liest "1.299" ebenso als 1,299.
    // Zwei Lesarten für dieselbe Eingabe wären schlimmer als eine strenge.
    expect(betragAusText('1.299')).toBe(1.299)
  })
})

describe('positionenFehler', () => {
  const gueltig = {product_id: 'p1', quantity: 2, price_eur: '949,00'}

  it('lässt eine gültige Position durch', () => {
    expect(positionenFehler([gueltig])).toBeNull()
  })

  it('verlangt mindestens eine Position', () => {
    expect(positionenFehler([])).toMatch(/mindestens eine Position/)
  })

  it('meldet einen leeren Produktdatensatz mit Positionsnummer', () => {
    expect(positionenFehler([gueltig, {...gueltig, product_id: ''}])).toBe(
      'Position 2: bitte ein Produkt auswählen.',
    )
  })

  it('lehnt die Menge 0 ab', () => {
    expect(positionenFehler([{...gueltig, quantity: 0}])).toMatch(/mindestens 1/)
  })

  it('lehnt eine negative Menge ab', () => {
    expect(positionenFehler([{...gueltig, quantity: -3}])).toMatch(/mindestens 1/)
  })

  it('lehnt eine Menge ab, die keine ganze Zahl ist', () => {
    expect(positionenFehler([{...gueltig, quantity: 1.5}])).toMatch(/ganze Zahl/)
  })

  it('lehnt NaN als Menge ab', () => {
    expect(positionenFehler([{...gueltig, quantity: 'zwei'}])).toMatch(/ganze Zahl/)
  })

  it('lehnt eine absurd hohe Menge ab', () => {
    expect(positionenFehler([{...gueltig, quantity: MAX_MENGE + 1}])).toMatch(/höchstens/)
  })

  it('lehnt einen Preis ab, der keine Zahl ist', () => {
    expect(positionenFehler([{...gueltig, price_eur: 'neunhundert'}])).toBe(
      'Position 1: „neunhundert“ ist kein gültiger Preis.',
    )
  })

  it('lehnt einen leeren Preis ab', () => {
    expect(positionenFehler([{...gueltig, price_eur: ''}])).toMatch(/kein gültiger Preis/)
  })

  it('lehnt einen negativen Preis ab', () => {
    expect(positionenFehler([{...gueltig, price_eur: '-5,00'}])).toMatch(/nicht negativ/)
  })

  it('lehnt einen Preis über der Obergrenze ab', () => {
    expect(positionenFehler([{...gueltig, price_eur: String(MAX_PREIS_EUR + 1)}])).toMatch(/liegt über/)
  })

  it('lässt einen Preis von 0 zu – eine Zugabe ist kein Fehler', () => {
    expect(positionenFehler([{...gueltig, price_eur: '0'}])).toBeNull()
  })

  it('nennt die erste unbrauchbare Position, nicht alle auf einmal', () => {
    const fehler = positionenFehler([
      gueltig,
      {...gueltig, price_eur: 'abc'},
      {...gueltig, product_id: ''},
    ])
    expect(fehler).toMatch(/Position 2/)
  })
})

describe('preisInCent', () => {
  it.each([
    ['949,00', 94900],
    ['1.299,99', 129999],
    ['0', 0],
  ])('rechnet %s in %s Cent um', (eingabe, erwartet) => {
    expect(preisInCent(eingabe)).toBe(erwartet)
  })

  it('rundet Rundungsfehler von Gleitkommazahlen weg', () => {
    expect(preisInCent('19,99')).toBe(1999)
    expect(preisInCent('1,10')).toBe(110)
  })
})
