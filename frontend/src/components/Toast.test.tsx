import {act, cleanup, render, screen} from '@testing-library/react'
import {useEffect, useRef} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ToastProvider, useToast} from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Zählt, wie oft sich die Kennung der Meldefunktion geändert hat. */
function Beobachter({onKennung}:{onKennung:(anzahl:number)=>void}) {
  const toast = useToast()
  const vorher = useRef<unknown>(null)
  const wechsel = useRef(0)

  if (vorher.current !== toast) {
    vorher.current = toast
    wechsel.current += 1
  }

  useEffect(() => { onKennung(wechsel.current) })

  return <button type="button" onClick={() => toast('Gespeichert')}>Melden</button>
}

describe('Meldungen – keine überflüssigen Neuladungen', () => {
  it('behält die Kennung der Meldefunktion, wenn eine Meldung erscheint und verschwindet', async () => {
    vi.useFakeTimers()
    let wechsel = 0
    render(<ToastProvider><Beobachter onKennung={anzahl => { wechsel = anzahl }}/></ToastProvider>)

    expect(wechsel).toBe(1)

    act(() => { screen.getByRole('button', {name: 'Melden'}).click() })
    expect(screen.getByText('Gespeichert')).toBeTruthy()
    expect(wechsel).toBe(1)

    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Gespeichert')).toBeNull()
    // Eine Seite, die toast in einer Abhängigkeitsliste führt, hätte hier
    // sonst zweimal alles neu geladen.
    expect(wechsel).toBe(1)
  })

  it('räumt eine neue Meldung nicht mit dem Zeitgeber der vorherigen ab', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Beobachter onKennung={() => {}}/></ToastProvider>)
    const melden = screen.getByRole('button', {name: 'Melden'})

    act(() => { melden.click() })
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { melden.click() })

    // Der Zeitgeber der ersten Meldung läuft jetzt ab - die zweite muss
    // stehen bleiben.
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getByText('Gespeichert')).toBeTruthy()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Gespeichert')).toBeNull()
  })
})
