/**
 * Prüft, ob eine Antwort die Form hat, mit der eine Anzeige rechnet.
 *
 * Ein `.catch()` fängt nur den fehlgeschlagenen Abruf ab. Kommt eine Antwort
 * mit Status 200, aber ohne das erwartete Feld – ein älterer Server, ein
 * Proxy, der eine Fehlerseite als JSON zurückgibt –, läuft sie ungeprüft in
 * die Anzeige und der erste Zugriff auf eine Liste bringt die Seite zum
 * Absturz. Diese Prüfungen sind der zweite Halt hinter dem `.catch()`.
 */

/** Ist der Wert ein Objekt (und kein Array, kein null)? */
export function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

/** Hat der Wert alle genannten Felder als Array? */
export function hatListen(wert: unknown, ...felder: string[]): boolean {
  if (!istObjekt(wert)) return false
  return felder.every(feld => Array.isArray(wert[feld]))
}
