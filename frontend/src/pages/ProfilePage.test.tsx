import {describe, expect, it} from 'vitest'
import {inCent, inEuro} from './ProfilePage'

/* Die Zielvorgaben liegen in der Datenbank als Cent, im Formular als Euro.
   Geht die Umrechnung schief, sieht das nicht nach einem Fehler aus,
   sondern nach einem hundertfach zu hohen oder zu niedrigen Ziel. */

describe('inCent – Eingabe in Euro', () => {
  it('macht aus 10000 Euro eine Million Cent', () => {
    // Genau der Fall aus der Fehlermeldung: Eingabe 10000 = 10.000 €.
    expect(inCent('10000')).toBe(1000000)
  })

  it('nimmt Nachkommastellen mit', () => {
    expect(inCent('1499.99')).toBe(149999)
  })

  it('versteht auch das deutsche Komma', () => {
    expect(inCent('1499,99')).toBe(149999)
  })

  it('rundet krumme Fliesskommaergebnisse sauber', () => {
    // 10000.5 * 100 ergibt in JavaScript nicht exakt 1000050.
    expect(inCent('10000.5')).toBe(1000050)
    expect(Number.isInteger(inCent('19.99'))).toBe(true)
  })

  it('macht aus einem leeren Feld kein Ziel von null Euro', () => {
    // Kein Ziel und ein Ziel von 0 € sind zwei verschiedene Dinge.
    expect(inCent('')).toBeNull()
    expect(inCent('   ')).toBeNull()
  })

  it('speichert bei unlesbarer Eingabe nichts statt NaN', () => {
    expect(inCent('abc')).toBeNull()
  })

  it('lehnt negative Ziele ab', () => {
    expect(inCent('-500')).toBeNull()
  })

  it('lässt eine echte Null zu', () => {
    expect(inCent('0')).toBe(0)
  })
})

describe('inEuro – Anzeige aus Cent', () => {
  it('macht aus einer Million Cent 10000 Euro', () => {
    expect(inEuro(1000000)).toBe('10000')
  })

  it('zeigt Cent als Nachkommastellen', () => {
    expect(inEuro(149999)).toBe('1499.99')
  })

  it('lässt das Feld leer, wenn kein Ziel gesetzt ist', () => {
    expect(inEuro(null)).toBe('')
  })

  it('zeigt eine echte Null als 0, nicht als leeres Feld', () => {
    expect(inEuro(0)).toBe('0')
  })
})

describe('Hin und zurück', () => {
  it('verändert einen Betrag nicht, wenn er einmal durch beide Richtungen läuft', () => {
    for (const eingabe of ['10000', '1499.99', '0', '250.5', '1']) {
      const cent = inCent(eingabe)
      expect(inEuro(cent)).toBe(String(Number(eingabe)))
    }
  })
})
