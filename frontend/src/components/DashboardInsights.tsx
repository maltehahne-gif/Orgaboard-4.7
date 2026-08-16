import {useEffect, useState} from 'react'
import {ArrowDownRight, ArrowUpRight, Minus} from 'lucide-react'
import {api, money} from '../lib/api'
import {hatListen} from '../lib/antwort'

/**
 * Auswertungsblock für das Dashboard: Kennzahlen, Verkaufstrichter und
 * Produkt-Ranking.
 *
 * Farbregeln, bewusst gesetzt:
 * - Der Trichter ist eine geordnete Skala (Kontakt → Nachbetreuung) und
 *   bekommt deshalb eine Ein-Ton-Rampe, in der die Reihenfolge sichtbar ist.
 * - Das Produkt-Ranking ist eine ungeordnete Liste. Alle Balken tragen
 *   dieselbe Farbe – die Länge zeigt die Größe, die Farbe soll sie nicht
 *   ein zweites Mal zeigen.
 * - Statusfarben (gut/Warnung/kritisch) sind für Hinweise reserviert und
 *   erscheinen nie als Serienfarbe.
 *
 * Die Rampe wurde gegen die dunkle Oberfläche geprüft: gleichmäßige
 * Helligkeitsstufen, ein Farbton, das helle Ende hebt sich vom Hintergrund ab.
 */

type Kpis = {
  appointments_total: number
  appointments_done: number
  appointments_with_sale: number
  presentations: number
  close_rate_percent: number
  revenue_per_appointment_cents: number
}

type Trend = {
  revenue_cents: number
  revenue_previous_cents: number
  revenue_change_percent: number | null
  units: number
  units_previous: number
  units_change_percent: number | null
}

type FunnelStage = {
  stage: string
  label: string
  current: number
  reached: number
}

type Funnel = {
  total_customers: number
  stages: FunnelStage[]
  contact_to_appointment_percent: number
  appointment_to_sale_percent: number
  close_rate_percent: number
}

type ProductRow = {
  name: string
  category: string | null
  quantity: number
  revenue_cents: number
  units: number
  share_percent: number
}

// Geprüfte Ordinalrampe, hell → dunkel entlang der Trichterstufen.
const FUNNEL_RAMP = [
  '#3dd27b',
  '#37bc6e',
  '#31a661',
  '#2c9155',
  '#277c49',
  '#22683e',
  '#1d5433',
]

// Eine Serie, eine Farbe.
const BAR_COLOR = '#2c9155'

function Delta({percent}: {percent: number | null}) {
  if (percent === null) {
    return <span className="delta neutral" title="Kein Vergleichswert im Zeitraum davor">
      <Minus size={13} /> kein Vorwert
    </span>
  }
  const up = percent >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      <Icon size={13} />
      {up ? '+' : ''}{percent} %
    </span>
  )
}

export function DashboardInsights({employeeId}: {employeeId?: string}) {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [trend, setTrend] = useState<Trend | null>(null)
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])

  useEffect(() => {
    const q = employeeId ? `&employee_id=${employeeId}` : ''
    api<Kpis>(`/dashboard/kpis?period=month${q}`).then(setKpis).catch(() => {})
    api<Trend>(`/dashboard/trend?period=month${q}`).then(setTrend).catch(() => {})
    api<Funnel>(`/dashboard/funnel${employeeId ? `?employee_id=${employeeId}` : ''}`)
      .then(antwort => {
        if (hatListen(antwort, 'stages')) setFunnel(antwort)
      })
      .catch(() => {})
    api<{products: ProductRow[]}>(`/dashboard/products?period=month${q}`)
      .then(antwort => {
        if (hatListen(antwort, 'products')) setProducts(antwort.products)
      })
      .catch(() => {})
  }, [employeeId])

  const maxReached = funnel
    ? Math.max(...funnel.stages.map(s => s.reached), 1)
    : 1
  const maxRevenue = products.length
    ? Math.max(...products.map(p => p.revenue_cents), 1)
    : 1

  return (
    <div className="insights">
      {/* ---------- Kennzahlen ---------- */}
      {kpis && (
        <section className="card insights-card">
          <div className="section-title">
            <h2>Kennzahlen diesen Monat</h2>
          </div>

          <div className="kpi-row">
            <div className="kpi">
              <small>Durchgeführte Termine</small>
              <strong>{kpis.appointments_done}</strong>
              <span className="kpi-sub">von {kpis.appointments_total} geplant</span>
            </div>

            <div className="kpi">
              <small>Abschlussquote</small>
              <strong>{kpis.close_rate_percent} %</strong>
              <span className="kpi-sub">
                {kpis.appointments_with_sale} mit Verkauf
              </span>
            </div>

            <div className="kpi">
              <small>Umsatz pro Termin</small>
              <strong>{money(kpis.revenue_per_appointment_cents)}</strong>
              <span className="kpi-sub">auf {kpis.appointments_done} Termine</span>
            </div>

            <div className="kpi">
              <small>Vorführungen</small>
              <strong>{kpis.presentations}</strong>
            </div>

            {/* Die Veränderung gehört zu der Größe, über der sie steht -
                sie unter "Vorführungen" zu setzen behauptete etwas Falsches. */}
            {trend && (
              <div className="kpi">
                <small>Umsatz gesamt</small>
                <strong>{money(trend.revenue_cents)}</strong>
                <Delta percent={trend.revenue_change_percent} />
              </div>
            )}

            {trend && (
              <div className="kpi">
                <small>Einheiten</small>
                <strong>{trend.units}</strong>
                <Delta percent={trend.units_change_percent} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- Verkaufstrichter ---------- */}
      {funnel && (
        <section className="card insights-card">
          <div className="section-title">
            <h2>Verkaufstrichter</h2>
          </div>
          <p className="insights-note">
            {funnel.total_customers} Kunden · Wie viele mindestens diese Stufe
            erreicht haben.
          </p>

          <ul className="funnel-chart">
            {funnel.stages.map((stage, i) => {
              const breite = (stage.reached / maxReached) * 100
              return (
                <li key={stage.stage}>
                  <span className="funnel-label">{stage.label}</span>
                  <span className="funnel-track">
                    <span
                      className="funnel-bar"
                      style={{
                        width: `${Math.max(breite, 1.5)}%`,
                        background: FUNNEL_RAMP[i] ?? FUNNEL_RAMP.at(-1),
                      }}
                      title={`${stage.label}: ${stage.reached} erreicht, ${stage.current} stehen hier`}
                    />
                  </span>
                  <span className="funnel-value">{stage.reached}</span>
                </li>
              )
            })}
          </ul>

          <div className="funnel-quotes">
            <div>
              <small>Kontakt → Termin</small>
              <strong>{funnel.contact_to_appointment_percent} %</strong>
            </div>
            <div>
              <small>Termin → Verkauf</small>
              <strong>{funnel.appointment_to_sale_percent} %</strong>
            </div>
            <div>
              <small>Abschlussquote gesamt</small>
              <strong>{funnel.close_rate_percent} %</strong>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Produkt-Ranking ---------- */}
      {products.length > 0 && (
        <section className="card insights-card">
          <div className="section-title">
            <h2>Meistverkaufte Produkte</h2>
          </div>
          <p className="insights-note">Nach Umsatz, laufender Monat.</p>

          <ul className="rank-chart">
            {products.map(p => (
              <li key={p.name}>
                <span className="rank-label" title={p.name}>{p.name}</span>
                <span className="rank-track">
                  <span
                    className="rank-bar"
                    style={{
                      width: `${Math.max((p.revenue_cents / maxRevenue) * 100, 1.5)}%`,
                      background: BAR_COLOR,
                    }}
                    title={`${p.name}: ${p.quantity}× · ${p.share_percent} % vom Umsatz`}
                  />
                </span>
                <span className="rank-value">{money(p.revenue_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
