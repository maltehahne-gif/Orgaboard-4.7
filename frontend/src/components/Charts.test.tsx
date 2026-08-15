import {cleanup, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'
import {LineChart, Sparkline} from './Charts'

afterEach(cleanup)

const WOCHE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function punkte(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.linechart-dot'))
}

/** Prozentwert aus einer style-Angabe wie "left: 42.5%". */
function prozent(wert: string) {
  return Number(wert.replace('%', ''))
}

describe('LineChart – Achsenstufen', () => {
  it('legt die Achse auf runde Schritte statt auf krumme Drittel', () => {
    // 50.000 / 3 = 16.667 - die Achse soll trotzdem bei 20.000 stehen.
    render(
      <LineChart
        values={[10000, 20000, 30000, 40000, 50000, 30000, 20000]}
        labels={WOCHE}
        formatTick={t => String(t)}
      />,
    )

    const stufen = Array.from(document.querySelectorAll('.linechart-axis span'))
      .map(s => Number(s.textContent))

    expect(stufen).toEqual([60000, 40000, 20000, 0])
  })

  it('kommt auch mit lauter Nullwerten zurecht', () => {
    // Ohne Sonderbehandlung waere hier log10(0) im Spiel.
    render(<LineChart values={[0, 0, 0]} labels={['a', 'b', 'c']} formatTick={t => String(t)} />)

    const stufen = Array.from(document.querySelectorAll('.linechart-axis span'))
      .map(s => Number(s.textContent))

    expect(stufen.every(Number.isFinite)).toBe(true)
    expect(stufen[stufen.length - 1]).toBe(0)
  })

  it('wählt 2,5er-Schritte, wenn sie besser passen als 5er', () => {
    render(<LineChart values={[7000]} labels={['a']} formatTick={t => String(t)} />)

    const oberste = Number(document.querySelector('.linechart-axis span')?.textContent)
    expect(oberste).toBe(7500)
  })
})

describe('LineChart – Punkte', () => {
  it('schneidet den ersten und letzten Punkt nicht ab', () => {
    // Genau dieser Fehler war schon einmal da: "So" lag halb ausserhalb.
    const {container} = render(
      <LineChart values={[1, 2, 3, 4, 5, 6, 7]} labels={WOCHE} formatTick={t => String(t)} />,
    )

    const links = punkte(container).map(p => prozent(p.style.left))

    expect(links[0]).toBeGreaterThan(0)
    expect(links[links.length - 1]).toBeLessThan(100)
  })

  it('setzt für jeden Wert genau einen Punkt', () => {
    const {container} = render(
      <LineChart values={[1, 2, 3, 4, 5, 6, 7]} labels={WOCHE} formatTick={t => String(t)} />,
    )

    expect(punkte(container)).toHaveLength(7)
  })

  it('beschriftet jeden Punkt mit seinem Wochentag', () => {
    render(<LineChart values={[1, 2, 3, 4, 5, 6, 7]} labels={WOCHE} formatTick={t => String(t)} />)

    for (const tag of WOCHE) {
      expect(screen.getByText(tag)).toBeTruthy()
    }
  })

  it('legt einen höheren Wert weiter oben ab als einen niedrigeren', () => {
    // In SVG-Koordinaten heisst "oben" ein kleinerer y-Wert.
    const {container} = render(
      <LineChart values={[10, 90]} labels={['tief', 'hoch']} formatTick={t => String(t)} />,
    )

    const [tief, hoch] = punkte(container).map(p => prozent(p.style.top))
    expect(hoch).toBeLessThan(tief)
  })

  it('reicht die Zusatzinfo als Titel an den Punkt durch', () => {
    const {container} = render(
      <LineChart
        values={[1200]}
        labels={['Mo']}
        formatTick={t => String(t)}
        formatPoint={(wert, tag) => `${tag}: ${wert}`}
      />,
    )

    expect(punkte(container)[0].title).toBe('Mo: 1200')
  })
})

describe('Sparkline', () => {
  it('zeichnet eine Kurve, sobald Werte vorliegen', () => {
    const {container} = render(<Sparkline values={[1, 5, 3, 8]} />)
    const pfade = container.querySelectorAll('path')

    expect(pfade.length).toBeGreaterThan(0)
    expect(pfade[0].getAttribute('d')).toMatch(/^M/)
  })

  it('zeigt bei einem einzelnen Wert eine flache Linie statt einer Kurve', () => {
    // Aus einem Punkt laesst sich kein Verlauf ablesen. Eine gezeichnete
    // Kurve wuerde eine Entwicklung behaupten, die es nicht gibt.
    const {container} = render(<Sparkline values={[42]} />)

    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(container.querySelectorAll('line')).toHaveLength(1)
  })

  it('zeigt auch ohne Werte eine flache Linie statt gar nichts', () => {
    const {container} = render(<Sparkline values={[]} />)
    expect(container.querySelectorAll('line')).toHaveLength(1)
  })

  it('bricht bei lauter Nullen nicht ab', () => {
    const {container} = render(<Sparkline values={[0, 0, 0, 0]} />)
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})
