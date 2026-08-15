import {describe, expect, it} from 'vitest'
import {formatDateTime, money} from './api'

/* Beträge und Datumsangaben stehen auf jeder Seite. Wenn die Formatierung
   kippt, sieht das nicht nach einem Fehler aus, sondern nach einer falschen
   Zahl - deshalb hier festgenagelt. */

describe('money', () => {
  it('schreibt Beträge deutsch mit Komma und Tausenderpunkt', () => {
    // Intl setzt ein schmales geschütztes Leerzeichen vor das Zeichen.
    expect(money(129900).replace(/ | /g, ' ')).toBe('1.299,00 €')
  })

  it('rundet Centbeträge nicht weg', () => {
    expect(money(149999).replace(/ | /g, ' ')).toBe('1.499,99 €')
  })

  it('zeigt einen Strich statt 0,00 €, wenn nichts hinterlegt ist', () => {
    // Ein fehlender Preis ist etwas anderes als ein Preis von null.
    expect(money(null)).toBe('–')
    expect(money(undefined)).toBe('–')
  })

  it('unterscheidet null von einer echten Null', () => {
    expect(money(0)).not.toBe('–')
  })

  it('stellt negative Beträge dar, statt sie zu verschlucken', () => {
    expect(money(-5000)).toContain('50,00')
  })
})

describe('formatDateTime', () => {
  it('schreibt Datum und Uhrzeit deutsch', () => {
    const text = formatDateTime('2026-08-15T09:30:00Z')
    expect(text).toContain('2026')
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  it('zeigt einen Strich, wenn kein Zeitpunkt vorliegt', () => {
    expect(formatDateTime(null)).toBe('–')
    expect(formatDateTime(undefined)).toBe('–')
    expect(formatDateTime('')).toBe('–')
  })
})
