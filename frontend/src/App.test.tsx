import {cleanup, render, screen} from '@testing-library/react'
import {BrowserRouter} from 'react-router-dom'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('./lib/auth', () => ({useAuth: vi.fn()}))

// jsdom kennt matchMedia nicht. Die Anmeldeseite fragt es für
// "prefers-reduced-motion" ab (LoginDustChase) - ohne den Ersatz bricht
// jedes Rendern der Seite in der Testumgebung ab.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom kennt auch HTMLMediaElement.play() nicht - dieselbe Komponente
// spielt beim Anzeigen ein Hintergrundvideo ab.
window.HTMLMediaElement.prototype.play = () => Promise.resolve()

import {useAuth} from './lib/auth'
import App from './App'

const mockUseAuth = vi.mocked(useAuth)

function alsGast() {
  mockUseAuth.mockReturnValue({
    me: null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

function alsAngemeldet() {
  mockUseAuth.mockReturnValue({
    me: {
      id: 'u1',
      email: 'a@b.de',
      full_name: 'Anna Beispiel',
      role: 'EMPLOYEE',
      must_change_password: false,
      employee: null,
    } as any,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

function setUrl(pfad: string) {
  window.history.pushState({}, '', pfad)
}

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

/**
 * Der Reset-Link zeigt auf /login?reset_token=... . Vorher zeigte er auf die
 * Startseite - die liegt hinter dem Guard, der einen ausgeloggten Benutzer
 * per <Navigate to="/login"/> umleitet und dabei den Query-String verwarf.
 * Diese Tests halten beide Teile des Fixes fest: den neuen Linkpfad direkt
 * unter /login, und die Absicherung, dass ein Redirect zu /login den
 * Suchstring nicht mehr verliert.
 */
describe('Passwort-Reset-Link verliert das Token nicht mehr', () => {
  it('zeigt einem ausgeloggten Benutzer direkt unter /login das Reset-Formular', () => {
    alsGast()
    setUrl('/login?reset_token=abc123')

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )

    expect(screen.getByRole('heading', {name: 'Neues Passwort'})).toBeTruthy()
  })

  it('zeigt das Reset-Formular auch, wenn dieser Browser gerade angemeldet ist', () => {
    alsAngemeldet()
    setUrl('/login?reset_token=abc123')

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )

    // Ohne den Fix leitet die Route /login einen angemeldeten Benutzer sofort
    // zur Startseite um - unabhängig vom Reset-Token in der Adresse.
    expect(screen.getByRole('heading', {name: 'Neues Passwort'})).toBeTruthy()
  })

  it('behält den Token, wenn ein ausgeloggter Benutzer ihn über die Startseite aufruft', () => {
    alsGast()
    setUrl('/?reset_token=abc123')

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )

    expect(screen.getByRole('heading', {name: 'Neues Passwort'})).toBeTruthy()
    expect(window.location.pathname).toBe('/login')
    expect(window.location.search).toContain('reset_token=abc123')
  })

  it('zeigt den normalen Login ohne Token wie gewohnt', () => {
    alsGast()
    setUrl('/login')

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    )

    expect(screen.getByRole('heading', {name: /Willkommen/})).toBeTruthy()
  })
})
