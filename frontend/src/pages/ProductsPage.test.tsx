import {cleanup, render, screen, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('../lib/api', async () => {
  const echt = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return {...echt, api: vi.fn()}
})

vi.mock('../lib/auth', () => ({useAuth: vi.fn()}))

import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {ProductsPage} from './ProductsPage'

const mockApi = vi.mocked(api)
const mockUseAuth = vi.mocked(useAuth)

afterEach(() => {
  cleanup()
  mockApi.mockReset()
})

function alsRolle(role: 'EMPLOYEE' | 'TEAM_LEADER' | 'REGIONAL_LEAD' | 'SYSTEM_ADMIN') {
  mockUseAuth.mockReturnValue({
    me: {id: 'u1', email: 'a@b.de', full_name: 'A B', role, must_change_password: false, employee: null} as any,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  })
}

/**
 * B: der Backend-Endpunkt /products/import verlangt Teamleiter-Rechte
 * (require_team_leader). "Neues Produkt" durfte deshalb nicht für jede
 * angemeldete Rolle angeboten werden - sonst öffnet ein einfacher
 * Mitarbeiter ein Formular, dessen Absenden das Backend ohnehin ablehnt.
 */
describe('Produktberechtigungen im Frontend', () => {
  it('bietet einem einfachen Mitarbeiter kein "Neues Produkt" an', async () => {
    alsRolle('EMPLOYEE')
    mockApi.mockResolvedValue([])
    render(<ProductsPage />)

    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(screen.queryByRole('button', {name: /Neues Produkt/})).toBeNull()
  })

  it.each(['TEAM_LEADER', 'REGIONAL_LEAD', 'SYSTEM_ADMIN'] as const)(
    'bietet %s "Neues Produkt" an',
    async role => {
      alsRolle(role)
      mockApi.mockResolvedValue([])
      render(<ProductsPage />)

      await waitFor(() => expect(mockApi).toHaveBeenCalled())
      expect(screen.getByRole('button', {name: /Neues Produkt/})).toBeTruthy()
    },
  )

  it('bietet einem einfachen Mitarbeiter weder Preisverwaltung noch Archiv an', async () => {
    alsRolle('EMPLOYEE')
    mockApi.mockResolvedValue([])
    render(<ProductsPage />)

    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(screen.queryByRole('button', {name: /Preise/})).toBeNull()
    expect(screen.queryByRole('button', {name: /Archiv/})).toBeNull()
  })
})
