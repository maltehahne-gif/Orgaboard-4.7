// OrgaBoard Service Worker
// Haelt die App installierbar, liefert bereits besuchte Seiten/Assets weiter
// aus, wenn das Netz kurz weg ist, und nimmt Push-Benachrichtigungen an.
// Kein Offline-Sync, keine Hintergrund-Synchronisation - das bleibt bewusst
// der naechsten Ausbaustufe vorbehalten (siehe docs/ROADMAP.md, Phase 5.1).

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


// --------------------------------------------------------------- Push
// Der Server verschickt eine JSON-Nutzlast (siehe services/webpush.py).
// Faellt sie aus irgendeinem Grund weg oder ist unlesbar, wird trotzdem
// etwas angezeigt: eine stumme Push-Nachricht ist in manchen Browsern ein
// Regelverstoss und kann die Push-Erlaubnis kosten.
self.addEventListener('push', event => {
  let daten = {}
  try {
    daten = event.data ? event.data.json() : {}
  } catch (fehler) {
    daten = {}
  }

  const titel = daten.title || 'OrgaBoard'
  const optionen = {
    body: daten.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'de',
    // Gleichartiges ersetzt sich gegenseitig, statt sich zu stapeln.
    tag: daten.kind || 'orgaboard',
    data: {link: daten.link || '/', id: daten.id || null},
  }

  event.waitUntil(self.registration.showNotification(titel, optionen))
})


self.addEventListener('notificationclick', event => {
  event.notification.close()
  const ziel = (event.notification.data && event.notification.data.link) || '/'

  // Ist die App schon offen, dorthin wechseln statt einen zweiten Tab
  // aufzumachen - sonst sammeln sich ueber den Tag mehrere Fenster an.
  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(fenster => {
      for (const client of fenster) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(ziel).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(ziel)
    })
  )
})
