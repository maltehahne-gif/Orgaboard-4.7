import {FormEvent, useEffect, useState} from 'react'
import {KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX} from 'lucide-react'
import {api, money} from '../lib/api'
import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import {darfVerwalten, rolleBezeichnung} from '../lib/roles'
import type {Role} from '../types'

type EmployeeProfile = {
  id: string
  display_name: string
  position: string
  monthly_units_target: number
  weekly_revenue_target_cents: number | null
}

type AdminUser = {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  must_change_password: boolean
  created_at: string
  employee: EmployeeProfile | null
}

const leeresFormular = {
  email: '',
  full_name: '',
  role: 'EMPLOYEE' as AdminUser['role'],
  position: 'Vertriebspartner',
  monthly_units_target: 30,
}

/**
 * Zentrale Verwaltung von Benutzern, Rollen und Zielen.
 *
 * Die Sperren gegen das Aussperren (letzter Teamleiter, eigenes Konto)
 * liegen im Backend - hier werden die betroffenen Knoepfe zusaetzlich
 * ausgegraut, damit der Fehler gar nicht erst passiert.
 */
export function AdminPage() {
  const {me} = useAuth()
  const toast = useToast()

  const [rows, setRows] = useState<AdminUser[]>([])
  const [anlegenOffen, setAnlegenOffen] = useState(false)
  const [formular, setFormular] = useState(leeresFormular)
  const [bearbeitet, setBearbeitet] = useState<AdminUser | null>(null)
  const [ziele, setZiele] = useState({position: '', monthly_units_target: 30, weekly_revenue_target_euro: ''})
  const [startpasswort, setStartpasswort] = useState<{name: string; passwort: string} | null>(null)
  const [speichert, setSpeichert] = useState(false)

  const laden = () =>
    api<AdminUser[]>('/admin/users')
      .then(setRows)
      .catch(fehler => toast(fehler instanceof Error ? fehler.message : 'Laden fehlgeschlagen', 'error'))

  useEffect(() => {
    laden()
  }, [])

  const aktiveLeiter = rows.filter(row => darfVerwalten(row.role) && row.is_active).length

  /** Warum ein Knopf gesperrt ist - als Titel am Knopf, damit es erklärt ist. */
  function gesperrtWeil(row: AdminUser, aktion: 'deaktivieren' | 'rolle'): string | null {
    if (row.id === me?.id) {
      return aktion === 'rolle'
        ? 'Die eigene Rolle lässt sich nicht ändern'
        : 'Das eigene Konto lässt sich nicht deaktivieren'
    }
    if (darfVerwalten(row.role) && row.is_active && aktiveLeiter <= 1) {
      return 'Letzter aktiver Teamleiter – sonst kann niemand mehr verwalten'
    }
    return null
  }

  async function anlegen(event: FormEvent) {
    event.preventDefault()
    setSpeichert(true)
    try {
      const angelegt = await api<AdminUser & {start_password: string}>('/admin/users', {
        method: 'POST',
        body: JSON.stringify(formular),
      })
      setAnlegenOffen(false)
      setFormular(leeresFormular)
      await laden()
      setStartpasswort({name: angelegt.full_name, passwort: angelegt.start_password})
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Anlegen fehlgeschlagen', 'error')
    } finally {
      setSpeichert(false)
    }
  }

  async function umschalten(row: AdminUser, feld: 'is_active' | 'role') {
    const wert = feld === 'is_active' ? !row.is_active : row.role === 'TEAM_LEADER' ? 'EMPLOYEE' : 'TEAM_LEADER'
    try {
      await api(`/admin/users/${row.id}`, {method: 'PATCH', body: JSON.stringify({[feld]: wert})})
      await laden()
      toast(
        feld === 'is_active'
          ? row.is_active
            ? `${row.full_name} deaktiviert`
            : `${row.full_name} wieder aktiv`
          : `Rolle von ${row.full_name} geändert`,
      )
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Änderung fehlgeschlagen', 'error')
    }
  }

  async function passwortZuruecksetzen(row: AdminUser) {
    if (!window.confirm(`Für ${row.full_name} ein neues Startpasswort erzeugen?\n\nDas bisherige Passwort wird sofort ungültig.`)) return
    try {
      const antwort = await api<{start_password: string}>(`/admin/users/${row.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      await laden()
      setStartpasswort({name: row.full_name, passwort: antwort.start_password})
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Zurücksetzen fehlgeschlagen', 'error')
    }
  }

  function zieleOeffnen(row: AdminUser) {
    if (!row.employee) return
    setBearbeitet(row)
    setZiele({
      position: row.employee.position,
      monthly_units_target: row.employee.monthly_units_target,
      weekly_revenue_target_euro:
        row.employee.weekly_revenue_target_cents === null
          ? ''
          : String(row.employee.weekly_revenue_target_cents / 100),
    })
  }

  async function zieleSpeichern(event: FormEvent) {
    event.preventDefault()
    if (!bearbeitet?.employee) return
    setSpeichert(true)
    try {
      const euro = ziele.weekly_revenue_target_euro.trim().replace(',', '.')
      await api(`/admin/employees/${bearbeitet.employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          position: ziele.position,
          monthly_units_target: Number(ziele.monthly_units_target),
          weekly_revenue_target_cents: euro === '' ? null : Math.round(Number(euro) * 100),
        }),
      })
      setBearbeitet(null)
      await laden()
      toast('Ziele gespeichert')
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Speichern fehlgeschlagen', 'error')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Verwaltung</h1>
          <p>Benutzer, Rollen und Ziele. Jede Änderung wird im Verlauf protokolliert.</p>
        </div>
        <button className="primary" onClick={() => setAnlegenOffen(true)}>
          <Plus size={18} /> Benutzer anlegen
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Monatsziel</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rolleGesperrt = gesperrtWeil(row, 'rolle')
              const statusGesperrt = row.is_active ? gesperrtWeil(row, 'deaktivieren') : null
              return (
                <tr key={row.id} className={row.is_active ? undefined : 'admin-inaktiv'}>
                  <td>
                    <strong>{row.full_name}</strong>
                    {row.employee && <small>{row.employee.position}</small>}
                  </td>
                  <td>{row.email}</td>
                  <td>
                    <span className={darfVerwalten(row.role) ? 'admin-rolle is-leiter' : 'admin-rolle'}>
                      {rolleBezeichnung(row.role)}
                    </span>
                  </td>
                  <td>
                    {row.employee ? (
                      <>
                        {row.employee.monthly_units_target} Einheiten
                        {row.employee.weekly_revenue_target_cents !== null && (
                          <small>{money(row.employee.weekly_revenue_target_cents)} / Woche</small>
                        )}
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>
                    {row.is_active ? (
                      <span className="status rented">aktiv</span>
                    ) : (
                      <span className="status returned">deaktiviert</span>
                    )}
                    {row.must_change_password && <small>Passwortwechsel offen</small>}
                  </td>
                  <td>
                    <div className="admin-aktionen">
                      <button
                        type="button"
                        onClick={() => zieleOeffnen(row)}
                        disabled={!row.employee}
                        title="Position und Ziele bearbeiten"
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => umschalten(row, 'role')}
                        disabled={!!rolleGesperrt}
                        title={rolleGesperrt ?? (row.role === 'TEAM_LEADER' ? 'Zu Mitarbeiter machen' : 'Zu Teamleiter machen')}
                      >
                        <ShieldCheck size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => passwortZuruecksetzen(row)}
                        title="Neues Startpasswort erzeugen"
                      >
                        <KeyRound size={15} />
                      </button>

                      <button
                        type="button"
                        className={row.is_active ? 'icon-danger' : undefined}
                        onClick={() => umschalten(row, 'is_active')}
                        disabled={!!statusGesperrt}
                        title={statusGesperrt ?? (row.is_active ? 'Benutzer deaktivieren' : 'Benutzer wieder aktivieren')}
                      >
                        {row.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty">Keine Benutzer gefunden.</div>}
      </div>

      <p className="admin-hinweis">
        Produkte und Preise werden im Bereich <strong>Produkte</strong> gepflegt. Teams, Regionen und
        Bezirke gibt es noch nicht – dafür fehlt die Organisationsstruktur.
      </p>

      {anlegenOffen && (
        <Modal title="Benutzer anlegen" onClose={() => setAnlegenOffen(false)}>
          <form className="form-grid" onSubmit={anlegen}>
            <label>
              Voller Name
              <input
                required
                value={formular.full_name}
                onChange={e => setFormular({...formular, full_name: e.target.value})}
              />
            </label>
            <label>
              E-Mail
              <input
                required
                type="email"
                value={formular.email}
                onChange={e => setFormular({...formular, email: e.target.value})}
              />
            </label>
            <label>
              Rolle
              <select
                value={formular.role}
                onChange={e => setFormular({...formular, role: e.target.value as AdminUser['role']})}
              >
                <option value="EMPLOYEE">Mitarbeiter</option>
                <option value="TEAM_LEADER">Teamleiter</option>
              </select>
            </label>
            <label>
              Position
              <input
                value={formular.position}
                onChange={e => setFormular({...formular, position: e.target.value})}
              />
            </label>
            <label>
              Monatsziel (Einheiten)
              <input
                type="number"
                min={0}
                value={formular.monthly_units_target}
                onChange={e => setFormular({...formular, monthly_units_target: Number(e.target.value)})}
              />
            </label>
            <p className="info-box span-2">
              Das Startpasswort wird automatisch erzeugt und danach einmalig angezeigt. Es muss beim
              ersten Anmelden geändert werden.
            </p>
            <div className="form-actions span-2">
              <button type="button" onClick={() => setAnlegenOffen(false)}>
                Abbrechen
              </button>
              <button className="primary" disabled={speichert}>
                {speichert ? 'Wird angelegt…' : 'Anlegen'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {bearbeitet && (
        <Modal title={`Ziele – ${bearbeitet.full_name}`} onClose={() => setBearbeitet(null)}>
          <form className="form-grid" onSubmit={zieleSpeichern}>
            <label className="span-2">
              Position
              <input value={ziele.position} onChange={e => setZiele({...ziele, position: e.target.value})} />
            </label>
            <label>
              Monatsziel (Einheiten)
              <input
                type="number"
                min={0}
                value={ziele.monthly_units_target}
                onChange={e => setZiele({...ziele, monthly_units_target: Number(e.target.value)})}
              />
            </label>
            <label>
              Wochenziel Umsatz (€, optional)
              <input
                inputMode="decimal"
                placeholder="leer = kein Ziel"
                value={ziele.weekly_revenue_target_euro}
                onChange={e => setZiele({...ziele, weekly_revenue_target_euro: e.target.value})}
              />
            </label>
            <div className="form-actions span-2">
              <button type="button" onClick={() => setBearbeitet(null)}>
                Abbrechen
              </button>
              <button className="primary" disabled={speichert}>
                {speichert ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {startpasswort && (
        <Modal title="Startpasswort" onClose={() => setStartpasswort(null)}>
          <p>
            Startpasswort für <strong>{startpasswort.name}</strong>. Es wird{' '}
            <strong>nur jetzt angezeigt</strong> – bitte sicher weitergeben.
          </p>
          <div className="admin-passwort">{startpasswort.passwort}</div>
          <div className="form-actions">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(startpasswort.passwort).then(
                  () => toast('Passwort kopiert'),
                  () => toast('Kopieren nicht möglich – bitte abschreiben', 'error'),
                )
              }}
            >
              Kopieren
            </button>
            <button className="primary" onClick={() => setStartpasswort(null)}>
              Fertig
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
