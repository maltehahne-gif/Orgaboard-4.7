/**
 * Schnellaktionen für die mobile Nutzung: anrufen, mailen, navigieren.
 *
 * Eine Stelle für alle drei, weil dieselben Angaben an mehreren Stellen
 * antippbar sein sollen (Kundenakte, Routenplanung, Terminliste). Liefe das
 * auseinander, wäre eine Telefonnummer an einer Stelle wählbar und an der
 * nächsten nicht - und genau das fällt erst im Außendienst auf.
 *
 * Bei Karten bewusst zwei https-Adressen statt eines eigenen URL-Schemas:
 * beide öffnen auf dem Telefon die jeweilige Karten-App und funktionieren am
 * Rechner trotzdem im Browser. Ein `maps://` oder `geo:` würde am Schreibtisch
 * ins Leere laufen.
 */

/** Apple-Gerät? iPadOS meldet sich seit Version 13 als "Macintosh". */
export function istAppleGeraet(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}

/**
 * Telefonnummer auf das reduzieren, was in einem tel:-Link gültig ist.
 *
 * Leerzeichen, Klammern und Bindestriche sind in gepflegten Nummern üblich,
 * gehören in den Link aber nicht hinein. Ziffern, führendes Plus sowie
 * Wähl-Sonderzeichen bleiben erhalten.
 */
export function telefonnummerBereinigen(wert: string): string {
  return wert.replace(/[^0-9+*#;,]/g, '')
}

/** tel:-Adresse - leer, wenn nach dem Bereinigen keine Ziffer übrig bleibt. */
export function telHref(telefon: string | null | undefined): string {
  const nummer = telefonnummerBereinigen((telefon || '').trim())
  return /\d/.test(nummer) ? `tel:${nummer}` : ''
}

/** mailto:-Adresse - leer, wenn keine Adresse hinterlegt ist. */
export function mailHref(email: string | null | undefined): string {
  const adresse = (email || '').trim()
  return adresse ? `mailto:${adresse}` : ''
}

/**
 * Karten-Adresse für eine Anschrift, passend zum Gerät.
 *
 * Apple Maps auf Apple-Geräten, sonst Google Maps. Beides sind gleichwertige
 * Ziele - es wird nichts fest verdrahtet, was sich später nicht austauschen
 * ließe.
 */
export function kartenHref(adresse: string | null | undefined): string {
  const ziel = (adresse || '').trim()
  if (!ziel) return ''
  const kodiert = encodeURIComponent(ziel)
  return istAppleGeraet()
    ? `https://maps.apple.com/?daddr=${kodiert}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${kodiert}&travelmode=driving`
}
