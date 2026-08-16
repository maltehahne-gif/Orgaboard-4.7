import {describe, expect, it} from 'vitest'
import {
  MAX_EXAKT,
  appointmentDurationMinutes,
  calculateOrder,
  routeScore,
  scheduleStops,
  type Located,
} from './route'

/** Fester Startzeitpunkt, damit die Rechnung reproduzierbar bleibt. */
const START = new Date('2026-08-17T07:00:00Z').getTime()

function termin(startOffsetMinuten: number, dauerMinuten?: number) {
  const start = new Date(START + startOffsetMinuten * 60000)
  return {
    start_at: start.toISOString(),
    end_at: dauerMinuten ? new Date(start.getTime() + dauerMinuten * 60000).toISOString() : null,
  }
}

/**
 * Baut Fahrzeit- und Streckenmatrizen aus Koordinaten auf einer Linie.
 * Index 0 ist der Start, danach die Stopps - genau wie beim Routing-Dienst.
 */
function matrizen(positionen: number[]) {
  const alle = [0, ...positionen]
  const durations = alle.map(a => alle.map(b => Math.abs(a - b)))
  const distances = alle.map(a => alle.map(b => Math.abs(a - b)))
  return {durations, distances}
}

function orte(positionen: number[], termine: {start_at: string; end_at?: string | null}[]): Located[] {
  return positionen.map((p, i) => ({appointment: termine[i], lat: p, lon: 0}))
}

describe('appointmentDurationMinutes', () => {
  it('nimmt die tatsächliche Dauer, wenn ein Ende hinterlegt ist', () => {
    expect(appointmentDurationMinutes(termin(0, 90))).toBe(90)
  })

  it('nimmt 30 Minuten an, wenn kein Ende hinterlegt ist', () => {
    expect(appointmentDurationMinutes(termin(0))).toBe(30)
  })

  it('begrenzt unsinnige Dauern nach unten und oben', () => {
    expect(appointmentDurationMinutes(termin(0, 5))).toBe(15)
    expect(appointmentDurationMinutes(termin(0, 600))).toBe(240)
  })
})

describe('calculateOrder – kleine Touren', () => {
  it('bringt Termine in die zeitlich mögliche Reihenfolge', () => {
    // Der frühe Termin liegt weiter weg. Wer nach Nähe fährt, kommt zu spät.
    const positionen = [60, 10]
    const termine = [termin(70), termin(200)]
    const {durations, distances} = matrizen(positionen)

    const order = calculateOrder(orte(positionen, termine), durations, distances, START)
    expect(order).toEqual([0, 1])
  })

  it('wählt bei gleicher Pünktlichkeit den kürzeren Weg', () => {
    // Beide Termine sind spät genug, dass jede Reihenfolge pünktlich ist.
    const positionen = [10, 50]
    const termine = [termin(600), termin(600)]
    const {durations, distances} = matrizen(positionen)

    const order = calculateOrder(orte(positionen, termine), durations, distances, START)
    // Erst der nahe, dann der ferne - alles andere fährt die Strecke doppelt.
    expect(order).toEqual([0, 1])
  })

  it('kommt mit leerer und einzelner Tour zurecht', () => {
    expect(calculateOrder([], [[0]], [[0]], START)).toEqual([])
    const {durations, distances} = matrizen([10])
    expect(calculateOrder(orte([10], [termin(100)]), durations, distances, START)).toEqual([0])
  })
})

describe('calculateOrder – große Touren', () => {
  /**
   * Der eigentliche Grund für diesen Block: oberhalb von MAX_EXAKT wurde
   * vorher gar nicht optimiert, sondern nur nach Terminzeit sortiert.
   */
  function grosseTour() {
    const anzahl = MAX_EXAKT + 4
    // Positionen springen absichtlich hin und her, die Terminzeiten sind
    // aber alle weit genug entfernt, dass die Reihenfolge frei wählbar ist.
    const positionen = [10, 90, 20, 80, 30, 70, 40, 60, 50, 100, 15, 85].slice(0, anzahl)
    const termine = positionen.map(() => termin(20000))
    return {positionen, termine, ...matrizen(positionen)}
  }

  it('rechnet über der Bruteforce-Grenze überhaupt eine Verbesserung', () => {
    const {positionen, termine, durations, distances} = grosseTour()
    const located = orte(positionen, termine)

    const order = calculateOrder(located, durations, distances, START)
    expect(order).toHaveLength(positionen.length)

    // Reine Sortierung nach Terminzeit - das bisherige Verhalten.
    const nurZeit = located.map((_, i) => i)

    const neu = routeScore(order, located, durations, distances, START)
    const alt = routeScore(nurZeit, located, durations, distances, START)
    expect(neu).toBeLessThan(alt)
  })

  it('liefert jeden Stopp genau einmal', () => {
    const {positionen, termine, durations, distances} = grosseTour()
    const order = calculateOrder(orte(positionen, termine), durations, distances, START)
    expect([...order].sort((a, b) => a - b)).toEqual(positionen.map((_, i) => i))
  })

  it('opfert für einen kürzeren Weg keine Pünktlichkeit', () => {
    // Ein enger Termin ganz am Anfang, der Rest ist zeitlich offen.
    const positionen = [95, 10, 20, 30, 40, 50, 60, 70, 80, 90, 15, 25]
    const termine = positionen.map((_, i) => (i === 0 ? termin(100) : termin(20000)))
    const {durations, distances} = matrizen(positionen)
    const located = orte(positionen, termine)

    const order = calculateOrder(located, durations, distances, START)
    const {stops} = scheduleStops(order, located, durations, distances, START)

    const engerStopp = stops.find(s => s.appointment === termine[0])
    expect(engerStopp?.lateMinutes).toBe(0)
  })
})

describe('scheduleStops', () => {
  it('rechnet Ankunft, Wartezeit und Verspätung je Stopp', () => {
    // 30 Minuten Fahrt zu einem Termin, der erst in 90 Minuten beginnt.
    const positionen = [30]
    const termine = [termin(90)]
    const {durations, distances} = matrizen(positionen)

    const {stops, totalTravelMinutes, totalDistanceKm} = scheduleStops(
      [0], orte(positionen, termine), durations, distances, START,
    )

    expect(stops).toHaveLength(1)
    expect(stops[0].travelMinutes).toBe(30)
    expect(stops[0].distanceKm).toBe(30)
    expect(stops[0].waitMinutes).toBe(60)
    expect(stops[0].lateMinutes).toBe(0)
    expect(totalTravelMinutes).toBe(30)
    expect(totalDistanceKm).toBe(30)
  })

  it('weist Verspätung aus, wenn die Fahrt zu lange dauert', () => {
    // 120 Minuten Fahrt zu einem Termin in 30 Minuten.
    const positionen = [120]
    const termine = [termin(30)]
    const {durations, distances} = matrizen(positionen)

    const {stops} = scheduleStops([0], orte(positionen, termine), durations, distances, START)
    expect(stops[0].lateMinutes).toBe(90)
    expect(stops[0].waitMinutes).toBe(0)
  })

  it('lässt einen Termin nicht vor seiner Uhrzeit beginnen', () => {
    // Früh da, aber der zweite Termin startet erst nach dem ersten Termin
    // plus dessen Dauer - die Wartezeit darf nicht unterschlagen werden.
    const positionen = [10, 20]
    const termine = [termin(60, 60), termin(200)]
    const {durations, distances} = matrizen(positionen)

    const {stops, finishAt} = scheduleStops(
      [0, 1], orte(positionen, termine), durations, distances, START,
    )

    // Erster Termin: 10 Min Fahrt, Beginn erst um +60, Dauer 60 -> Ende +120.
    // Danach 10 Min Fahrt -> Ankunft +130, Termin erst um +200 -> 70 Min warten.
    expect(stops[1].waitMinutes).toBe(70)
    expect(finishAt).toBe(new Date(START + 230 * 60000).toISOString())
  })

  it('nummeriert die Stopps in der gefahrenen Reihenfolge', () => {
    const positionen = [10, 20, 30]
    const termine = [termin(100), termin(200), termin(300)]
    const {durations, distances} = matrizen(positionen)

    const {stops} = scheduleStops([2, 0, 1], orte(positionen, termine), durations, distances, START)
    expect(stops.map(s => s.sequence)).toEqual([1, 2, 3])
    expect(stops[0].appointment).toBe(termine[2])
  })

  it('liefert für eine leere Tour kein Ende', () => {
    const {stops, finishAt} = scheduleStops([], [], [[0]], [[0]], START)
    expect(stops).toEqual([])
    expect(finishAt).toBeNull()
  })
})
