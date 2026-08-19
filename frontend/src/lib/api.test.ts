import {afterEach, describe, expect, it, vi} from 'vitest'
import {api, AUTH_EXPIRED_EVENT, fehlertextAus, formatDateTime, money} from './api'

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

/* Zentrale Fehlernormalisierung: FastAPI liefert bei Validierungsfehlern
   (422) eine Liste von Objekten. Landet die ungeprüft in einer Meldung,
   liest der Benutzer "[object Object]" statt zu erfahren, welches Feld
   fehlt. Diese Tests halten fest, dass das nie wieder passieren kann. */
describe('fehlertextAus', () => {
  it('reicht eine einfache Server-Meldung unverändert durch', () => {
    expect(fehlertextAus('Produkt nicht gefunden', 'Fehler 404')).toBe('Produkt nicht gefunden')
  })

  it('macht aus einem FastAPI-Validierungsfehler Feld und Meldung', () => {
    const detail = [{type: 'missing', loc: ['body', 'source_url'], msg: 'Field required'}]
    expect(fehlertextAus(detail, 'Fehler 422')).toBe('source_url: Field required')
  })

  it('verbindet mehrere Validierungsfehler zu einem lesbaren Satz', () => {
    const detail = [
      {type: 'value_error', loc: ['body', 'price'], msg: 'Ungültiger Wert'},
      {type: 'missing', loc: ['body', 'name'], msg: 'Field required'},
    ]
    expect(fehlertextAus(detail, 'Fehler 422')).toBe('price: Ungültiger Wert; name: Field required')
  })

  it('behält den verschachtelten Feldpfad, ohne "body" mitzuschleifen', () => {
    const detail = [{type: 'missing', loc: ['body', 'price', 'source_url'], msg: 'Field required'}]
    expect(fehlertextAus(detail, 'Fehler 422')).toBe('price.source_url: Field required')
  })

  it('kürzt sehr viele Einzelfehler, statt eine Textwand zu erzeugen', () => {
    const detail = Array.from({length: 7}, (_, i) => ({loc: ['body', `feld${i}`], msg: 'Field required'}))
    const text = fehlertextAus(detail, 'Fehler 422')
    expect(text).toContain('feld0: Field required')
    expect(text).toContain('und 3 weitere')
    expect(text).not.toContain('feld4')
  })

  it('erzeugt niemals [object Object] - auch nicht bei unbekannten Formen', () => {
    const formen: unknown[] = [
      [{type: 'missing', loc: ['body', 'x'], msg: 'Field required'}],
      {msg: 'Etwas ist schiefgelaufen'},
      {message: 'Andere Schreibweise'},
      [{irgendwas: 'ohne msg'}],
      {tief: {verschachtelt: true}},
      [],
      {},
      null,
      undefined,
    ]
    for (const form of formen) {
      expect(fehlertextAus(form, 'Ersatzmeldung')).not.toContain('[object Object]')
    }
  })

  it('fällt auf die Ersatzmeldung zurück, wenn nichts Verwertbares dabei ist', () => {
    expect(fehlertextAus({}, 'Fehler 500')).toBe('Fehler 500')
    expect(fehlertextAus([], 'Fehler 500')).toBe('Fehler 500')
    expect(fehlertextAus(null, 'Fehler 500')).toBe('Fehler 500')
    expect(fehlertextAus('   ', 'Fehler 500')).toBe('Fehler 500')
  })
})

describe('api – Fehlermeldungen aus dem Server', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubJson(status: number, payload: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {status, headers: {'content-type': 'application/json'}}),
      ),
    )
  }

  it('wirft bei einem 422 die Feldmeldung statt [object Object]', async () => {
    stubJson(422, {detail: [{type: 'missing', loc: ['body', 'source_url'], msg: 'Field required'}]})
    await expect(api('/products/import', {method: 'POST', body: '{}'})).rejects.toThrow(
      'source_url: Field required',
    )
  })

  it('wirft eine verständliche Meldung, wenn der Server gar kein JSON liefert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502</html>', {status: 502})),
    )
    await expect(api('/products')).rejects.toThrow('Fehler 502')
  })
})
