const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

// Name des Ereignisses, das bei einer abgelaufenen oder fehlenden Sitzung
// ausgelöst wird. AuthProvider (lib/auth.tsx) hört zentral genau hier zu und
// räumt den Auth-Zustand auf - so muss keine einzelne Seite ihr eigenes
// 401 behandeln, und die Behandlung läuft für jeden Aufruf gleich.
export const AUTH_EXPIRED_EVENT = 'orgaboard:auth-expired'

// Endpunkte, deren eigener 401 kein "Sitzung abgelaufen" bedeutet, sondern
// schlicht "falsche Zugangsdaten" bzw. Teil des Login-Vorgangs selbst ist.
// Sie laufen zwar durch dieselbe Fehlerbehandlung (Meldung aus dem Server),
// lösen aber nicht zusätzlich das globale Auth-Aufräumen aus - das wäre für
// einen falschen Tippfehler im Passwort unnötig und könnte den ohnehin schon
// angezeigten Login-Formularfehler überschreiben.
const AUTH_EVENT_EXEMPT_PATHS = ['/auth/login']

// Feldnamen, die in einer Fehlermeldung nichts zu suchen haben: FastAPI
// stellt jedem Pfad die Herkunft voran ("body", "query", "path"). Für den
// Benutzer zählt das Feld, nicht wo im HTTP-Request es stand.
const LOC_RAUSCHEN = new Set(['body', 'query', 'path', 'header', 'cookie'])

// Wie viele Einzelfehler höchstens ausgeschrieben werden. Ein Formular mit
// zwanzig Pflichtfeldern soll eine lesbare Meldung ergeben, keine Textwand.
const MAX_EINZELFEHLER = 4

/** Der Feldpfad eines FastAPI-Validierungsfehlers, z. B. "price -> source_url". */
function feldpfad(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const teile = loc
    .filter(teil => typeof teil === 'string' || typeof teil === 'number')
    .map(teil => String(teil))
    .filter(teil => !LOC_RAUSCHEN.has(teil))
  return teile.join('.')
}

/** Eine einzelne Fehlerangabe zu genau einem Satz Text. */
function einzelfehler(eintrag: unknown): string {
  if (eintrag === null || eintrag === undefined) return ''
  if (typeof eintrag === 'string') return eintrag.trim()
  if (typeof eintrag === 'number' || typeof eintrag === 'boolean') return String(eintrag)

  if (typeof eintrag === 'object') {
    const daten = eintrag as Record<string, unknown>
    // FastAPI/Pydantic: {type, loc, msg, input}. msg ist der Klartext.
    const meldung = typeof daten.msg === 'string' ? daten.msg.trim() : ''
    const feld = feldpfad(daten.loc)
    if (meldung && feld) return `${feld}: ${meldung}`
    if (meldung) return meldung

    // Andere Formen, die im Projekt vorkommen können.
    for (const schluessel of ['detail', 'message', 'error', 'reason']) {
      const wert = daten[schluessel]
      if (typeof wert === 'string' && wert.trim()) return wert.trim()
    }
  }

  return ''
}

/**
 * Macht aus dem, was der Server als `detail` liefert, einen Satz für Menschen.
 *
 * Der Server antwortet je nach Fehlerart unterschiedlich: ein HTTPException
 * liefert einen String, ein Validierungsfehler (422) eine Liste von Objekten
 * mit `loc` und `msg`. Wer diese Liste ungeprüft in eine Zeichenkette steckt,
 * bekommt "[object Object]" auf den Bildschirm - für den Benutzer schlicht
 * keine Information. Deshalb läuft jede Fehlermeldung durch diese eine
 * Stelle, statt dass jede Seite ihr eigenes Raten anstellt.
 */
export function fehlertextAus(detail: unknown, ersatz: string): string {
  if (detail === null || detail === undefined) return ersatz

  if (typeof detail === 'string') return detail.trim() || ersatz

  if (Array.isArray(detail)) {
    const saetze = detail.map(einzelfehler).filter(Boolean)
    if (!saetze.length) return ersatz
    const sichtbar = saetze.slice(0, MAX_EINZELFEHLER)
    const rest = saetze.length - sichtbar.length
    return sichtbar.join('; ') + (rest > 0 ? ` (und ${rest} weitere)` : '')
  }

  return einzelfehler(detail) || ersatz
}

function csrfToken(): string {
  const match = document.cookie.split('; ').find(x => x.startsWith('orgaboard_csrf='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json')
  if (!['GET','HEAD','OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken())
  const response = await fetch(`${BASE}${path}`, {...options, headers, credentials:'include'})
  if (!response.ok) {
    const ersatz = `Fehler ${response.status}`
    let detail: unknown = null
    try { detail = (await response.json())?.detail } catch {}
    if (response.status === 401 && !AUTH_EVENT_EXEMPT_PATHS.includes(path)) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    throw new Error(fehlertextAus(detail, ersatz))
  }
  if (response.status === 204) return undefined as T
  const ct = response.headers.get('content-type') || ''
  return ct.includes('application/json') ? response.json() : (response as unknown as T)
}

export async function downloadFile(path:string, fallbackName:string) {
  const response = await api<Response>(path)
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = /filename="?([^"]+)"?/.exec(disposition)
  const filename = match ? match[1] : fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function money(cents:number|null|undefined) {
  if (cents === null || cents === undefined) return '–'
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100)
}

export function formatDateTime(value:string|null|undefined) {
  if (!value) return '–'
  // Fest in Europe/Berlin, unabhängig von der Systemzeitzone des Geräts -
  // siehe lib/datum.ts. Zwei Mitarbeiter sollen dieselbe Uhrzeit lesen,
  // auch wenn einer von ihnen gerade im Ausland unterwegs ist.
  return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(value))
}
