import {useEffect, useState} from 'react'
import {AlertTriangle, CalendarX, Info, PackageX, TrendingDown} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import {api, money} from '../lib/api'

/**
 * Zielerreichung je Mitarbeiter und Hinweise auf auffällige Entwicklungen.
 *
 * Hinweise tragen immer Symbol UND Text – die Farbe ist eine Zugabe, nie der
 * einzige Träger der Information. Warnung und Kritisch sind bewusst weit
 * auseinander gewählt, damit sie auch bei Farbsehschwäche unterscheidbar
 * bleiben.
 */

type EmployeeRow = {
  employee_id: string
  display_name: string
  units_month: number
  units_target: number
  units_missing: number
  percent: number
  revenue_month_cents: number
  appointments_done: number
  close_rate_percent: number
}

type Alert = {
  kind: string
  severity: 'critical' | 'warn' | 'info'
  employee: string
  title: string
  detail: string
}

type Overview = {
  employees: EmployeeRow[]
  alerts: Alert[]
}

const ALERT_ICON: Record<string, LucideIcon> = {
  revenue_drop: TrendingDown,
  no_appointments: CalendarX,
  low_close_rate: AlertTriangle,
  overdue_followups: AlertTriangle,
  overdue_rentals: PackageX,
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Kritisch',
  warn: 'Beachten',
  info: 'Hinweis',
}

export function TeamOverview() {
  const [data, setData] = useState<Overview | null>(null)

  useEffect(() => {
    api<Overview>('/dashboard/team-overview').then(setData).catch(() => {})
  }, [])

  if (!data) return null

  return (
    <>
      {data.alerts.length > 0 && (
        <section className="card insights-card">
          <div className="section-title">
            <h2>Auffällig</h2>
          </div>
          <p className="insights-note">
            Feste Schwellen, keine Prognose – jeder Hinweis nennt die Zahl dahinter.
          </p>

          <ul className="alert-list">
            {data.alerts.map((a, i) => {
              const Icon = ALERT_ICON[a.kind] ?? Info
              return (
                <li key={`${a.kind}-${a.employee}-${i}`} className={`alert ${a.severity}`}>
                  <span className="alert-icon">
                    <Icon size={16} />
                  </span>
                  <div className="alert-body">
                    <div className="alert-head">
                      <strong>{a.title}</strong>
                      {/* Textmarke, damit die Schwere nicht nur an der Farbe hängt */}
                      <span className="alert-severity">{SEVERITY_LABEL[a.severity]}</span>
                    </div>
                    <p>{a.detail}</p>
                    <small>{a.employee}</small>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card insights-card">
        <div className="section-title">
          <h2>Zielerreichung im Monat</h2>
        </div>

        <ul className="goal-list">
          {data.employees.map(e => {
            const erreicht = Math.min(e.percent, 100)
            const geschafft = e.percent >= 100
            return (
              <li key={e.employee_id}>
                <div className="goal-head">
                  <strong>{e.display_name}</strong>
                  <span className="goal-value">
                    {e.units_month} / {e.units_target} Einheiten · {e.percent} %
                  </span>
                </div>

                <span className="goal-track">
                  <span
                    className={geschafft ? 'goal-bar reached' : 'goal-bar'}
                    style={{width: `${Math.max(erreicht, 1)}%`}}
                  />
                </span>

                <div className="goal-meta">
                  <span>{money(e.revenue_month_cents)} Umsatz</span>
                  <span>{e.appointments_done} Termine</span>
                  <span>{e.close_rate_percent} % Abschluss</span>
                  {!geschafft && <span>noch {e.units_missing} Einheiten</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
