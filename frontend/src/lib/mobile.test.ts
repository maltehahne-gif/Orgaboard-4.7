import {afterEach, describe, expect, it, vi} from 'vitest'
import {kartenHref, mailHref, telHref, telefonnummerBereinigen} from './mobile'

/** Gibt vor, auf welchem Gerät die Anwendung gerade läuft. */
function geraet(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('telefonnummerBereinigen', () => {
  it('entfernt Leerzeichen, Klammern und Bindestriche', () => {
    expect(telefonnummerBereinigen('+49 (0) 202 / 123-456')).toBe('+490202123456')
  })

  it('behält Wählzeichen, die im Telefon eine Bedeutung haben', () => {
    expect(telefonnummerBereinigen('0202123456,99#')).toBe('0202123456,99#')
  })
})

describe('telHref', () => {
  it('erzeugt einen wählbaren Link aus einer gepflegten Nummer', () => {
    expect(telHref('0202 / 123 456')).toBe('tel:0202123456')
  })

  it('liefert nichts, wenn keine Nummer hinterlegt ist', () => {
    expect(telHref(null)).toBe('')
    expect(telHref('   ')).toBe('')
  })

  it('liefert nichts, wenn nach dem Bereinigen keine Ziffer übrig bleibt', () => {
    // Sonst entstünde "tel:" - ein Link, der ins Leere führt.
    expect(telHref('kein Anschluss')).toBe('')
  })
})

describe('mailHref', () => {
  it('erzeugt einen mailto-Link', () => {
    expect(mailHref('kunde@example.com')).toBe('mailto:kunde@example.com')
  })

  it('liefert nichts ohne Adresse', () => {
    expect(mailHref(null)).toBe('')
    expect(mailHref('  ')).toBe('')
  })
})

describe('kartenHref', () => {
  it('nimmt auf dem iPhone Apple Maps', () => {
    geraet(IPHONE)
    expect(kartenHref('Musterstraße 1, 42103 Wuppertal')).toContain('maps.apple.com')
  })

  it('nimmt auf Android Google Maps', () => {
    geraet(ANDROID)
    expect(kartenHref('Musterstraße 1, 42103 Wuppertal')).toContain('google.com/maps')
  })

  it('nimmt am Windows-Rechner Google Maps', () => {
    geraet(WINDOWS)
    expect(kartenHref('Musterstraße 1')).toContain('google.com/maps')
  })

  it('kodiert die Anschrift, damit Umlaute und Leerzeichen ankommen', () => {
    geraet(ANDROID)
    const url = kartenHref('Musterstraße 1, 42103 Wuppertal')
    expect(url).toContain('Musterstra%C3%9Fe%201')
    expect(url).not.toContain(' ')
  })

  it('liefert nichts ohne Anschrift', () => {
    geraet(ANDROID)
    expect(kartenHref(null)).toBe('')
    expect(kartenHref('   ')).toBe('')
  })
})
