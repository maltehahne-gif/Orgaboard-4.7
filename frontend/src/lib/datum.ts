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

/**
 * Uhrzeiten für `<input type="datetime-local">` – fest in Europe/Berlin.
 *
 * `new Date().toISOString().slice(0, 16)` liefert die Uhrzeit in UTC und
 * setzt sie unverändert als Vorgabewert eines datetime-local-Felds ein. Der
 * Browser zeigt diesen Wert als Ortszeit an - im Sommer zwei, im Winter eine
 * Stunde neben der tatsächlichen Uhrzeit. Bleibt der Vorschlag unverändert
 * stehen, landet beim Zurückrechnen (`new Date(wert).toISOString()`) ein
 * Zeitpunkt, der ebenso weit daneben liegt.
 *
 * Die Umrechnung hier hängt bewusst nicht an der Systemzeitzone des
 * Geräts, sondern fest an Europe/Berlin - demselben Wert, den das Backend
 * als BUSINESS_TIMEZONE verwendet (siehe backend/app/core/timeutils.py).
 * Ein Systemadministrator, der von außerhalb Deutschlands zugreift, soll
 * dieselbe Ortszeit sehen wie ein Mitarbeiter vor Ort - nicht seine eigene.
 */
export const GESCHAEFTSZEITZONE = 'Europe/Berlin'

function zonenteile(datum: Date, zeitzone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zeitzone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const teile: Record<string, string> = {}
  for (const teil of formatter.formatToParts(datum)) {
    if (teil.type !== 'literal') teile[teil.type] = teil.value
  }
  return teile
}

/** Wie weit `zeitzone` an diesem Zeitpunkt gegenüber UTC liegt, in Minuten. */
function zonenversatzMinuten(zeitpunktMs: number, zeitzone: string): number {
  const teile = zonenteile(new Date(zeitpunktMs), zeitzone)
  const alsUtc = Date.UTC(
    Number(teile.year), Number(teile.month) - 1, Number(teile.day),
    Number(teile.hour), Number(teile.minute), Number(teile.second),
  )
  return (alsUtc - zeitpunktMs) / 60_000
}

/** Ein Zeitpunkt als „JJJJ-MM-TTTHH:mm“ in der Ortszeit von `zeitzone`. */
export function lokaleZeiteingabe(wert: Date | string = new Date(), zeitzone: string = GESCHAEFTSZEITZONE): string {
  const datum = wert instanceof Date ? wert : new Date(wert)
  const teile = zonenteile(datum, zeitzone)
  return `${teile.year}-${teile.month}-${teile.day}T${teile.hour}:${teile.minute}`
}

/**
 * Der Wert eines datetime-local-Felds (Ortszeit in `zeitzone`) als ISO-Zeit
 * in UTC – fürs Absenden ans Backend.
 *
 * Zwei Durchläufe: der erste behandelt die eingegebene Uhrzeit versehentlich
 * als UTC, um einen groben Versatz zu bekommen; der zweite prüft, ob genau an
 * diesem Zeitpunkt die Zeitumstellung greift und der Versatz sich dadurch
 * ändert (Nacht der Umstellung Ende März/Ende Oktober) - erst dann steht die
 * tatsächlich gültige Differenz fest.
 */
export function zeiteingabeZuIso(wert: string, zeitzone: string = GESCHAEFTSZEITZONE): string {
  const [datumsteil, zeitteil] = wert.split('T')
  const [jahr, monat, tag] = datumsteil.split('-').map(Number)
  const [stunde, minute] = (zeitteil || '00:00').split(':').map(Number)
  const grobUtc = Date.UTC(jahr, (monat || 1) - 1, tag || 1, stunde || 0, minute || 0, 0)

  const versatz1 = zonenversatzMinuten(grobUtc, zeitzone)
  let echtUtc = grobUtc - versatz1 * 60_000

  const versatz2 = zonenversatzMinuten(echtUtc, zeitzone)
  if (versatz2 !== versatz1) {
    echtUtc = grobUtc - versatz2 * 60_000
  }

  return new Date(echtUtc).toISOString()
}

/** Der aktuelle Zeitpunkt als datetime-local-Vorgabewert in Europe/Berlin. */
export function jetztLokal(zeitzone: string = GESCHAEFTSZEITZONE): string {
  return lokaleZeiteingabe(new Date(), zeitzone)
}
