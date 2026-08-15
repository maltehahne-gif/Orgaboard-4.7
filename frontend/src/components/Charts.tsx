import {useId} from 'react'

/**
 * Zwei kleine Diagramme für das Dashboard, bewusst als Inline-SVG ohne
 * Diagrammbibliothek: beide zeigen eine Tagesreihe und brauchen weder
 * Interaktion noch Achsenlogik, die eine Bibliothek rechtfertigen würde.
 *
 * Beide bekommen fertige Werte übergeben und erfinden nichts dazu. Ist die
 * Reihe leer oder überall null, zeichnen sie eine flache Grundlinie statt
 * einer Kurve, die eine Entwicklung behauptet, die es nicht gibt.
 */

const GREEN = '#34d769'

/** Punkte einer Reihe auf eine Fläche abbilden. */
function points(values: number[], width: number, height: number, padTop = 2, padBottom = 2) {
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const usable = height - padTop - padBottom
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: values.length > 1 ? index * step : width / 2,
    y: padTop + usable - ((value - min) / span) * usable,
  }))
}

/** Weiche Kurve durch die Punkte (Catmull-Rom, als Bézier ausgegeben). */
function smoothPath(pts: {x: number; y: number}[]) {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0].x} ${pts[0].y}`
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/** Kleine Verlaufskurve am Fuß einer Kennzahlenkarte. */
export function Sparkline({values}: {values: number[]}) {
  const gradientId = useId()
  const width = 100
  const height = 32

  if (values.length < 2) {
    return (
      <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1={height - 3} x2={width} y2={height - 3} stroke={GREEN} strokeWidth="1.4" opacity=".45" />
      </svg>
    )
  }

  // Gegen die Null-Linie skalieren, nicht gegen den kleinsten Wert der Reihe,
  // und 30 % Kopfraum lassen: sonst zieht schon eine kleine Schwankung die
  // Kurve über die volle Kartenhöhe und behauptet einen dramatischen Verlauf.
  const peak = Math.max(...values, 0) * 1.3 || 1
  const pts = values.map((value, index) => ({
    x: values.length > 1 ? (index * width) / (values.length - 1) : width / 2,
    y: height - 3 - (value / peak) * (height - 6),
  }))
  const line = smoothPath(pts)
  const area = `${line} L${width} ${height} L0 ${height} Z`

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity=".34" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={GREEN} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

type LineChartProps = {
  values: number[]
  labels: string[]
  /** Achsenbeschriftung, z. B. Cent-Betrag zu "50k €". */
  formatTick: (value: number) => string
  /** Titel für die Punkte, z. B. "Mi: 12.400 €". */
  formatPoint?: (value: number, label: string) => string
}

/** Wochenverlauf mit Y-Achse, Gitternetz und Wochentagen. */
export function LineChart({values, labels, formatTick, formatPoint}: LineChartProps) {
  const gradientId = useId()
  const width = 320
  const height = 132

  // Achsenstufen auf runde Schritte legen (1, 2, 2,5 oder 5 mal Zehnerpotenz),
  // damit dort "20k / 40k / 60k" steht und nicht "17k / 33k / 50k".
  const max = Math.max(...values, 0)
  const rough = max > 0 ? max / 3 : 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(candidate => candidate >= rough) ?? magnitude * 10
  const top = step * 3
  const ticks = [top, step * 2, step, 0]

  // Skalierung fest gegen die Achsenobergrenze, nicht gegen den Reihenmaximalwert -
  // sonst läge der größte Tageswert immer auf der obersten Gitterlinie.
  // Seitlich einruecken, sonst liegen der Montags- und der Sonntagspunkt
  // halb ausserhalb der Zeichenflaeche und werden abgeschnitten.
  const inset = 8
  const span = width - inset * 2
  const columnWidth = values.length > 1 ? span / (values.length - 1) : 0
  const scaled = values.map((value, index) => ({
    x: values.length > 1 ? inset + index * columnWidth : width / 2,
    y: 4 + (height - 8) - (value / top) * (height - 8),
  }))
  const line = smoothPath(scaled)
  const area = `${line} L${width} ${height} L0 ${height} Z`

  return (
    <div className="linechart">
      <div className="linechart-axis">
        {ticks.map(tick => (
          <span key={tick}>{formatTick(tick)}</span>
        ))}
      </div>

      <div className="linechart-plot">
        {/* Zeichenfläche und Beschriftungszeile sind getrennt, damit ein
            Punkt mit Wert 0 auf der Grundlinie liegt und nicht im Text. */}
        <div className="linechart-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Umsatzverlauf der Woche">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity=".28" />
              <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick, index) => (
            <line
              key={tick}
              x1="0"
              x2={width}
              y1={4 + ((height - 8) / (ticks.length - 1)) * index}
              y2={4 + ((height - 8) / (ticks.length - 1)) * index}
              stroke="#1b2b30"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Punkte liegen als HTML darüber, damit sie rund bleiben - das SVG
            wird in der Breite gestreckt und würde Kreise zu Ellipsen ziehen. */}
        {scaled.map((point, index) => (
          <span
            key={labels[index] ?? index}
            className="linechart-dot"
            style={{left: `${(point.x / width) * 100}%`, top: `${(point.y / height) * 100}%`}}
            title={formatPoint ? formatPoint(values[index], labels[index] ?? '') : undefined}
          />
        ))}
        </div>

        {/* Beschriftungen sitzen auf derselben Position wie die Punkte,
            damit "Mo" wirklich unter dem Montagspunkt steht. */}
        <div className="linechart-labels">
          {labels.map((label, index) => (
            <span key={label} style={{left: `${((scaled[index]?.x ?? 0) / width) * 100}%`}}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
