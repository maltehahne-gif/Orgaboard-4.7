import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {connectRealtime} from './realtime'

/**
 * jsdom hat kein funktionierendes WebSocket, das sich testen ließe - dieser
 * Ersatz verhält sich wie ein echter Socket (readyState, send, close,
 * onopen/onclose/onmessage/onerror) und lässt sich aus dem Test heraus
 * steuern (triggerOpen/triggerClose/triggerMessage).
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: {data: string}) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    // Ein echter Browser ruft onclose asynchron auf eigene Initiative auf,
    // nicht synchron durch close() selbst - das spiegelt sich hier darin,
    // dass die Aufräumfunktion onclose vor dem close()-Aufruf entfernt.
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  triggerClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  triggerMessage(payload: unknown) {
    this.onmessage?.({data: JSON.stringify(payload)})
  }
}

function letzte(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Realtime-Verbindung', () => {
  it('verbindet sich normal und meldet sich mit "ready"', () => {
    const disconnect = connectRealtime(() => {})
    expect(MockWebSocket.instances).toHaveLength(1)

    letzte().triggerOpen()
    expect(letzte().sent).toContain('ready')

    disconnect()
  })

  it('reicht eingehende Nachrichten an den Callback weiter', () => {
    const events: unknown[] = []
    const disconnect = connectRealtime(event => events.push(event))
    letzte().triggerOpen()

    letzte().triggerMessage({type: 'data.changed', entity: 'sale'})
    expect(events).toEqual([{type: 'data.changed', entity: 'sale'}])

    disconnect()
  })

  it('verbindet nach einem Abbruch automatisch neu, mit steigender Wartezeit', () => {
    const disconnect = connectRealtime(() => {})
    letzte().triggerOpen()
    expect(MockWebSocket.instances).toHaveLength(1)

    // Erster Abbruch: Reconnect nach der Basiswartezeit (1s).
    letzte().triggerClose()
    vi.advanceTimersByTime(999)
    expect(MockWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Zweiter Abbruch, ohne dass die neue Verbindung je offen war: die
    // Wartezeit verdoppelt sich (2s), spammt also nicht sofort erneut.
    letzte().triggerClose()
    vi.advanceTimersByTime(1999)
    expect(MockWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockWebSocket.instances).toHaveLength(3)

    disconnect()
  })

  it('setzt die Wartezeit nach einer erfolgreichen Verbindung zurück', () => {
    const disconnect = connectRealtime(() => {})
    letzte().triggerOpen()
    letzte().triggerClose()
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Diesmal wird die Verbindung erfolgreich - der nächste Abbruch soll
    // wieder mit der kurzen Basiswartezeit beginnen, nicht mit 4s.
    letzte().triggerOpen()
    letzte().triggerClose()
    vi.advanceTimersByTime(999)
    expect(MockWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(MockWebSocket.instances).toHaveLength(3)

    disconnect()
  })

  it('öffnet nie zwei Verbindungen gleichzeitig', () => {
    const disconnect = connectRealtime(() => {})
    expect(MockWebSocket.instances).toHaveLength(1)
    letzte().triggerOpen()

    // Ohne Abbruch darf über die Zeit keine zweite Verbindung entstehen.
    vi.advanceTimersByTime(60_000)
    expect(MockWebSocket.instances).toHaveLength(1)

    disconnect()
  })

  it('schickt in ruhigen Phasen ein Ping, damit die Verbindung nicht wegen Inaktivität fällt', () => {
    const disconnect = connectRealtime(() => {})
    letzte().triggerOpen()

    vi.advanceTimersByTime(25_000)
    expect(letzte().sent).toContain('ping')

    disconnect()
  })

  it('verbindet sofort neu, sobald der Browser wieder online ist', () => {
    const disconnect = connectRealtime(() => {})
    letzte().triggerOpen()
    letzte().triggerClose()
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Zweiter Abbruch - würde normalerweise 2s auf den nächsten Versuch
    // warten. Das online-Ereignis soll das nicht abwarten.
    letzte().triggerClose()
    expect(MockWebSocket.instances).toHaveLength(2)

    window.dispatchEvent(new Event('online'))
    expect(MockWebSocket.instances).toHaveLength(3)

    disconnect()
  })

  it('ignoriert ein zweites onclose auf derselben, bereits ersetzten Verbindung', () => {
    const disconnect = connectRealtime(() => {})
    const erste = letzte()
    erste.triggerOpen()

    erste.triggerClose()
    // Manche Browser feuern onclose in Randfällen mehrfach für denselben
    // Socket - das darf keinen zweiten, parallelen Reconnect anstoßen.
    erste.triggerClose()

    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    disconnect()
  })

  it('schließt bei Unmount sauber und verbindet danach nicht mehr neu', () => {
    const disconnect = connectRealtime(() => {})
    const erste = letzte()
    erste.triggerOpen()

    disconnect()
    expect(erste.readyState).toBe(MockWebSocket.CLOSED)

    // Weder ein Abbruch der (jetzt geschlossenen) Verbindung noch verstrichene
    // Zeit noch ein online-Ereignis dürfen nach dem Unmount neu verbinden.
    erste.triggerClose()
    vi.advanceTimersByTime(60_000)
    window.dispatchEvent(new Event('online'))
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('entfernt den online-Listener bei Unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const disconnect = connectRealtime(() => {})
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function))

    disconnect()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
  })
})
