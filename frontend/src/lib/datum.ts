/**
 * Kalendertage im lokalen Kalender.
 *
 * `new Date().toISOString().slice(0, 10)` liefert den Tag in UTC, nicht den
 * Tag, den der Benutzer gerade auf seiner Uhr sieht. In Deutschland
 * (UTC+1 im Winter, UTC+2 im Sommer) fällt der Unterschied zwischen
 * Mitternacht und zwei Uhr morgens an: Ein Datumsfeld schlägt dann den
 * Vortag vor, eine Wochenansicht springt eine Woche zurück. Deshalb rechnen
 * diese beiden Funktionen ausschließlich mit den lokalen Kalenderfeldern.
 */

/** Ein Datum als JJJJ-MM-TT im lokalen Kalender – ohne Umweg über UTC. */
export function isoDatum(datum: Date): string {
  const jahr = datum.getFullYear()
  const monat = `${datum.getMonth() + 1}`.padStart(2, '0')
  const tag = `${datum.getDate()}`.padStart(2, '0')
  return `${jahr}-${monat}-${tag}`
}

/** Der heutige Kalendertag als JJJJ-MM-TT, passend für ein `<input type="date">`. */
export function heuteIso(): string {
  return isoDatum(new Date())
}

/**
 * Der Montag der Woche, in der das Datum liegt.
 *
 * Die Uhrzeit wird auf die Mittagsstunde gesetzt, bevor gerechnet wird: So
 * überspringt die Verschiebung um ganze Tage keine Zeitumstellung, bei der
 * ein Tag 23 oder 25 Stunden hat.
 */
export function montagIso(datum: Date = new Date()): string {
  const mittag = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), 12, 0, 0, 0)
  const wochentag = (mittag.getDay() + 6) % 7
  mittag.setDate(mittag.getDate() - wochentag)
  return isoDatum(mittag)
}

/** Ein JJJJ-MM-TT aus dem Backend als lokales Datum – ohne UTC-Verschiebung. */
export function ausIso(wert: string): Date {
  const [jahr, monat, tag] = wert.split('-').map(Number)
  return new Date(jahr, (monat || 1) - 1, tag || 1, 12, 0, 0, 0)
}
