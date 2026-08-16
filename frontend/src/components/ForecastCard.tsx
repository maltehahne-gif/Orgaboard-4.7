import {useEffect, useState} from 'react'
import {CheckCircle2, AlertTriangle, XCircle} from 'lucide-react'
import {api, money} from '../lib/api'

type Forecast = {
  as_of:string
  employee_count:number
  working_days_total:number
  working_days_elapsed:number
  working_days_left:number
  units_target:number
  units_achieved:number
  units_missing:number
  units_needed_per_day:number
  units_projected_month_end:number
  revenue_target_cents:number|null
  revenue_achieved_cents:number
  revenue_missing_cents:number|null
  revenue_needed_per_day_cents:number|null
  revenue_projected_month_end_cents:number
  status:'green'|'yellow'|'red'
}

const STATUS_LABEL: Record<string, string> = {
  green: 'Ziel voraussichtlich erreichbar',
  yellow: 'Ziel gefährdet',
  red: 'Ziel voraussichtlich nicht erreichbar',
}

const STATUS_ICON = {green: CheckCircle2, yellow: AlertTriangle, red: XCircle}

type Props = {
  employeeId?: string
  teamId?: string
  districtId?: string
  regionId?: string
  title?: string
}

export function ForecastCard({employeeId, teamId, districtId, regionId, title}: Props){
  const [data, setData] = useState<Forecast | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (employeeId) params.set('employee_id', employeeId)
    if (teamId) params.set('team_id', teamId)
    if (districtId) params.set('district_id', districtId)
    if (regionId) params.set('region_id', regionId)
    const query = params.toString()

    api<Forecast>(`/dashboard/forecast${query ? `?${query}` : ''}`)
      .then(antwort => {
        if (antwort && typeof antwort.status === 'string') setData(antwort)
      })
      .catch(() => {})
  }, [employeeId, teamId, districtId, regionId])

  if (!data) return null

  const Icon = STATUS_ICON[data.status]

  return (
    <section className="card insights-card forecast-card">
      <div className="section-title">
        <h2>{title ?? 'Zielprognose – laufender Monat'}</h2>
        <span className={`forecast-status forecast-status-${data.status}`} style={{marginLeft: 'auto'}}>
          <Icon size={14} /> {STATUS_LABEL[data.status]}
        </span>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <small>Monatsziel</small>
          <strong>{data.units_target} Einheiten</strong>
        </div>
        <div className="kpi">
          <small>Aktueller Stand</small>
          <strong>{data.units_achieved} Einheiten</strong>
          <span className="kpi-sub">{data.units_missing} fehlen noch</span>
        </div>
        <div className="kpi">
          <small>Verbleibende Arbeitstage</small>
          <strong>{data.working_days_left}</strong>
        </div>
        <div className="kpi">
          <small>Benötigt pro Tag</small>
          <strong>{data.units_needed_per_day} Einheiten</strong>
        </div>
        <div className="kpi">
          <small>Prognostizierter Monatsabschluss</small>
          <strong>{data.units_projected_month_end} Einheiten</strong>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <small>Umsatz bisher</small>
          <strong>{money(data.revenue_achieved_cents)}</strong>
        </div>
        <div className="kpi">
          <small>Prognostizierter Umsatz</small>
          <strong>{money(data.revenue_projected_month_end_cents)}</strong>
        </div>
        {data.revenue_target_cents !== null ? (
          <>
            <div className="kpi">
              <small>Umsatzziel</small>
              <strong>{money(data.revenue_target_cents)}</strong>
              <span className="kpi-sub">{money(data.revenue_missing_cents ?? 0)} fehlen noch</span>
            </div>
            <div className="kpi">
              <small>Benötigter Tagesumsatz</small>
              <strong>{money(data.revenue_needed_per_day_cents ?? 0)}</strong>
            </div>
          </>
        ) : (
          <div className="kpi">
            <small>Umsatzziel</small>
            <strong className="muted">Kein Tagesumsatz-Ziel hinterlegt</strong>
          </div>
        )}
      </div>
    </section>
  )
}
