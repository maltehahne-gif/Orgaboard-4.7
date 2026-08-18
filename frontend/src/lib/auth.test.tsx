import {cleanup, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('./api', async () => {
  const echt = await vi.importActual<typeof import('./api')>('./api')
  return {...echt, api: vi.fn()}
})

import {api, AUTH_EXPIRED_EVENT} from './api'
import {AuthProvider, useAuth} from './auth'

const mockApi = vi.mocked(api)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function Anzeige() {
  const {me, loading} = useAuth()
  if (loading) return <div data-testid="me">lädt…</div>
  return <div data-testid="me">{me ? me.full_name : 'kein Benutzer'}</div>
}

const BENUTZER = {
  id: 'u1', email: 'anna@example.com', full_name: 'Anna Beispiel',
  role: 'EMPLOYEE' as const, must_change_password: false, employee: null,
}

describe('AuthProvider – zentrale Behandlung einer abgelaufenen Sitzung', () => {
  it('räumt den Auth-Zustand auf, wenn irgendein Aufruf 401 meldet', async () => {
    mockApi.mockResolvedValue(BENUTZER)
    render(<AuthProvider><Anzeige /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('Anna Beispiel'))

    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))

    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('kein Benutzer'))
  })

  it('meldet einen bereits abgemeldeten Benutzer weiterhin sauber als abgemeldet', async () => {
    mockApi.mockRejectedValue(new Error('Nicht angemeldet'))
    render(<AuthProvider><Anzeige /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('kein Benutzer'))

    // Ein weiteres Auth-Ereignis darf keine Endlosschleife oder einen Fehler
    // auslösen, nur weil ohnehin schon niemand angemeldet ist.
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('kein Benutzer'))
  })

  it('entfernt den Ereignis-Listener beim Unmount', async () => {
    mockApi.mockResolvedValue(BENUTZER)
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const {unmount} = render(<AuthProvider><Anzeige /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('me').textContent).toBe('Anna Beispiel'))

    unmount()
    expect(removeSpy).toHaveBeenCalledWith(AUTH_EXPIRED_EVENT, expect.any(Function))
  })
})
