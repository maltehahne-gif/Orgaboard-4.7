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
    let detail = `Fehler ${response.status}`
    try { const data = await response.json(); detail = data.detail || detail } catch {}
    if (response.status === 401 && !AUTH_EVENT_EXEMPT_PATHS.includes(path)) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    throw new Error(detail)
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

/** Nur der Tag - für Tabellen, die Datum und Uhrzeit in eigenen Spalten
 *  führen. Dieselbe feste Zeitzone wie formatDateTime(). */
export function formatDate(value:string|null|undefined) {
  if (!value) return '–'
  return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'Europe/Berlin'}).format(new Date(value))
}

/** Nur die Uhrzeit, passend zu formatDate(). */
export function formatTime(value:string|null|undefined) {
  if (!value) return '–'
  return new Intl.DateTimeFormat('de-DE',{timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(value))
}
