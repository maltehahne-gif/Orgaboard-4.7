/**
 * Prüfung der Positionen in Angeboten und Verkäufen.
 *
 * Beide Formulare rechnen Preis und Menge selbst in die Werte um, die das
 * Backend erwartet (`unit_price_cents`, `quantity`). Dabei kann still etwas
 * Unbrauchbares entstehen: `Number('abc')` ist NaN, `Math.round(NaN)` ist
 * NaN, und `JSON.stringify` macht daraus `null`. Der Server antwortet dann
 * mit einem Validierungsfehler zu einem Feld, das der Benutzer im Formular
 * gar nicht sieht.
 *
 * Deshalb wird hier vor dem Absenden geprüft - an einer Stelle für beide
 * Formulare, damit Angebot und Verkauf nicht unterschiedlich streng sind.
 */

export type Position = {
  product_id: string
  quantity: number | string
  price_eur: string
}

// Dieselbe Obergrenze wie MAX_PREIS_CENT in backend/app/routers/products.py:
// 100.000 Euro. Sie fängt eine verrutschte Null ab, bevor der Betrag in
// Angebote, Verkäufe und Auswertungen einfließt.
export const MAX_PREIS_EUR = 100_000

// Eine Position mit 1.000 Geräten ist keine Bestellung, sondern ein
// Tippfehler.
export const MAX_MENGE = 999

// Deutsche Schreibweise: Komma trennt die Nachkommastellen, Punkte
// gruppieren die Tausender. "1.299,00", "949,50", "1299,00".
const DEUTSCH = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/
// Ohne Komma gilt der Punkt als Dezimaltrennzeichen - dieselbe Lesart wie
// _betrag_in_cent in backend/app/routers/products.py. "1299", "1299.00".
const ENGLISCH = /^-?\d+(\.\d+)?$/

/**
 * Betrag aus einer Texteingabe - oder NaN, wenn die Eingabe unbrauchbar ist.
 *
 * Bewusst über feste Muster statt über Number(): `Number('')` ist 0 und
 * `Number('1e5')` wäre 100.000. Beides würde als Preis durchgehen, ohne
 * dass jemand das eingetippt hätte. Halbgare Mischformen wie "1,2.3"
 * ergeben ebenfalls NaN, statt still zu einer Zahl umgedeutet zu werden.
 */
export function betragAusText(text: string): number {
  const roh = text.trim().replace(/\s|€/g, '')
  if (!roh) return NaN

  if (roh.includes(',')) {
    if (!DEUTSCH.test(roh)) return NaN
    return Number(roh.replace(/\./g, '').replace(',', '.'))
  }

  return ENGLISCH.test(roh) ? Number(roh) : NaN
}

/**
 * Erste unbrauchbare Position als verständlicher Satz - oder null.
 *
 * Bewusst mit Positionsnummer: bei fünf Zeilen hilft "Bitte ein Produkt
 * auswählen" nicht weiter, wenn offen bleibt, welche Zeile gemeint ist.
 */
export function positionenFehler(positionen: Position[]): string | null {
  if (!positionen.length) return 'Bitte mindestens eine Position eintragen.'

  for (const [index, position] of positionen.entries()) {
    const nummer = index + 1

    if (!position.product_id) {
      return `Position ${nummer}: bitte ein Produkt auswählen.`
    }

    const menge = Number(position.quantity)
    if (!Number.isFinite(menge) || !Number.isInteger(menge)) {
      return `Position ${nummer}: die Menge ist keine ganze Zahl.`
    }
    if (menge <= 0) {
      return `Position ${nummer}: die Menge muss mindestens 1 sein.`
    }
    if (menge > MAX_MENGE) {
      return `Position ${nummer}: die Menge darf höchstens ${MAX_MENGE} sein.`
    }

    const preis = betragAusText(position.price_eur)
    if (!Number.isFinite(preis)) {
      return `Position ${nummer}: „${position.price_eur.trim()}“ ist kein gültiger Preis.`
    }
    if (preis < 0) {
      return `Position ${nummer}: der Preis kann nicht negativ sein.`
    }
    if (preis > MAX_PREIS_EUR) {
      return `Position ${nummer}: der Preis liegt über ${MAX_PREIS_EUR.toLocaleString('de-DE')} €.`
    }
  }

  return null
}

/** Der geprüfte Betrag in Cent - erst nach positionenFehler() aufrufen. */
export function preisInCent(text: string): number {
  return Math.round(betragAusText(text) * 100)
}
