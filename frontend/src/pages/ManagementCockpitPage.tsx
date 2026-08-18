import {useCallback, useEffect, useState} from 'react'
import {AlertTriangle, CalendarX, Info, PackageX, TrendingDown} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'
import {api, money} from '../lib/api'
import {useToast} from '../components/Toast'
import {ForecastCard} from '../components/ForecastCard'
import {LoadError} from '../components/LoadError'
import type {OrgLookup} from '../types'

type EmployeeOption = {id:string; display_name:string}

type CockpitAlert = {kind:string; severity:'critical'|'warn'|'info'; employee:string; title:string; detail:string}
type ProductRow = {name:string; category:string|null; quantity:number; revenue_cents:number; units:number; share_percent:number}
type FunnelStageRow = {stage:string; label:string; current:number; reached:number}
type FunnelData = {
  total_customers:number; stages:FunnelStageRow[]
  contact_to_appointment_percent:number; appointment_to_sale_percent:number; close_rate_percent:number
}
type Cockpit = {
  period:string; employee_count:number
  revenue_cents:number; units:number; sales_count:number; revenue_per_sale_cents:number
  appointments_total:number; appointments_done:number; presentations:number
  close_rate_percent:number; revenue_per_appointment_cents:number
  offers_created:number; offers_converted:number; offers_conversion_rate_percent:number; offers_total_value_cents:number
  goal_units_target:number; goal_units_achieved:number; goal_percent:number
  open_follow_ups:number; overdue_follow_ups:number
  products:ProductRow[]; funnel:FunnelData; alerts:CockpitAlert[]
}

const PERIODS: {value:string; label:string}[] = [
  {value: 'day', label: 'Heute'},
  {value: 'week', label: 'Diese Woche'},
  {value: 'month', label: 'Dieser Monat'},
  {value: 'quarter', label: 'Dieses Quartal'},
  {value: 'year', label: 'Dieses Jahr'},
]

const ALERT_ICON: Record<string, LucideIcon> = {
  revenue_drop: TrendingDown,
  no_appointments: CalendarX,
  low_close_rate: AlertTriangle,
  overdue_followups: AlertTriangle,
  overdue_rentals: PackageX,
}

const SEVERITY_LABEL: Record<string, string> = {critical: 'Kritisch', warn: 'Beachten', info: 'Hinweis'}

const FUNNEL_RAMP = ['#3dd27b', '#37bc6e', '#31a661', '#2c9155', '#277c49', '#22683e', '#1d5433']
const BAR_COLOR = '#2c9155'

export function ManagementCockpitPage(){
  const toast = useToast()

  const [data, setData] = useState<Cockpit | null>(null)
  const [org, setOrg] = useState<OrgLookup | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [ladefehler, setLadefehler] = useState<string | null>(null)

  const [period, setPeriod] = useState('month')
  const [employeeId, setEmployeeId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [regionId, setRegionId] = useState('')

  useEffect(() => {
    api<OrgLookup>('/team/org-lookup').then(setOrg).catch(() => setOrg(null))
    api<EmployeeOption[]>('/team/employees').then(setEmployees).catch(() => setEmployees([]))
  }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({period})
    if (employeeId) params.set('employee_id', employeeId)
    if (teamId) params.set('team_id', teamId)
    if (districtId) params.set('district_id', districtId)
    if (regionId) params.set('region_id', regionId)

    setLoading(true)
    api<Cockpit>(`/dashboard/cockpit?${params.toString()}`)
      .then(cockpit => {
        setData(cockpit)
        setLadefehler(null)
      })
      .catch(err => {
        const meldungText = err instanceof Error ? err.message : 'Cockpit konnte nicht geladen werden'
        toast(meldungText, 'error')
        setLadefehler(meldungText)
      })
      .finally(() => setLoading(false))
  }, [period, employeeId, teamId, districtId, regionId, toast])

  useEffect(load, [load])

  const maxReached = data ? Math.max(...data.funnel.stages.map(s => s.reached), 1) : 1
  const maxRevenue = data && data.products.length ? Math.max(...data.products.map(p => p.revenue_cents), 1) : 1

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Management-Cockpit</h1>
          <p>Führungskennzahlen für Team, Bezirk, Region oder das ganze Unternehmen.</p>
        </div>
      </div>

      <section className="sales-filter-panel card">
        <label>
          Zeitraum
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <label>
          Mitarbeiter
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">Alle Mitarbeiter</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.display_name}</option>)}
          </select>
        </label>

        {org && (
          <>
            <label>
              Region
              <select value={regionId} onChange={e => setRegionId(e.target.value)}>
                <option value="">Alle Regionen</option>
                {org.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label>
              Bezirk
              <select value={districtId} onChange={e => setDistrictId(e.target.value)}>
                <option value="">Alle Bezirke</option>
                {org.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>
              Team
              <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                <option value="">Alle Teams</option>
                {org.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </>
        )}

        {data && (
          <div className="sales-filter-result">
            <strong>{data.employee_count}</strong> Mitarbeiter im Ausschnitt
          </div>
        )}
      </section>

      {loading && !data ? (
        <p className="muted">Cockpit wird geladen…</p>
      ) : !data && ladefehler ? (
        <LoadError meldung={ladefehler} onRetry={load} />
      ) : data && (
        <>
          <div className="stat-grid">
            <div className="stat-card green">
              <small>Umsatz</small>
              <strong>{money(data.revenue_cents)}</strong>
            </div>
            <div className="stat-card">
              <small>Einheiten</small>
              <strong>{data.units}</strong>
            </div>
            <div className="stat-card">
              <small>Verkäufe</small>
              <strong>{data.sales_count}</strong>
            </div>
            <div className="stat-card">
              <small>Umsatz pro Verkauf</small>
              <strong>{money(data.revenue_per_sale_cents)}</strong>
            </div>
            <div className="stat-card">
              <small>Termine</small>
              <strong>{data.appointments_done} / {data.appointments_total}</strong>
            </div>
            <div className="stat-card">
              <small>Vorführungen</small>
              <strong>{data.presentations}</strong>
            </div>
            <div className="stat-card">
              <small>Abschlussquote</small>
              <strong>{data.close_rate_percent} %</strong>
            </div>
            <div className="stat-card">
              <small>Umsatz pro Termin</small>
              <strong>{money(data.revenue_per_appointment_cents)}</strong>
            </div>
            <div className="stat-card">
              <small>Angebote erstellt</small>
              <strong>{data.offers_created}</strong>
            </div>
            <div className="stat-card">
              <small>Angebote umgewandelt</small>
              <strong>{data.offers_converted} ({data.offers_conversion_rate_percent} %)</strong>
            </div>
            <div className={data.goal_percent >= 100 ? 'stat-card green' : 'stat-card'}>
              <small>Zielerreichung</small>
              <strong>{data.goal_units_achieved} / {data.goal_units_target} ({data.goal_percent} %)</strong>
            </div>
            <div className={data.overdue_follow_ups > 0 ? 'stat-card orange' : 'stat-card'}>
              <small>Nachfassaktionen</small>
              <strong>{data.open_follow_ups} offen · {data.overdue_follow_ups} überfällig</strong>
            </div>
          </div>

          <ForecastCard employeeId={employeeId} teamId={teamId} districtId={districtId} regionId={regionId} />

          {data.alerts.length > 0 && (
            <section className="card insights-card">
              <div className="section-title"><h2>Auffällig</h2></div>
              <p className="insights-note">Feste Schwellen, keine Prognose – jeder Hinweis nennt die Zahl dahinter.</p>
              <ul className="alert-list">
                {data.alerts.map((a, i) => {
                  const Icon = ALERT_ICON[a.kind] ?? Info
                  return (
                    <li key={`${a.kind}-${a.employee}-${i}`} className={`alert ${a.severity}`}>
                      <span className="alert-icon"><Icon size={16} /></span>
                      <div className="alert-body">
                        <div className="alert-head">
                          <strong>{a.title}</strong>
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

          <div className="dash-row dash-row-two">
            <section className="card insights-card">
              <div className="section-title"><h2>Verkaufstrichter</h2></div>
              <p className="insights-note">
                {data.funnel.total_customers} Kunden · Wie viele mindestens diese Stufe erreicht haben.
              </p>
              <ul className="funnel-chart">
                {data.funnel.stages.map((stage, i) => {
                  const breite = (stage.reached / maxReached) * 100
                  return (
                    <li key={stage.stage}>
                      <span className="funnel-label">{stage.label}</span>
                      <span className="funnel-track">
                        <span
                          className="funnel-bar"
                          style={{width: `${Math.max(breite, 1.5)}%`, background: FUNNEL_RAMP[i] ?? FUNNEL_RAMP.at(-1)}}
                          title={`${stage.label}: ${stage.reached} erreicht, ${stage.current} stehen hier`}
                        />
                      </span>
                      <span className="funnel-value">{stage.reached}</span>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="card insights-card">
              <div className="section-title"><h2>Produktmix</h2></div>
              <p className="insights-note">Meistverkaufte Produkte nach Umsatz, im gewählten Zeitraum.</p>
              {data.products.length === 0 ? (
                <p className="dash-empty">Keine Verkäufe im Zeitraum</p>
              ) : (
                <ul className="rank-chart">
                  {data.products.map(p => (
                    <li key={p.name}>
                      <span className="rank-label" title={p.name}>{p.name}</span>
                      <span className="rank-track">
                        <span
                          className="rank-bar"
                          style={{width: `${Math.max((p.revenue_cents / maxRevenue) * 100, 1.5)}%`, background: BAR_COLOR}}
                          title={`${p.name}: ${p.quantity}× · ${p.share_percent} % vom Umsatz`}
                        />
                      </span>
                      <span className="rank-value">{money(p.revenue_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
