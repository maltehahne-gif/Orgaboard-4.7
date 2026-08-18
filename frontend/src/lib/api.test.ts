import {afterEach, describe, expect, it, vi} from 'vitest'
import {api, AUTH_EXPIRED_EVENT, formatDateTime, money} from './api'

/* Beträge und Datumsangaben stehen auf jeder Seite. Wenn die Formatierung
   kippt, sieht das nicht nach einem Fehler aus, sondern nach einer falschen
   Zahl - deshalb hier festgenagelt. */

describe('money', () => {
  it('schreibt Beträge deutsch mit Komma und Tausenderpunkt', () => {
    // Intl setzt ein schmales geschütztes Leerzeichen vor das Zeichen.
    expect(money(129900).replace(/ | /g, ' ')).toBe('1.299,00 €')
  })

  it('rundet Centbeträge nicht weg', () => {
    expect(money(149999).replace(/ | /g, ' ')).toBe('1.499,99 €')
  })

  it('zeigt einen Strich statt 0,00 €, wenn nichts hinterlegt ist', () => {
    // Ein fehlender Preis ist etwas anderes als ein Preis von null.
    expect(money(null)).toBe('–')
    expect(money(undefined)).toBe('–')
  })

  it('unterscheidet null von einer echten Null', () => {
    expect(money(0)).not.toBe('–')
  })

  it('stellt negative Beträge dar, statt sie zu verschlucken', () => {
    expect(money(-5000)).toContain('50,00')
  })
})

describe('formatDateTime', () => {
  it('schreibt Datum und Uhrzeit deutsch', () => {
    const text = formatDateTime('2026-08-15T09:30:00Z')
    expect(text).toContain('2026')
    expect(text).toMatch(/\d{2}:\d{2}/)
  })

  it('zeigt einen Strich, wenn kein Zeitpunkt vorliegt', () => {
    expect(formatDateTime(null)).toBe('–')
    expect(formatDateTime(undefined)).toBe('–')
    expect(formatDateTime('')).toBe('–')
  })
})

/* Zentrale 401-Behandlung: jeder Aufruf über api() meldet eine abgelaufene
   oder fehlende Sitzung über ein einziges Ereignis, statt dass jede Seite es
   selbst behandeln muss (siehe lib/auth.tsx, das genau darauf hört). */
describe('api – abgelaufene Sitzung', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubResponse(status: number, detail: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({detail}), {status, headers: {'content-type': 'application/json'}}),
      ),
    )
  }

  it('löst bei 401 das Auth-Ereignis aus', async () => {
    stubResponse(401, 'Nicht angemeldet')
    const handler = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, handler)

    await expect(api('/sales')).rejects.toThrow('Nicht angemeldet')
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
  })

  it('löst das Ereignis bei anderen Fehlern nicht aus', async () => {
    stubResponse(403, 'Kein Zugriff')
    const handler = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, handler)

    await expect(api('/sales')).rejects.toThrow('Kein Zugriff')
    expect(handler).not.toHaveBeenCalled()

    window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
  })

  it('löst das Ereignis bei einem falschen Login-Passwort nicht aus', async () => {
    // Ein 401 beim Login-Versuch selbst ist "falsches Passwort", keine
    // abgelaufene Sitzung - das globale Aufräumen würde hier nichts
    // Sinnvolles tun und könnte die Login-Fehlermeldung verwirren.
    stubResponse(401, 'E-Mail oder Passwort ist falsch')
    const handler = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, handler)

    await expect(api('/auth/login', {method: 'POST', body: '{}'})).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()

    window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
  })
})
