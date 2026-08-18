/**
 * Realtime-Verbindung mit automatischem Reconnect.
 *
 * Die alte Fassung öffnete genau einen WebSocket und ließ ihn bei jedem
 * onclose tot liegen - WLAN-Wechsel, Standby oder ein Server-Neustart
 * beendeten Realtime dauerhaft, bis die Seite neu geladen wurde. Diese
 * Fassung baut die Verbindung mit exponentiellem Backoff selbst wieder auf,
 * verbindet sofort neu, sobald der Browser das online-Ereignis meldet, und
 * schickt in ruhigen Phasen ein leichtes Ping - der Server liest ohnehin
 * jeden Text und verwirft ihn (siehe backend/app/main.py), das hält die
 * Verbindung durch NAT/Proxy-Timeouts hindurch am Leben.
 *
 * Die aufrufende Seite bekommt dieselbe Schnittstelle wie vorher:
 * connectRealtime(onEvent) liefert eine Funktion, die die Verbindung endgültig
 * schließt (React-Aufräumfunktion bei Unmount).
 */

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const HEARTBEAT_MS = 25_000

export function connectRealtime(onEvent: (event: any) => void) {
  let socket: WebSocket | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let closedByCaller = false

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (closedByCaller) return
    if (reconnectTimer) return
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  function open() {
    if (closedByCaller) return

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/ws/updates`)
    socket = ws

    ws.onopen = () => {
      reconnectAttempt = 0
      ws.send('ready')
      stopHeartbeat()
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, HEARTBEAT_MS)
    }

    ws.onmessage = event => {
      try { onEvent(JSON.parse(event.data)) } catch { /* kein gültiges Ereignis */ }
    }

    ws.onclose = () => {
      // Ein bereits ersetzter oder absichtlich geschlossener Socket meldet
      // sich hier nicht mehr zu Wort - sonst würden zwei Verbindungen um den
      // nächsten Reconnect konkurrieren.
      if (socket !== ws) return
      stopHeartbeat()
      socket = null
      scheduleReconnect()
    }

    ws.onerror = () => {
      // onclose folgt in jedem Browser unmittelbar danach; dort passiert die
      // eigentliche Aufräum- und Reconnect-Logik.
    }
  }

  open()

  function handleOnline() {
    // Nicht auf den nächsten Backoff-Schritt warten: sobald das Netz wieder
    // da ist, sofort neu verbinden.
    if (closedByCaller) return
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      reconnectAttempt = 0
      open()
    }
  }
  window.addEventListener('online', handleOnline)

  return () => {
    closedByCaller = true
    window.removeEventListener('online', handleOnline)
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    stopHeartbeat()
    if (socket) {
      const ws = socket
      socket = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close()
    }
  }
}
