import {useEffect, useMemo, useRef, useState} from 'react'
import {AlarmClock, Building2, CalendarClock, MapPin, Search, Users, X} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {api, money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {FUNNEL_ORDER, FUNNEL_COLUMN_LABELS} from '../lib/funnel'
import type {OrgLookup, PipelineCard, PipelineResponse} from '../types'
import {useToast} from '../components/Toast'
import {LoadError} from '../components/LoadError'

type EmployeeOption = {id:string; display_name:string}

function relativeDate(iso:string){
  const date = new Date(iso)
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 14) return `vor ${days} Tagen`
  return new Intl.DateTimeFormat('de-DE', {day:'2-digit', month:'2-digit', year:'numeric'}).format(date)
}

export function CrmPipelinePage(){
  const navigate = useNavigate()
  const {me} = useAuth()
  const isTeamLeader = darfVerwalten(me?.role)

  const toast = useToast()
  const [data, setData] = useState<PipelineResponse | null>(null)
  const [org, setOrg] = useState<OrgLookup | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const [q, setQ] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [regionId, setRegionId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!isTeamLeader) return
    api<OrgLookup>('/team/org-lookup').then(setOrg).catch(() => setOrg(null))
    api<EmployeeOption[]>('/team/employees').then(setEmployees).catch(() => setEmployees([]))
  }, [isTeamLeader])

  // Zaehlt jeden tatsaechlich abgeschickten Abruf durch. Kommt eine Antwort
  // zurueck, die nicht mehr zum zuletzt gestarteten Abruf gehoert, wird sie
  // verworfen - sonst koennte eine spaet eintreffende Antwort auf einen
  // aelteren Filterstand (z. B. "M") das bereits sichtbare, neuere Ergebnis
  // ("Ma") ueberschreiben.
  const pipelineRequestId = useRef(0)

  useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (employeeId) params.set('employee_id', employeeId)
    if (teamId) params.set('team_id', teamId)
    if (districtId) params.set('district_id', districtId)
    if (regionId) params.set('region_id', regionId)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    setLoading(true)
    const query = params.toString()

    // Entprellt: wer schnell tippt, loest sonst pro Anschlag einen eigenen
    // Abruf aus.
    const timer = setTimeout(() => {
      const myId = ++pipelineRequestId.current
      api<PipelineResponse>(`/pipeline${query ? `?${query}` : ''}`)
        .then(result => {
          if (pipelineRequestId.current !== myId) return
          setData(result)
          setLadefehler(null)
        })
        .catch(err => {
          if (pipelineRequestId.current !== myId) return
          const meldungText = err instanceof Error ? err.message : 'Pipeline konnte nicht geladen werden'
          toast(meldungText, 'error')
          setLadefehler(meldungText)
        })
        .finally(() => {
          if (pipelineRequestId.current !== myId) return
          setLoading(false)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [q, employeeId, teamId, districtId, regionId, dateFrom, dateTo, reloadNonce])

  const columns = useMemo(() => {
    const grouped: Record<string, PipelineCard[]> = {}
    for (const stage of FUNNEL_ORDER) grouped[stage] = []
    for (const card of data?.customers ?? []) {
      (grouped[card.stage] ??= []).push(card)
    }
    return grouped
  }, [data])

  function resetFilters(){
    setQ(''); setEmployeeId(''); setTeamId(''); setDistrictId(''); setRegionId(''); setDateFrom(''); setDateTo('')
  }

  const hasFilters = Boolean(q || employeeId || teamId || districtId || regionId || dateFrom || dateTo)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p>Jeder Kunde an der Stelle im Vertriebsprozess, an der er gerade steht.</p>
        </div>
      </div>

      <section className="sales-filter-panel card">
        <div className="sales-filter-search">
          <Search size={17} />
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Kunde suchen – Name, Telefon, Ort …" />
        </div>

        {isTeamLeader && (
          <label>
            Mitarbeiter
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Alle Mitarbeiter</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.display_name}</option>)}
            </select>
          </label>
        )}

        {isTeamLeader && org && (
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

        <label>
          Letzter Kontakt von
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </label>
        <label>
          bis
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} />
        </label>

        {hasFilters && (
          <button type="button" className="sales-filter-reset" onClick={resetFilters}>
            <X size={16} />
            Filter zurücksetzen
          </button>
        )}

        <div className="sales-filter-result">
          <strong>{data?.customers.length ?? 0}</strong> {data?.customers.length === 1 ? 'Kunde' : 'Kunden'}
        </div>
      </section>

      {loading && !data ? (
        <p className="muted">Pipeline wird geladen…</p>
      ) : !data && ladefehler ? (
        <LoadError meldung={ladefehler} onRetry={() => setReloadNonce(n => n + 1)} />
      ) : (
        <div className="pipeline-board">
          {FUNNEL_ORDER.map(stage => (
            <div className="pipeline-column" key={stage}>
              <div className="pipeline-column-head">
                <span>{FUNNEL_COLUMN_LABELS[stage]}</span>
                <span className="pipeline-column-count">{data?.counts[stage] ?? 0}</span>
              </div>

              <div className="pipeline-column-body">
                {columns[stage].length === 0 && (
                  <p className="pipeline-column-empty">Keine Kunden</p>
                )}

                {columns[stage].map(card => (
                  <button
                    type="button"
                    key={card.customer_id}
                    className="pipeline-card"
                    onClick={() => navigate(`/kunden/${card.customer_id}`)}
                  >
                    <strong className="pipeline-card-name">{card.customer_name}</strong>

                    {isTeamLeader && (
                      <span className="pipeline-card-meta">
                        <Users size={13} /> {card.employee_name}
                      </span>
                    )}

                    {card.team_name && (
                      <span className="pipeline-card-meta">
                        <Building2 size={13} /> {card.team_name}
                      </span>
                    )}

                    {card.customer_city && (
                      <span className="pipeline-card-meta">
                        <MapPin size={13} /> {card.customer_city}
                      </span>
                    )}

                    <span className="pipeline-card-meta">
                      <CalendarClock size={13} /> Kontakt {relativeDate(card.last_contact_at)}
                    </span>

                    {card.next_follow_up && (
                      <span className={card.next_follow_up.is_overdue ? 'pipeline-card-alert' : 'pipeline-card-meta'}>
                        <AlarmClock size={13} />
                        {card.next_follow_up.is_overdue ? 'Nachfassen überfällig' : card.next_action}
                      </span>
                    )}
                    {!card.next_follow_up && (
                      <span className="pipeline-card-next">{card.next_action}</span>
                    )}

                    {card.potential_revenue_cents !== null && (
                      <span className="pipeline-card-revenue">{money(card.potential_revenue_cents)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
