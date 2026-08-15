import {useEffect, useState} from 'react'
import {
  AlarmClock,
  CalendarDays,
  Lightbulb,
  PackageCheck,
  Route as RouteIcon,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {Link} from 'react-router-dom'
import {api, money} from '../lib/api'

type Task = {
  kind: string
  priority: number
  title: string
  detail: string
  count: number
  link: string
}

type Briefing = {
  date: string
  for_name: string
  scope: 'own' | 'team'
  tasks: Task[]
  route: {stops: number; without_address: number; first_at: string | null; last_at: string | null}
  goal: {
    units_month: number
    units_target: number
    units_missing: number
    units_percent: number
    working_days_left: number
    needed_per_working_day: number
    expected_by_today: number
    on_track: boolean
  }
  development: {
    revenue_cents: number
    revenue_previous_cents: number
    revenue_change_percent: number | null
    close_rate_percent: number
    close_rate_percent_previous: number
    reasons: string[]
  }
  recommendations: string[]
  team?: {alerts: {severity?: string; title?: string; message?: string}[]; employees_behind: unknown[]}
}

const ICONS: Record<string, typeof AlarmClock> = {
  followup_overdue: AlarmClock,
  followup_today: AlarmClock,
  appointments: CalendarDays,
  rental_overdue: PackageCheck,
  rental_due_soon: PackageCheck,
}

/**
 * Tagesbriefing aus echten Daten.
 *
 * Die Zahlen kommen fertig gerechnet vom Server – kein Sprachmodell
 * beteiligt. Deshalb steht hier auch etwas, wenn kein KI-Schlüssel
 * hinterlegt ist.
 */
export function DayBriefing() {
  const [daten, setDaten] = useState<Briefing | null>(null)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    api<Briefing>('/assistant/briefing')
      .then(setDaten)
      .catch(() => setFehler(true))
  }, [])

  if (fehler) return null
  if (!daten) return <div className="briefing-laedt">Tagesbriefing wird zusammengestellt…</div>

  const {goal: ziel, development: entwicklung} = daten
  const hoch = entwicklung.revenue_change_percent !== null && entwicklung.revenue_change_percent >= 0
  const TrendIcon = hoch ? TrendingUp : TrendingDown

  return (
    <div className="briefing">
      <div className="briefing-kopf">
        <h2>Was heute ansteht</h2>
        {daten.scope === 'team' && <span className="briefing-scope">gesamtes Team</span>}
      </div>

      {daten.tasks.length === 0 ? (
        <p className="briefing-leer">
          Keine offenen Wiedervorlagen, Termine oder Rückholungen für heute.
        </p>
      ) : (
        <ul className="briefing-aufgaben">
          {daten.tasks.map(aufgabe => {
            const Icon = ICONS[aufgabe.kind] ?? CalendarDays
            return (
              <li key={aufgabe.kind} className={aufgabe.priority === 1 ? 'is-dringend' : undefined}>
                <Link to={aufgabe.link}>
                  <span className="briefing-icon">
                    <Icon size={16} />
                  </span>
                  <span className="briefing-text">
                    <strong>{aufgabe.title}</strong>
                    {aufgabe.detail && <small>{aufgabe.detail}</small>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <div className="briefing-kennzahlen">
        {ziel.units_target > 0 && (
          <div>
            <span className="briefing-kennzahl-kopf">
              <Target size={14} /> Monatsziel
            </span>
            <strong>
              {ziel.units_month} / {ziel.units_target}
            </strong>
            <small className={ziel.on_track ? 'ist-gut' : 'ist-knapp'}>
              {ziel.units_missing <= 0
                ? 'erreicht'
                : ziel.working_days_left === 0
                  ? `${ziel.units_missing} offen, Monat vorbei`
                  : `${ziel.needed_per_working_day.toLocaleString('de-DE')} pro Arbeitstag · ${ziel.working_days_left} übrig`}
            </small>
          </div>
        )}

        <div>
          <span className="briefing-kennzahl-kopf">
            <TrendIcon size={14} /> Woche
          </span>
          <strong>{money(entwicklung.revenue_cents)}</strong>
          <small className={hoch ? 'ist-gut' : 'ist-knapp'}>
            {entwicklung.revenue_change_percent === null
              ? 'kein Vorwochenwert'
              : `${entwicklung.revenue_change_percent > 0 ? '+' : ''}${entwicklung.revenue_change_percent.toLocaleString('de-DE')}% vs. Vorwoche`}
          </small>
        </div>

        {daten.route.stops > 0 && (
          <div>
            <span className="briefing-kennzahl-kopf">
              <RouteIcon size={14} /> Route heute
            </span>
            <strong>{daten.route.stops}</strong>
            <small>
              {daten.route.without_address > 0
                ? `${daten.route.without_address} ohne Adresse`
                : 'Stopps mit Adresse'}
            </small>
          </div>
        )}
      </div>

      {entwicklung.reasons.length > 0 && (
        <p className="briefing-grund">
          <strong>Warum:</strong> {entwicklung.reasons.join(', ')}.
        </p>
      )}

      {daten.recommendations.length > 0 && (
        <div className="briefing-vorschlaege">
          <span className="briefing-kennzahl-kopf">
            <Lightbulb size={14} /> Vorschlag
          </span>
          <ul>
            {daten.recommendations.map(satz => (
              <li key={satz}>{satz}</li>
            ))}
          </ul>
        </div>
      )}

      {daten.team && daten.team.alerts.length > 0 && (
        <div className="briefing-team">
          <span className="briefing-kennzahl-kopf">Team</span>
          <ul>
            {daten.team.alerts.slice(0, 4).map((hinweis, index) => (
              <li key={index}>{hinweis.message || hinweis.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
