import {useEffect, useState} from 'react'
import {AlertTriangle} from 'lucide-react'
import {api, money} from '../lib/api'
import {useToast} from '../components/Toast'
import {LoadError} from '../components/LoadError'
import type {OrgLookup} from '../types'

type EmployeeOption = {id:string; display_name:string}

type Row = {
  id:string; name:string; employee_count:number
  revenue_cents:number; units:number; sales_count:number
  appointments_total:number; appointments_done:number; close_rate_percent:number; has_enough_data:boolean
  goal_units_target:number; goal_units_achieved:number; goal_percent:number
}

type Comparison = {level:string; period:string; rows:Row[]; minimum_appointments_for_quote:number}

const LEVELS: {value:string; label:string}[] = [
  {value: 'employee', label: 'Mitarbeiter'},
  {value: 'team', label: 'Team'},
  {value: 'district', label: 'Bezirk'},
  {value: 'region', label: 'Region'},
]

const PERIODS: {value:string; label:string}[] = [
  {value: 'day', label: 'Heute'},
  {value: 'week', label: 'Diese Woche'},
  {value: 'month', label: 'Dieser Monat'},
  {value: 'quarter', label: 'Dieses Quartal'},
  {value: 'year', label: 'Dieses Jahr'},
  {value: 'custom', label: 'Eigener Zeitraum'},
]

const dt = () => new Date().toISOString().slice(0, 10)

export function ComparisonPage(){
  const toast = useToast()

  const [data, setData] = useState<Comparison | null>(null)
  const [org, setOrg] = useState<OrgLookup | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [level, setLevel] = useState('employee')
  const [period, setPeriod] = useState('month')
  const [dateFrom, setDateFrom] = useState(dt())
  const [dateTo, setDateTo] = useState(dt())
  const [teamId, setTeamId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [regionId, setRegionId] = useState('')

  useEffect(() => {
    api<OrgLookup>('/team/org-lookup').then(setOrg).catch(() => setOrg(null))
    api<EmployeeOption[]>('/team/employees').then(setEmployees).catch(() => setEmployees([]))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams({level, period})
    if (period === 'custom') {
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
    }
    if (teamId) params.set('team_id', teamId)
    if (districtId) params.set('district_id', districtId)
    if (regionId) params.set('region_id', regionId)

    setLoading(true)
    api<Comparison>(`/team/comparison?${params.toString()}`)
      .then(result => {
        setData(result)
        setLadefehler(null)
      })
      .catch(err => {
        const meldungText = err instanceof Error ? err.message : 'Vergleich konnte nicht geladen werden'
        toast(meldungText, 'error')
        setLadefehler(meldungText)
      })
      .finally(() => setLoading(false))
  }, [level, period, dateFrom, dateTo, teamId, districtId, regionId, reloadNonce])

  const rows = [...(data?.rows ?? [])].sort((a, b) => b.revenue_cents - a.revenue_cents)
  const employeeCountLabel = employees.length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vergleich</h1>
          <p>Mitarbeiter, Teams, Bezirke und Regionen nebeneinander - mit denselben Kennzahlen wie das Cockpit.</p>
        </div>
      </div>

      <div className="followup-tabs" role="tablist">
        {LEVELS.map(l => (
          <button
            key={l.value}
            role="tab"
            aria-selected={level === l.value}
            className={level === l.value ? 'is-active' : ''}
            onClick={() => setLevel(l.value)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <section className="sales-filter-panel card">
        <label>
          Zeitraum
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        {period === 'custom' && (
          <>
            <label>
              Von
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </label>
            <label>
              Bis
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} />
            </label>
          </>
        )}

        {org && level !== 'region' && (
          <label>
            Region
            <select value={regionId} onChange={e => setRegionId(e.target.value)}>
              <option value="">Alle Regionen</option>
              {org.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}

        {org && (level === 'employee' || level === 'team') && (
          <label>
            Bezirk
            <select value={districtId} onChange={e => setDistrictId(e.target.value)}>
              <option value="">Alle Bezirke</option>
              {org.districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}

        {org && level === 'employee' && (
          <label>
            Team
            <select value={teamId} onChange={e => setTeamId(e.target.value)}>
              <option value="">Alle Teams</option>
              {org.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
      </section>

      {loading && !data ? (
        <p className="muted">Vergleich wird geladen…</p>
      ) : !data && ladefehler ? (
        <LoadError meldung={ladefehler} onRetry={() => setReloadNonce(n => n + 1)} />
      ) : rows.length === 0 ? (
        <p className="muted">
          {level === 'employee' && employeeCountLabel === 0
            ? 'Noch keine Mitarbeiter angelegt.'
            : 'Für diese Auswahl liegen keine Daten vor.'}
        </p>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>{LEVELS.find(l => l.value === level)?.label}</th>
                <th>Umsatz</th>
                <th>Einheiten</th>
                <th>Verkäufe</th>
                <th>Termine</th>
                <th>Quote</th>
                <th>Ziel (laufender Monat)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                    {level !== 'employee' && <span className="table-subtext"> · {row.employee_count} Mitarbeiter</span>}
                  </td>
                  <td>{money(row.revenue_cents)}</td>
                  <td>{row.units}</td>
                  <td>{row.sales_count}</td>
                  <td>{row.appointments_done} / {row.appointments_total}</td>
                  <td>
                    {row.has_enough_data ? (
                      `${row.close_rate_percent} %`
                    ) : (
                      <span
                        className="comparison-low-data"
                        title={`Weniger als ${data?.minimum_appointments_for_quote ?? 3} durchgeführte Termine - die Quote ist noch nicht verlässlich.`}
                      >
                        <AlertTriangle size={13} /> zu wenig Daten
                      </span>
                    )}
                  </td>
                  <td>
                    {row.goal_units_target
                      ? `${row.goal_units_achieved} / ${row.goal_units_target} (${row.goal_percent} %)`
                      : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
