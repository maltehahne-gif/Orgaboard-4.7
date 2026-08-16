/**
 * Routenmathematik: Reihenfolge finden und Tagesplan berechnen.
 *
 * Bewusst aus der Seite herausgezogen und ohne Zustand, damit sich das
 * Verhalten prüfen lässt - eingebettet in eine 1800-Zeilen-Komponente war
 * genau die Rechnung ungetestet, an der der ganze Tag hängt.
 *
 * Eine Bewertungsfunktion für alles: Bruteforce und Heuristik benutzen
 * dieselbe. Zwei Bewertungen, die dasselbe meinen, laufen sonst auseinander,
 * und niemand merkt, dass die Heuristik nach anderen Regeln sortiert.
 */

export type Position = {lat: number; lon: number}

export type RouteAppointment = {
  start_at: string
  end_at?: string | null
}

export type Located<T extends RouteAppointment = RouteAppointment> = {
  appointment: T
  lat: number
  lon: number
}

export type StopPlan<T extends RouteAppointment = RouteAppointment> = {
  appointment: T
  lat: number
  lon: number
  sequence: number
  travelMinutes: number
  distanceKm: number
  arrivalAt: string
  waitMinutes: number
  lateMinutes: number
}

/**
 * Bis hierher wird jede Reihenfolge durchgerechnet. 8 Stopps sind 40.320
 * Möglichkeiten - das rechnet ein Telefon in Sekundenbruchteilen. 9 wären
 * schon 362.880, 10 über drei Millionen; dort übernimmt die Heuristik.
 */
export const MAX_EXAKT = 8

/** Obergrenze für die Verbesserungsläufe, damit nichts einfriert. */
const MAX_2OPT_DURCHLAEUFE = 40

/**
 * Gewichte der Bewertung. Verspätung wiegt mit Abstand am schwersten: ein
 * Kunde, der wartet, ist teurer als jeder Umweg. Wartezeit zählt nur ganz
 * leicht mit - lieber früh da sein als zu spät.
 */
const GEWICHT_VERSPAETUNG = 1000
const GEWICHT_STRECKE = 0.05
const GEWICHT_WARTEN = 0.015

/** Wie lange ein Termin dauert, wenn nichts anderes hinterlegt ist. */
export function appointmentDurationMinutes(appointment: RouteAppointment): number {
  if (appointment.end_at) {
    const start = new Date(appointment.start_at).getTime()
    const end = new Date(appointment.end_at).getTime()
    const minutes = (end - start) / 60000
    if (minutes > 0) return Math.max(15, Math.min(240, minutes))
  }
  return 30
}

type Schritt = {
  stopIndex: number
  travel: number
  distance: number
  arrivalTime: number
  lateMinutes: number
  waitMinutes: number
}

/**
 * Läuft eine Reihenfolge einmal ab und liefert je Stopp Fahrzeit, Strecke,
 * Ankunft, Verspätung und Wartezeit.
 *
 * Der eine Durchlauf, auf dem sowohl die Bewertung als auch der angezeigte
 * Tagesplan beruhen - vorher stand dieselbe Schleife zweimal im Code.
 */
function begehen(
  order: number[],
  located: Located[],
  durations: number[][],
  distances: number[][],
  startzeit: number,
): {schritte: Schritt[]; endzeit: number} {
  let matrixIndex = 0
  let zeit = startzeit
  const schritte: Schritt[] = []

  for (const stopIndex of order) {
    const zielIndex = stopIndex + 1
    const travel = durations[matrixIndex][zielIndex]
    const distance = distances[matrixIndex][zielIndex]

    zeit += travel * 60000
    const ankunft = zeit

    const terminZeit = new Date(located[stopIndex].appointment.start_at).getTime()

    schritte.push({
      stopIndex,
      travel,
      distance,
      arrivalTime: ankunft,
      lateMinutes: Math.max(0, (ankunft - terminZeit) / 60000),
      waitMinutes: Math.max(0, (terminZeit - ankunft) / 60000),
    })

    // Vor dem Termin angekommen? Dann beginnt er trotzdem erst zur
    // vereinbarten Zeit.
    zeit = Math.max(ankunft, terminZeit)
    zeit += appointmentDurationMinutes(located[stopIndex].appointment) * 60000
    matrixIndex = zielIndex
  }

  return {schritte, endzeit: zeit}
}

/** Kosten einer Reihenfolge. Kleiner ist besser. */
export function routeScore(
  order: number[],
  located: Located[],
  durations: number[][],
  distances: number[][],
  startzeit: number,
): number {
  const {schritte} = begehen(order, located, durations, distances, startzeit)
  let score = 0
  for (const s of schritte) {
    score +=
      s.travel +
      s.distance * GEWICHT_STRECKE +
      s.lateMinutes * GEWICHT_VERSPAETUNG +
      s.waitMinutes * GEWICHT_WARTEN
  }
  return score
}

function permutations(values: number[]): number[][] {
  if (values.length <= 1) return [values]
  const result: number[][] = []
  values.forEach((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)]
    for (const permutation of permutations(rest)) result.push([value, ...permutation])
  })
  return result
}

/** Reihenfolge nach Terminzeit - die pünktlichste Ausgangslage. */
function nachTerminzeit(located: Located[]): number[] {
  return located
    .map((_, index) => index)
    .sort(
      (a, b) =>
        new Date(located[a].appointment.start_at).getTime() -
        new Date(located[b].appointment.start_at).getTime(),
    )
}

/** Immer zum nächstgelegenen noch offenen Stopp - kurze Wege, ohne Zeitbezug. */
function nachNaehe(located: Located[], durations: number[][]): number[] {
  const offen = new Set(located.map((_, index) => index))
  const order: number[] = []
  let matrixIndex = 0

  while (offen.size) {
    let bester = -1
    let besteFahrzeit = Number.POSITIVE_INFINITY
    for (const index of offen) {
      const fahrzeit = durations[matrixIndex][index + 1]
      if (fahrzeit < besteFahrzeit) {
        besteFahrzeit = fahrzeit
        bester = index
      }
    }
    order.push(bester)
    offen.delete(bester)
    matrixIndex = bester + 1
  }

  return order
}

/**
 * 2-opt: kehrt Teilstücke um, solange das die Bewertung verbessert.
 *
 * Löst genau das Muster, das eine reine Zeitsortierung stehen lässt - zwei
 * Termine, die zeitlich passen, aber quer durch das Gebiet und wieder zurück
 * führen.
 */
function verbessern(
  order: number[],
  located: Located[],
  durations: number[][],
  distances: number[][],
  startzeit: number,
): number[] {
  let beste = [...order]
  let besterScore = routeScore(beste, located, durations, distances, startzeit)

  for (let durchlauf = 0; durchlauf < MAX_2OPT_DURCHLAEUFE; durchlauf += 1) {
    let verbessert = false

    for (let i = 0; i < beste.length - 1; i += 1) {
      for (let k = i + 1; k < beste.length; k += 1) {
        const kandidat = [
          ...beste.slice(0, i),
          ...beste.slice(i, k + 1).reverse(),
          ...beste.slice(k + 1),
        ]
        const score = routeScore(kandidat, located, durations, distances, startzeit)
        if (score < besterScore) {
          beste = kandidat
          besterScore = score
          verbessert = true
        }
      }
    }

    if (!verbessert) break
  }

  return beste
}

/**
 * Beste Reihenfolge für die gegebenen Termine.
 *
 * Bis MAX_EXAKT Stopps wird jede Möglichkeit durchgerechnet, das Ergebnis ist
 * dann nachweislich das beste. Darüber wird aus zwei Startpunkten
 * (Terminzeit, Nähe) mit 2-opt verbessert und der bessere genommen.
 *
 * Weil die Zeitsortierung einer der Startpunkte ist und 2-opt nur bei echter
 * Verbesserung tauscht, kann das Ergebnis nie schlechter ausfallen als eine
 * reine Sortierung nach Terminzeit.
 */
export function calculateOrder(
  located: Located[],
  durations: number[][],
  distances: number[][],
  startzeit: number = Date.now(),
): number[] {
  if (located.length === 0) return []
  if (located.length === 1) return [0]

  const indexes = located.map((_, index) => index)

  if (indexes.length <= MAX_EXAKT) {
    let beste = indexes
    let besterScore = Number.POSITIVE_INFINITY
    for (const order of permutations(indexes)) {
      const score = routeScore(order, located, durations, distances, startzeit)
      if (score < besterScore) {
        besterScore = score
        beste = order
      }
    }
    return beste
  }

  const kandidaten = [
    verbessern(nachTerminzeit(located), located, durations, distances, startzeit),
    verbessern(nachNaehe(located, durations), located, durations, distances, startzeit),
  ]

  return kandidaten.reduce((a, b) =>
    routeScore(a, located, durations, distances, startzeit) <=
    routeScore(b, located, durations, distances, startzeit)
      ? a
      : b,
  )
}

/**
 * Baut aus einer Reihenfolge den fertigen Tagesplan: Fahrzeit, Strecke,
 * Ankunft, Wartezeit und Verspätung je Stopp.
 *
 * Wird sowohl von der automatischen Berechnung als auch beim Verschieben von
 * Hand benutzt.
 */
export function scheduleStops<T extends RouteAppointment>(
  order: number[],
  located: Located<T>[],
  durations: number[][],
  distances: number[][],
  startzeit: number = Date.now(),
): {
  stops: StopPlan<T>[]
  totalDistanceKm: number
  totalTravelMinutes: number
  finishAt: string | null
} {
  const {schritte, endzeit} = begehen(
    order,
    located as unknown as Located[],
    durations,
    distances,
    startzeit,
  )

  let totalTravel = 0
  let totalDistance = 0

  const stops: StopPlan<T>[] = schritte.map((schritt, position) => {
    totalTravel += schritt.travel
    totalDistance += schritt.distance
    const stop = located[schritt.stopIndex]
    return {
      appointment: stop.appointment,
      lat: stop.lat,
      lon: stop.lon,
      sequence: position + 1,
      travelMinutes: Math.max(0, Math.round(schritt.travel)),
      distanceKm: Math.round(schritt.distance * 10) / 10,
      arrivalAt: new Date(schritt.arrivalTime).toISOString(),
      waitMinutes: Math.round(schritt.waitMinutes),
      lateMinutes: Math.round(schritt.lateMinutes),
    }
  })

  return {
    stops,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    totalTravelMinutes: Math.round(totalTravel),
    finishAt: stops.length ? new Date(endzeit).toISOString() : null,
  }
}
