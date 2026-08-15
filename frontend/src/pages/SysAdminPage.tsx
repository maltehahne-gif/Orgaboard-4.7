import {FormEvent, useCallback, useEffect, useState} from 'react'
import {
  Building2,
  Gauge,
  KeyRound,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import {api, money} from '../lib/api'
import {useToast} from '../components/Toast'
import type {Role} from '../types'

type Reiter = 'uebersicht' | 'benutzer' | 'struktur' | 'einstellungen'

type Recht = {
  permission: string
  label: string
  from_role: boolean
  override: boolean | null
  effective: boolean
  locked: boolean
}

type Benutzer = {
  id: string
  email: string
  full_name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role: Role
  role_label: string
  is_active: boolean
  must_change_password: boolean
  employee: {
    id: string
    position: string
    employee_number: string | null
    hired_on: string | null
    location: string | null
    monthly_units_target: number
    team_id: string | null
    team: string | null
    district: string | null
    region: string | null
  } | null
  permissions?: Recht[]
  start_password?: string
}

type TeamKnoten = {id: string; name: string; lead_name: string | null; is_active: boolean; employees: number}
type BezirkKnoten = {id: string; name: string; lead_name: string | null; is_active: boolean; employees: number; teams: TeamKnoten[]}
type RegionKnoten = {id: string; name: string; lead_name: string | null; is_active: boolean; employees: number; districts: BezirkKnoten[]}
type Org = {regions: RegionKnoten[]; employees_without_team: number}

type Uebersicht = {
  users: {total: number; active: number; inactive: number; by_role: Record<string, number>}
  data: {customers: number; appointments: number; sales: number; products: number; rentals_open: number; trade_ins: number}
  revenue: {month_cents: number; total_cents: number}
  org: {regions: number; districts: number; teams: number; employees_without_team: number}
  system: {server_time: string; system_admins: number}
}

type Einstellung = {key: string; label: string; value: {v: unknown} | null}
type RolleOption = {value: Role; label: string; rank: number}

const LEERER_BENUTZER = {
  first_name: '', last_name: '', email: '', role: 'EMPLOYEE' as Role,
  phone: '', position: 'Vertriebspartner', employee_number: '',
  hired_on: '', location: '', team_id: '', monthly_units_target: 30,
}

/**
 * Betreiberbereich.
 *
 * Getrennt von der Verwaltung der Teamleitung. Was hier steht, geht nur den
 * Inhaber an – und jede Prüfung sitzt zusätzlich im Backend: eine versteckte
 * Schaltfläche ist kein Schutz.
 */
export function SysAdminPage() {
  const [reiter, setReiter] = useState<Reiter>('uebersicht')
  const toast = useToast()

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Systemverwaltung</h1>
          <p>Plattform, Benutzer, Struktur und Einstellungen – nur für den Betreiber.</p>
        </div>
      </div>

      <div className="rental-tabs sysadmin-tabs">
        {([
          ['uebersicht', 'Übersicht', <Gauge size={15} key="i" />],
          ['benutzer', 'Benutzer', <Users size={15} key="i" />],
          ['struktur', 'Struktur', <Building2 size={15} key="i" />],
          ['einstellungen', 'Einstellungen', <Settings2 size={15} key="i" />],
        ] as const).map(([wert, beschriftung, symbol]) => (
          <button
            key={wert}
            type="button"
            className={reiter === wert ? 'plain-button is-active' : 'plain-button'}
            onClick={() => setReiter(wert)}
          >
            {symbol} {beschriftung}
          </button>
        ))}
      </div>

      {reiter === 'uebersicht' && <Kennzahlen toast={toast} />}
      {reiter === 'benutzer' && <Benutzerverwaltung toast={toast} />}
      {reiter === 'struktur' && <Struktur toast={toast} />}
      {reiter === 'einstellungen' && <Einstellungen toast={toast} />}
    </div>
  )
}

type ToastFn = (msg: string, kind?: 'ok' | 'error') => void

function meldung(toast: ToastFn, err: unknown, ersatz: string) {
  toast(err instanceof Error ? err.message : ersatz, 'error')
}

/* ---------------------------------------------------------- Übersicht */

function Kennzahlen({toast}: {toast: ToastFn}) {
  const [daten, setDaten] = useState<Uebersicht | null>(null)

  useEffect(() => {
    api<Uebersicht>('/sysadmin/overview').then(setDaten).catch(err => meldung(toast, err, 'Konnte nicht laden'))
  }, [])

  if (!daten) return <div className="loading">Kennzahlen werden geladen…</div>

  const kacheln: Array<[string, string, string?]> = [
    ['Benutzer', String(daten.users.total), `${daten.users.active} aktiv · ${daten.users.inactive} deaktiviert`],
    ['Kunden', String(daten.data.customers)],
    ['Termine', String(daten.data.appointments)],
    ['Verkäufe', String(daten.data.sales)],
    ['Umsatz gesamt', money(daten.revenue.total_cents), `diesen Monat ${money(daten.revenue.month_cents)}`],
    ['Produkte', String(daten.data.products)],
    ['Verleih offen', String(daten.data.rentals_open)],
    ['Altgeräte', String(daten.data.trade_ins)],
  ]

  return (
    <>
      <div className="sysadmin-kacheln">
        {kacheln.map(([titel, wert, zusatz]) => (
          <div className="card sysadmin-kachel" key={titel}>
            <small>{titel}</small>
            <strong>{wert}</strong>
            {zusatz && <span>{zusatz}</span>}
          </div>
        ))}
      </div>

      <div className="bericht-zweispaltig">
        <section className="card">
          <div className="section-title"><h2>Rollen</h2></div>
          <ul className="bericht-liste">
            {Object.entries(daten.users.by_role).map(([rolle, anzahl]) => (
              <li key={rolle}><span>{rolle}</span><strong>{anzahl}</strong></li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="section-title"><h2>Systemstatus</h2></div>
          <ul className="bericht-liste">
            <li><span>Regionen</span><strong>{daten.org.regions}</strong></li>
            <li><span>Bezirke</span><strong>{daten.org.districts}</strong></li>
            <li><span>Teams</span><strong>{daten.org.teams}</strong></li>
            <li>
              <span>ohne Team</span>
              <strong>
                {daten.org.employees_without_team}
                {daten.org.employees_without_team > 0 && (
                  <em className="bericht-warnend"> · nicht in Teamauswertungen</em>
                )}
              </strong>
            </li>
            <li><span>Serverzeit</span><strong>{new Date(daten.system.server_time).toLocaleString('de-DE')}</strong></li>
          </ul>
        </section>
      </div>
    </>
  )
}

/* ------------------------------------------------------ Benutzerverwaltung */

function Benutzerverwaltung({toast}: {toast: ToastFn}) {
  const [liste, setListe] = useState<Benutzer[] | null>(null)
  const [rollen, setRollen] = useState<RolleOption[]>([])
  const [org, setOrg] = useState<Org | null>(null)
  const [offen, setOffen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Benutzer | null>(null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [neu, setNeu] = useState({...LEERER_BENUTZER})
  const [suche, setSuche] = useState('')
  const [busy, setBusy] = useState(false)

  const laden = useCallback(() => {
    Promise.all([
      api<Benutzer[]>('/sysadmin/users'),
      api<RolleOption[]>('/sysadmin/roles'),
      api<Org>('/sysadmin/org'),
    ]).then(([b, r, o]) => {
      setListe(b)
      setRollen(r)
      setOrg(o)
    }).catch(err => meldung(toast, err, 'Konnte nicht laden'))
  }, [])

  useEffect(laden, [laden])

  /** Alle Teams flach, mit dem vollen Pfad als Beschriftung. */
  const teams = (org?.regions ?? []).flatMap(r =>
    r.districts.flatMap(d => d.teams.map(t => ({id: t.id, pfad: `${r.name} › ${d.name} › ${t.name}`}))))

  async function aufklappen(id: string) {
    if (offen === id) {
      setOffen(null)
      return
    }
    setOffen(id)
    setDetail(null)
    try {
      setDetail(await api<Benutzer>(`/sysadmin/users/${id}`))
    } catch (err) {
      meldung(toast, err, 'Benutzer nicht abrufbar')
    }
  }

  async function speichern(id: string, felder: Record<string, unknown>) {
    try {
      await api(`/sysadmin/users/${id}`, {method: 'PUT', body: JSON.stringify(felder)})
      toast('Gespeichert')
      laden()
      setDetail(await api<Benutzer>(`/sysadmin/users/${id}`))
    } catch (err) {
      meldung(toast, err, 'Speichern fehlgeschlagen')
    }
  }

  async function rechtSetzen(id: string, permission: string, allowed: boolean | null) {
    try {
      const rechte = await api<Recht[]>(`/sysadmin/users/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({permission, allowed}),
      })
      setDetail(d => (d ? {...d, permissions: rechte} : d))
    } catch (err) {
      meldung(toast, err, 'Recht konnte nicht gesetzt werden')
    }
  }

  async function passwortNeu(id: string, name: string) {
    if (!window.confirm(`Neues Startpasswort für ${name} erzeugen?\n\nDas alte gilt dann nicht mehr.`)) return
    try {
      const {start_password} = await api<{start_password: string}>(
        `/sysadmin/users/${id}/password`, {method: 'POST'})
      window.prompt('Startpasswort – jetzt notieren, es wird nicht wieder angezeigt:', start_password)
      laden()
    } catch (err) {
      meldung(toast, err, 'Passwort konnte nicht gesetzt werden')
    }
  }

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const angelegt = await api<Benutzer>('/sysadmin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...neu,
          phone: neu.phone || null,
          employee_number: neu.employee_number || null,
          hired_on: neu.hired_on || null,
          location: neu.location || null,
          team_id: neu.team_id || null,
        }),
      })
      window.prompt(
        `${angelegt.full_name} angelegt. Startpasswort – jetzt notieren, es wird nicht wieder angezeigt:`,
        angelegt.start_password ?? '',
      )
      setNeu({...LEERER_BENUTZER})
      setNeuOffen(false)
      laden()
    } catch (err) {
      meldung(toast, err, 'Anlegen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  if (!liste) return <div className="loading">Benutzer werden geladen…</div>

  const begriff = suche.trim().toLowerCase()
  const gefiltert = begriff
    ? liste.filter(b => `${b.full_name} ${b.email} ${b.employee?.team ?? ''}`.toLowerCase().includes(begriff))
    : liste

  return (
    <>
      <div className="preis-kopf">
        <div className="preis-filter">
          <input type="search" value={suche} onChange={e => setSuche(e.target.value)}
                 placeholder="Name, E-Mail oder Team suchen …" />
        </div>
        <button type="button" className="primary" onClick={() => setNeuOffen(v => !v)}>
          <Plus size={16} /> Benutzer anlegen
        </button>
      </div>

      {neuOffen && (
        <form className="card sysadmin-form" onSubmit={anlegen}>
          <h3>Neuer Benutzer</h3>
          <div className="sysadmin-felder">
            <label>Vorname<input required value={neu.first_name}
              onChange={e => setNeu({...neu, first_name: e.target.value})} /></label>
            <label>Nachname<input required value={neu.last_name}
              onChange={e => setNeu({...neu, last_name: e.target.value})} /></label>
            <label>E-Mail<input type="email" required value={neu.email}
              onChange={e => setNeu({...neu, email: e.target.value})} /></label>
            <label>Telefon<input value={neu.phone}
              onChange={e => setNeu({...neu, phone: e.target.value})} /></label>
            <label>Rolle
              <select value={neu.role} onChange={e => setNeu({...neu, role: e.target.value as Role})}>
                {rollen.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label>Position<input value={neu.position}
              onChange={e => setNeu({...neu, position: e.target.value})} /></label>
            <label>Mitarbeiter-Nr.<input value={neu.employee_number}
              onChange={e => setNeu({...neu, employee_number: e.target.value})} /></label>
            <label>Eintrittsdatum<input type="date" value={neu.hired_on}
              onChange={e => setNeu({...neu, hired_on: e.target.value})} /></label>
            <label>Standort<input value={neu.location}
              onChange={e => setNeu({...neu, location: e.target.value})} /></label>
            <label>Team
              <select value={neu.team_id} onChange={e => setNeu({...neu, team_id: e.target.value})}>
                <option value="">– kein Team –</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.pfad}</option>)}
              </select>
            </label>
            <label>Monatsziel<input type="number" min="1" value={neu.monthly_units_target}
              onChange={e => setNeu({...neu, monthly_units_target: Number(e.target.value)})} /></label>
          </div>
          <p className="muted profil-hinweis">
            Das Startpasswort wird erzeugt und <strong>einmal</strong> angezeigt. Es wird nirgends
            protokolliert – notiere es, bevor du das Fenster schließt.
          </p>
          <div className="form-actions">
            <button type="button" onClick={() => setNeuOffen(false)}>Abbrechen</button>
            <button className="primary" disabled={busy}>{busy ? 'Legt an…' : 'Anlegen'}</button>
          </div>
        </form>
      )}

      <div className="table-card">
        <table>
          <thead>
            <tr><th /><th>Name</th><th>E-Mail</th><th>Rolle</th><th>Team</th><th>Status</th></tr>
          </thead>
          <tbody>
            {gefiltert.map(b => [
              <tr key={b.id} className="preis-zeile" onClick={() => aufklappen(b.id)}>
                <td className="preis-pfeil"><UserCog size={15} /></td>
                <td><strong>{b.full_name}</strong></td>
                <td>{b.email}</td>
                <td><span className={b.role === 'SYSTEM_ADMIN' ? 'admin-rolle is-inhaber' : 'admin-rolle'}>
                  {b.role_label}</span></td>
                <td>{b.employee?.team ?? <span className="muted">–</span>}</td>
                <td>{b.is_active
                  ? <span className="geraet-status frei">aktiv</span>
                  : <span className="preis-fehlt">deaktiviert</span>}</td>
              </tr>,

              offen === b.id && (
                <tr key={`${b.id}-d`} className="preis-detail">
                  <td colSpan={6}>
                    {!detail ? <p className="muted">Wird geladen…</p> : (
                      <div className="sysadmin-detail">
                        <div className="sysadmin-felder">
                          <label>Rolle
                            <select value={detail.role}
                              onChange={e => speichern(b.id, {role: e.target.value})}>
                              {rollen.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </label>
                          <label>Team
                            <select value={detail.employee?.team_id ?? ''}
                              onChange={e => speichern(b.id, {team_id: e.target.value})}>
                              <option value="">– kein Team –</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.pfad}</option>)}
                            </select>
                          </label>
                          <label>Status
                            <select value={detail.is_active ? 'ja' : 'nein'}
                              onChange={e => speichern(b.id, {is_active: e.target.value === 'ja'})}>
                              <option value="ja">aktiv</option>
                              <option value="nein">deaktiviert</option>
                            </select>
                          </label>
                        </div>

                        {detail.employee && (
                          <p className="muted sysadmin-stamm">
                            {detail.employee.position}
                            {detail.employee.employee_number && ` · Nr. ${detail.employee.employee_number}`}
                            {detail.employee.location && ` · ${detail.employee.location}`}
                            {detail.employee.region && ` · ${detail.employee.region} › ${detail.employee.district}`}
                            {` · Monatsziel ${detail.employee.monthly_units_target}`}
                          </p>
                        )}

                        <div className="sysadmin-rechte">
                          <h4><ShieldCheck size={15} /> Einzelrechte</h4>
                          {detail.role === 'SYSTEM_ADMIN' ? (
                            <p className="muted">
                              Einem Systemadministrator lässt sich kein Recht entziehen – sonst
                              könnte sich der Betreiber aus der eigenen Anlage aussperren.
                            </p>
                          ) : (
                            <div className="sysadmin-rechte-liste">
                              {(detail.permissions ?? []).map(r => (
                                <label key={r.permission} className={r.override !== null ? 'ist-abweichung' : undefined}>
                                  <input
                                    type="checkbox"
                                    checked={r.effective}
                                    onChange={e => rechtSetzen(
                                      b.id, r.permission,
                                      e.target.checked === r.from_role ? null : e.target.checked,
                                    )}
                                  />
                                  <span>{r.label}</span>
                                  {r.override !== null && <em>abweichend</em>}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>

                        <button type="button" onClick={() => passwortNeu(b.id, b.full_name)}>
                          <KeyRound size={15} /> Neues Startpasswort
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------------------------------------------------- Struktur */

function Struktur({toast}: {toast: ToastFn}) {
  const [org, setOrg] = useState<Org | null>(null)
  const [neu, setNeu] = useState({region: '', bezirk: {region_id: '', name: ''}, team: {district_id: '', name: ''}})

  const laden = useCallback(() => {
    api<Org>('/sysadmin/org').then(setOrg).catch(err => meldung(toast, err, 'Konnte nicht laden'))
  }, [])

  useEffect(laden, [laden])

  async function anlegen(pfad: string, koerper: object, leeren: () => void) {
    try {
      await api(pfad, {method: 'POST', body: JSON.stringify(koerper)})
      toast('Angelegt')
      leeren()
      laden()
    } catch (err) {
      meldung(toast, err, 'Anlegen fehlgeschlagen')
    }
  }

  async function loeschen(pfad: string, was: string) {
    if (!window.confirm(`${was} wirklich entfernen?`)) return
    try {
      await api(pfad, {method: 'DELETE'})
      toast('Entfernt')
      laden()
    } catch (err) {
      meldung(toast, err, 'Löschen fehlgeschlagen')
    }
  }

  if (!org) return <div className="loading">Struktur wird geladen…</div>

  const bezirke = org.regions.flatMap(r => r.districts.map(d => ({id: d.id, pfad: `${r.name} › ${d.name}`})))

  return (
    <>
      <section className="card sysadmin-form">
        <h3>Neu anlegen</h3>
        <div className="sysadmin-neuzeilen">
          <div>
            <label>Region
              <input value={neu.region} placeholder="z. B. Nord"
                onChange={e => setNeu({...neu, region: e.target.value})} />
            </label>
            <button type="button" disabled={!neu.region.trim()}
              onClick={() => anlegen('/sysadmin/regions', {name: neu.region},
                () => setNeu(n => ({...n, region: ''})))}>
              <Plus size={15} /> Region
            </button>
          </div>

          <div>
            <label>Bezirk in
              <select value={neu.bezirk.region_id}
                onChange={e => setNeu({...neu, bezirk: {...neu.bezirk, region_id: e.target.value}})}>
                <option value="">– Region wählen –</option>
                {org.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label>Name
              <input value={neu.bezirk.name}
                onChange={e => setNeu({...neu, bezirk: {...neu.bezirk, name: e.target.value}})} />
            </label>
            <button type="button" disabled={!neu.bezirk.region_id || !neu.bezirk.name.trim()}
              onClick={() => anlegen('/sysadmin/districts', neu.bezirk,
                () => setNeu(n => ({...n, bezirk: {region_id: '', name: ''}})))}>
              <Plus size={15} /> Bezirk
            </button>
          </div>

          <div>
            <label>Team in
              <select value={neu.team.district_id}
                onChange={e => setNeu({...neu, team: {...neu.team, district_id: e.target.value}})}>
                <option value="">– Bezirk wählen –</option>
                {bezirke.map(b => <option key={b.id} value={b.id}>{b.pfad}</option>)}
              </select>
            </label>
            <label>Name
              <input value={neu.team.name}
                onChange={e => setNeu({...neu, team: {...neu.team, name: e.target.value}})} />
            </label>
            <button type="button" disabled={!neu.team.district_id || !neu.team.name.trim()}
              onClick={() => anlegen('/sysadmin/teams', neu.team,
                () => setNeu(n => ({...n, team: {district_id: '', name: ''}})))}>
              <Plus size={15} /> Team
            </button>
          </div>
        </div>
      </section>

      {org.employees_without_team > 0 && (
        <div className="preis-hinweis">
          <span>
            {org.employees_without_team === 1
              ? 'Ein Mitarbeiter ist keinem Team zugeordnet und taucht damit in keiner Teamauswertung auf.'
              : `${org.employees_without_team} Mitarbeiter sind keinem Team zugeordnet und tauchen damit in keiner Teamauswertung auf.`}
          </span>
        </div>
      )}

      {org.regions.length === 0 ? (
        <p className="muted">Noch keine Region angelegt.</p>
      ) : (
        <div className="cards-list">
          {org.regions.map(r => (
            <section className="card org-region" key={r.id}>
              <div className="org-kopf">
                <strong>{r.name}</strong>
                <span>{r.employees} Mitarbeiter · {r.districts.length} {r.districts.length === 1 ? 'Bezirk' : 'Bezirke'}</span>
                <button type="button" className="plain-button preis-loeschen"
                  title="Region entfernen"
                  onClick={() => loeschen(`/sysadmin/regions/${r.id}`, `Region ${r.name}`)}>
                  <Trash2 size={14} />
                </button>
              </div>

              {r.districts.map(d => (
                <div className="org-bezirk" key={d.id}>
                  <div className="org-kopf">
                    <span>{d.name}</span>
                    <span className="muted">{d.employees} Mitarbeiter</span>
                    <button type="button" className="plain-button preis-loeschen"
                      title="Bezirk entfernen"
                      onClick={() => loeschen(`/sysadmin/districts/${d.id}`, `Bezirk ${d.name}`)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <ul className="org-teams">
                    {d.teams.map(t => (
                      <li key={t.id}>
                        <span>{t.name}</span>
                        <span className="muted">{t.employees} Mitarbeiter</span>
                        <button type="button" className="plain-button preis-loeschen"
                          title="Team entfernen"
                          onClick={() => loeschen(`/sysadmin/teams/${t.id}`, `Team ${t.name}`)}>
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                    {d.teams.length === 0 && <li className="muted">kein Team</li>}
                  </ul>
                </div>
              ))}
              {r.districts.length === 0 && <p className="muted">Kein Bezirk angelegt.</p>}
            </section>
          ))}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------ Einstellungen */

function Einstellungen({toast}: {toast: ToastFn}) {
  const [liste, setListe] = useState<Einstellung[] | null>(null)
  const [werte, setWerte] = useState<Record<string, string>>({})

  useEffect(() => {
    api<Einstellung[]>('/sysadmin/settings').then(e => {
      setListe(e)
      setWerte(Object.fromEntries(e.map(x => [x.key, x.value?.v == null ? '' : String(x.value.v)])))
    }).catch(err => meldung(toast, err, 'Konnte nicht laden'))
  }, [])

  async function speichern(key: string) {
    try {
      await api(`/sysadmin/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({value: werte[key] === '' ? null : werte[key]}),
      })
      toast('Gespeichert')
    } catch (err) {
      meldung(toast, err, 'Speichern fehlgeschlagen')
    }
  }

  if (!liste) return <div className="loading">Einstellungen werden geladen…</div>

  return (
    <section className="card sysadmin-form">
      <h3>Systemeinstellungen</h3>
      <div className="sysadmin-einstellungen">
        {liste.map(e => (
          <label key={e.key}>
            {e.label}
            <span>
              <input value={werte[e.key] ?? ''}
                onChange={ev => setWerte({...werte, [e.key]: ev.target.value})} />
              <button type="button" onClick={() => speichern(e.key)}>Speichern</button>
            </span>
            <small className="muted">{e.key}</small>
          </label>
        ))}
      </div>
    </section>
  )
}
