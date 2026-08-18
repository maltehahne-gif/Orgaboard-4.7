import {afterEach, describe, expect, it, vi} from 'vitest'
import {ausIso, heuteIso, isoDatum, jetztLokal, lokaleZeiteingabe, montagIso, zeiteingabeZuIso} from './datum'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Diese Tests halten fest, was der Umweg über UTC kaputt gemacht hat:
 * In Deutschland ist es um 00:30 Ortszeit in UTC noch der Vortag. Ein
 * Datumsfeld, das seinen Vorschlag aus `toISOString()` zieht, schlägt dann
 * gestern vor – und die Wochenansicht springt eine ganze Woche zurück.
 */
describe('Kalendertage im lokalen Kalender', () => {
  it('läuft in einer Zeitzone, in der sich der Fehler überhaupt zeigen kann', () => {
    // Ohne Abstand zu UTC waeren alle folgenden Tests wirkungslos: Die alte,
    // fehlerhafte Umrechnung ueber toISOString() bestuende sie samt und
    // sonders. Die Zeitzone kommt aus vite.config.ts.
    expect(new Date(2026, 7, 17).getTimezoneOffset()).not.toBe(0)
  })

  it('nimmt den lokalen Tag, nicht den UTC-Tag', () => {
    // Lokale Mitternachtsstunde: östlich von UTC ist es in UTC noch gestern.
    const nachMitternacht = new Date(2026, 7, 17, 0, 30)
    expect(isoDatum(nachMitternacht)).toBe('2026-08-17')
  })

  it('füllt Monat und Tag auf zwei Stellen auf', () => {
    expect(isoDatum(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05')
  })

  it('liefert heute als den Tag, den der Benutzer auf der Uhr sieht', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 17, 0, 30))
    expect(heuteIso()).toBe('2026-08-17')
  })

  it('findet den Montag der laufenden Woche', () => {
    // Montag, 17.08.2026 – der Montag ist er selbst.
    expect(montagIso(new Date(2026, 7, 17, 14, 0))).toBe('2026-08-17')
    // Sonntag, 23.08.2026 – gehört noch zur selben Woche.
    expect(montagIso(new Date(2026, 7, 23, 23, 45))).toBe('2026-08-17')
    // Mittwoch, 19.08.2026.
    expect(montagIso(new Date(2026, 7, 19, 6, 0))).toBe('2026-08-17')
  })

  it('springt in der Nacht auf Montag nicht in die Vorwoche', () => {
    // Genau der Fall, der mit toISOString() eine Woche zurücksprang.
    expect(montagIso(new Date(2026, 7, 17, 0, 30))).toBe('2026-08-17')
  })

  it('liest ein Datum aus dem Backend als lokalen Tag zurück', () => {
    const datum = ausIso('2026-08-17')
    expect(datum.getFullYear()).toBe(2026)
    expect(datum.getMonth()).toBe(7)
    expect(datum.getDate()).toBe(17)
  })

  it('bleibt beim Hin- und Herrechnen beim selben Tag', () => {
    for (const tag of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(isoDatum(ausIso(tag))).toBe(tag)
    }
  })

  it('überspringt beim Weiterzählen keine Zeitumstellung', () => {
    // 29.03.2026 ist in Deutschland die kurze Nacht (23 Stunden).
    const d = ausIso('2026-03-28')
    d.setDate(d.getDate() + 1)
    expect(isoDatum(d)).toBe('2026-03-29')
    d.setDate(d.getDate() + 1)
    expect(isoDatum(d)).toBe('2026-03-30')
  })
})

/**
 * `toISOString().slice(0, 16)` liefert die Uhrzeit in UTC. In Deutschland
 * weicht das im Sommer um zwei, im Winter um eine Stunde von der Ortszeit ab
 * - genau der Fehler, den lokaleZeiteingabe/zeiteingabeZuIso beheben.
 */
describe('Uhrzeiten für datetime-local in Europe/Berlin', () => {
  it('zeigt einen UTC-Zeitpunkt im Sommer (Sommerzeit, UTC+2) als Ortszeit', () => {
    // 15.07.2026, 12:00 UTC = 14:00 Ortszeit (CEST).
    const zeitpunkt = new Date(Date.UTC(2026, 6, 15, 12, 0, 0))
    expect(lokaleZeiteingabe(zeitpunkt)).toBe('2026-07-15T14:00')
  })

  it('zeigt einen UTC-Zeitpunkt im Winter (Winterzeit, UTC+1) als Ortszeit', () => {
    // 15.01.2026, 12:00 UTC = 13:00 Ortszeit (CET).
    const zeitpunkt = new Date(Date.UTC(2026, 0, 15, 12, 0, 0))
    expect(lokaleZeiteingabe(zeitpunkt)).toBe('2026-01-15T13:00')
  })

  it('rechnet eine Sommerzeit-Eingabe korrekt in UTC um', () => {
    expect(zeiteingabeZuIso('2026-07-15T14:00')).toBe('2026-07-15T12:00:00.000Z')
  })

  it('rechnet eine Winterzeit-Eingabe korrekt in UTC um', () => {
    expect(zeiteingabeZuIso('2026-01-15T13:00')).toBe('2026-01-15T12:00:00.000Z')
  })

  it('liefert für "jetzt" denselben Wert wie lokaleZeiteingabe(new Date())', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 6, 15, 12, 0, 0)))
    expect(jetztLokal()).toBe('2026-07-15T14:00')
  })

  it('bleibt beim Hin- und Herrechnen rund um beide Zeitumstellungen beim selben Wert', () => {
    // 29.03.2026: Umstellung auf Sommerzeit. 25.10.2026: Umstellung auf
    // Winterzeit. Absichtlich außerhalb der übersprungenen bzw.
    // doppeldeutigen Stunde selbst - die Umrechnung an den Tagen drumherum
    // muss trotzdem exakt stimmen.
    for (const wert of [
      '2026-03-28T10:00',
      '2026-03-30T10:00',
      '2026-10-24T10:00',
      '2026-10-26T10:00',
      '2026-01-01T00:05',
      '2026-12-31T23:55',
    ]) {
      expect(lokaleZeiteingabe(zeiteingabeZuIso(wert))).toBe(wert)
    }
  })

  it('behandelt eine bereits gespeicherte ISO-Zeit aus dem Backend korrekt', () => {
    // Wie sie z. B. als sold_at oder issued_at zurückkommt.
    expect(lokaleZeiteingabe('2026-08-17T09:30:00.000Z')).toBe('2026-08-17T11:30')
  })
})
