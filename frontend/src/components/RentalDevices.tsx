import {useEffect, useState} from 'react'
import {AlertTriangle, ChevronDown, ChevronRight, PackageCheck, Wrench} from 'lucide-react'
import {api, formatDateTime} from '../lib/api'
import {useToast} from './Toast'

type Aktuell = {
  rental_id: string
  customer_id: string
  customer_name: string | null
  issued_at: string
  due_at: string | null
  is_overdue: boolean
  due_soon: boolean
  days_until_due: number | null
  days_overdue: number
}

type Geraet = {
  key: string
  product_id: string
  product_name: string | null
  serial_number: string
  loans: number
  days_out: number
  late_returns: number
  customers: number
  first_issued_at: string
  last_issued_at: string
  in_use: boolean
  current: Aktuell | null
}

type Ausgabe = {
  id: string
  customer_name: string | null
  issued_at: string
  due_at: string | null
  returned_at: string | null
  status: string
  notes: string | null
  days_out: number
  returned_late: boolean
}

type Historie = {
  product_name: string | null
  serial_number: string
  loans: number
  days_out: number
  customers: number
  late_returns: number
  first_issued_at: string
  history: Ausgabe[]
}

function tage(anzahl: number) {
  return `${anzahl} ${anzahl === 1 ? 'Tag' : 'Tage'}`
}

/**
 * Geräte statt Vorgänge.
 *
 * Die Verleihliste zeigt jede Ausgabe einzeln. Wer wissen will, wie oft ein
 * bestimmtes Gerät schon unterwegs war und wie zuverlässig es zurückkam,
 * müsste sie sonst im Kopf zusammenrechnen.
 */
export function RentalDevices() {
  const [geraete, setGeraete] = useState<Geraet[] | null>(null)
  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [historie, setHistorie] = useState<Record<string, Historie>>({})
  const toast = useToast()

  useEffect(() => {
    api<Geraet[]>('/rentals/devices')
      .then(setGeraete)
      .catch(err => {
        setGeraete([])
        toast(err instanceof Error ? err.message : 'Konnte nicht laden', 'error')
      })
  }, [])

  /** Historie wird erst beim Aufklappen geholt und dann behalten. */
  async function aufklappen(g: Geraet) {
    if (offen === g.key) {
      setOffen(null)
      return
    }
    setOffen(g.key)
    if (historie[g.key]) return

    try {
      const daten = await api<Historie>(
        `/rentals/devices/history?product_id=${encodeURIComponent(g.product_id)}` +
        `&serial_number=${encodeURIComponent(g.serial_number)}`
      )
      setHistorie(vorher => ({...vorher, [g.key]: daten}))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Historie nicht abrufbar', 'error')
      setOffen(null)
    }
  }

  if (!geraete) return <div className="loading">Geräte werden geladen…</div>

  if (geraete.length === 0) {
    return (
      <p className="muted geraete-leer">
        Noch keine Geräte mit Seriennummer erfasst. Ein Gerät lässt sich erst
        verfolgen, wenn bei der Ausgabe eine Seriennummer eingetragen wird –
        ohne sie sind zwei Exemplare desselben Modells nicht auseinanderzuhalten.
      </p>
    )
  }

  const begriff = suche.trim().toLowerCase()
  const gefiltert = begriff
    ? geraete.filter(g =>
        [g.serial_number, g.product_name, g.current?.customer_name]
          .filter(Boolean).join(' ').toLowerCase().includes(begriff))
    : geraete

  return (
    <>
      <section className="rental-filter-panel card">
        <div className="rental-filter-search">
          <input
            type="search"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Seriennummer, Gerät oder Kunde suchen …"
          />
        </div>
        <span className="rental-filter-count">
          <strong>{gefiltert.length}</strong>{' '}
          {gefiltert.length === 1 ? 'Gerät' : 'Geräte'}
        </span>
      </section>

      <div className="cards-list">
        {gefiltert.map(g => {
          const aufgeklappt = offen === g.key
          const verlauf = historie[g.key]

          return (
            <div className={`card geraet-card${g.in_use ? ' in-use' : ''}`} key={g.key}>
              <button type="button" className="plain-button geraet-kopf" onClick={() => aufklappen(g)}>
                {aufgeklappt ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div className="geraet-titel">
                  <strong>{g.serial_number}</strong>
                  <span>{g.product_name || 'Gerät'}</span>
                </div>

                <span className={`geraet-status ${g.in_use ? 'unterwegs' : 'frei'}`}>
                  {g.in_use ? 'unterwegs' : 'im Bestand'}
                </span>

                {g.current?.is_overdue && (
                  <span className="rental-flag overdue">
                    <AlertTriangle size={13} /> {tage(g.current.days_overdue)} überfällig
                  </span>
                )}
              </button>

              <div className="geraet-zahlen">
                <span><strong>{g.loans}</strong> {g.loans === 1 ? 'Ausgabe' : 'Ausgaben'}</span>
                <span><strong>{g.days_out}</strong> {g.days_out === 1 ? 'Tag' : 'Tage'} unterwegs</span>
                <span><strong>{g.customers}</strong> {g.customers === 1 ? 'Kunde' : 'Kunden'}</span>
                {g.late_returns > 0 && (
                  <span className="warnend">
                    <strong>{g.late_returns}×</strong> zu spät zurück
                  </span>
                )}
              </div>

              {g.current && (
                <p className="geraet-aktuell">
                  <PackageCheck size={14} /> Aktuell bei {g.current.customer_name || 'unbekannt'}
                  {g.current.due_at && <> · Rückgabe {formatDateTime(g.current.due_at)}</>}
                </p>
              )}

              {aufgeklappt && (
                verlauf ? (
                  <ol className="geraet-verlauf">
                    {verlauf.history.map(a => (
                      <li key={a.id} className={a.returned_late ? 'zu-spaet' : undefined}>
                        <span className="geraet-verlauf-punkt">
                          <Wrench size={13} />
                        </span>
                        <div>
                          <strong>{a.customer_name || 'Unbekannter Kunde'}</strong>
                          <p>
                            {formatDateTime(a.issued_at)} → {' '}
                            {a.returned_at ? formatDateTime(a.returned_at) : 'noch unterwegs'}
                            {' · '}{tage(a.days_out)}
                            {a.returned_late && <span className="geraet-verspaetet"> zu spät zurück</span>}
                          </p>
                          {a.notes && <small>{a.notes}</small>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">Verlauf wird geladen…</p>
                )
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
