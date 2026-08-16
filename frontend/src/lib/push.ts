/**
 * Push-Benachrichtigungen im Browser an- und abmelden.
 *
 * Der Ablauf ist in jedem Browser derselbe: Erlaubnis erfragen, sich beim
 * Push-Dienst des Herstellers anmelden, den erhaltenen Endpunkt beim eigenen
 * Server hinterlegen. Der Server kennt nur diesen Endpunkt - wer die
 * Nachricht am Ende ausliefert, ist ihm gleich.
 *
 * Bewusst ohne Bibliothek: es sind zwei Browser-Schnittstellen und eine
 * Schlüsselumwandlung.
 */
import {api} from './api'

export type PushZustand =
  | 'nicht-unterstuetzt'   // Browser kann kein Push (z. B. iOS-Safari im Tab)
  | 'nicht-eingerichtet'   // Server hat keine VAPID-Schlüssel
  | 'blockiert'            // Benutzer hat die Erlaubnis verweigert
  | 'aus'                  // möglich, aber nicht angemeldet
  | 'an'                   // angemeldet

/** Kann dieser Browser überhaupt Push? */
export function pushUnterstuetzt(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Der VAPID-Schlüssel kommt als URL-sicheres Base64 ohne Auffüllzeichen;
 * die Browser-Schnittstelle will rohe Bytes.
 */
function schluesselZuBytes(base64: string) {
  const auffuellung = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + auffuellung).replace(/-/g, '+').replace(/_/g, '/')
  const roh = window.atob(normal)
  // Der Puffer wird ausdrücklich angelegt und übergeben. `new Uint8Array(n)`
  // liefert in neueren TypeScript-Fassungen einen Typ, der auch auf einem
  // SharedArrayBuffer liegen könnte - den nimmt applicationServerKey nicht an.
  const bytes = new Uint8Array(new ArrayBuffer(roh.length))
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i)
  return bytes
}

async function anmeldungHolen(): Promise<PushSubscription | null> {
  const registrierung = await navigator.serviceWorker.ready
  return registrierung.pushManager.getSubscription()
}

/** Aktueller Zustand, ohne etwas zu verändern. */
export async function pushZustand(verfuegbar: boolean): Promise<PushZustand> {
  if (!pushUnterstuetzt()) return 'nicht-unterstuetzt'
  if (!verfuegbar) return 'nicht-eingerichtet'
  if (Notification.permission === 'denied') return 'blockiert'
  const anmeldung = await anmeldungHolen().catch(() => null)
  return anmeldung ? 'an' : 'aus'
}

/**
 * Push einschalten: Erlaubnis erfragen, anmelden, beim Server hinterlegen.
 * Gibt den erreichten Zustand zurück.
 */
export async function pushEinschalten(): Promise<PushZustand> {
  if (!pushUnterstuetzt()) return 'nicht-unterstuetzt'

  const {public_key: schluessel, available} = await api<{public_key: string | null; available: boolean}>(
    '/notifications/push/public-key',
  )
  if (!available || !schluessel) return 'nicht-eingerichtet'

  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted') return erlaubnis === 'denied' ? 'blockiert' : 'aus'

  const registrierung = await navigator.serviceWorker.ready
  // Eine bestehende Anmeldung wiederverwenden - erneutes subscribe() mit
  // demselben Schlüssel liefert ohnehin dieselbe zurück.
  const anmeldung =
    (await registrierung.pushManager.getSubscription()) ??
    (await registrierung.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: schluesselZuBytes(schluessel),
    }))

  const roh = anmeldung.toJSON() as {endpoint?: string; keys?: {p256dh?: string; auth?: string}}
  if (!roh.endpoint || !roh.keys?.p256dh || !roh.keys?.auth) return 'aus'

  await api('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: roh.endpoint,
      p256dh: roh.keys.p256dh,
      auth: roh.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    }),
  })
  return 'an'
}

/**
 * Push ausschalten: beim Server abmelden und die Anmeldung im Browser lösen.
 *
 * Zuerst der Server: schlägt das fehl, bleibt die Anmeldung im Browser
 * bestehen und ein erneuter Versuch ist möglich. Andersherum bekäme der
 * Server weiterhin Zustellversuche für ein Gerät, das nichts mehr annimmt.
 */
export async function pushAusschalten(): Promise<PushZustand> {
  const anmeldung = await anmeldungHolen().catch(() => null)
  if (!anmeldung) return 'aus'

  const roh = anmeldung.toJSON() as {endpoint?: string}
  if (roh.endpoint) {
    await api('/notifications/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({endpoint: roh.endpoint}),
    })
  }
  await anmeldung.unsubscribe().catch(() => {})
  return 'aus'
}
