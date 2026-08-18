const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

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
