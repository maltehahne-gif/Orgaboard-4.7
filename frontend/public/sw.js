// OrgaBoard Service Worker
// Haelt die App installierbar und liefert bereits besuchte Seiten/Assets
// weiter aus, wenn das Netz kurz weg ist. Kein Offline-Sync, keine
// Hintergrund-Synchronisation - das bleibt bewusst der naechsten Ausbaustufe
// vorbehalten (siehe docs/ROADMAP.md, Phase 5.1).

const CACHE_NAME = 'orgaboard-shell-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const {request} = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // API- und WebSocket-Verkehr niemals aus dem Cache beantworten - die
  // Daten muessen immer aktuell sein.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && (request.mode === 'navigate' || url.origin === self.location.origin)) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
      .catch(() =>
        caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('/index.html') : undefined))
      )
  )
})
