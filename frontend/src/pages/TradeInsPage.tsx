import {FormEvent, useCallback, useEffect, useState} from 'react'
import {Pencil, Plus, Search, Trash2} from 'lucide-react'
import {api, formatDateTime} from '../lib/api'
import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import type {Customer, TradeIn} from '../types'
import {heuteIso} from '../lib/datum'

type Summary = {total: number} & Record<string, number>

const ZUSTAENDE = [
  ['unknown', 'Noch nicht geprüft'],
  ['working', 'Funktionsfähig'],
  ['defective', 'Defekt'],
  ['parts', 'Nur Ersatzteile'],
] as const

const STATUS = [
  ['received', 'Angenommen'],
  ['stored', 'Eingelagert'],
  ['returned', 'Zurückgegeben'],
  ['disposed', 'Entsorgt'],
  ['sold', 'Weiterverkauft'],
] as const


const leer = {
  customer_id: '',
  model: '',
  serial_number: '',
  condition: 'unknown',
  status: 'received',
  received_on: heuteIso(),
  notes: '',
}

/**
 * Altgeräte, die bei Kunden hereingenommen wurden.
 *
 * Bewusst ein eigener Bereich und keine Spalte am Verkauf: ein Altgerät
 * fällt auch ohne Verkauf an, und bei einem Verkauf können mehrere
 * hereinkommen.
 */
export function TradeInsPage() {
  const {me} = useAuth()
  const toast = useToast()

  const [rows, setRows] = useState<TradeIn[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suche, setSuche] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [zustandFilter, setZustandFilter] = useState('')

  const [offen, setOffen] = useState(false)
  const [bearbeitet, setBearbeitet] = useState<TradeIn | null>(null)
  const [formular, setFormular] = useState(leer)
  const [speichert, setSpeichert] = useState(false)

  const laden = useCallback(() => {
    const params = new URLSearchParams()
    if (suche.trim()) params.set('q', suche.trim())
    if (statusFilter) params.set('status', statusFilter)
    if (zustandFilter) params.set('condition', zustandFilter)
    const query = params.toString()

    api<TradeIn[]>(`/tradeins${query ? `?${query}` : ''}`)
      .then(setRows)
      .catch(fehler => toast(fehler instanceof Error ? fehler.message : 'Laden fehlgeschlagen', 'error'))
    api<Summary>('/tradeins/summary').then(setSummary).catch(() => setSummary(null))
  }, [statusFilter, suche, toast, zustandFilter])

  useEffect(() => {
    const t = setTimeout(laden, 180)
    return () => clearTimeout(t)
  }, [laden])

  useEffect(() => {
    api<Customer[]>('/customers').then(setCustomers).catch(() => setCustomers([]))
  }, [])

  function anlegen() {
    setBearbeitet(null)
    setFormular(leer)
    setOffen(true)
  }

  function bearbeiten(row: TradeIn) {
    setBearbeitet(row)
    setFormular({
      customer_id: row.customer_id,
      model: row.model,
      serial_number: row.serial_number || '',
      condition: row.condition,
      status: row.status,
      received_on: row.received_on.slice(0, 10),
      notes: row.notes || '',
    })
    setOffen(true)
  }

  async function speichern(event: FormEvent) {
    event.preventDefault()
    setSpeichert(true)
    try {
      const nutzlast = {
        ...formular,
        serial_number: formular.serial_number.trim() || null,
        notes: formular.notes.trim() || null,
      }
      await api(bearbeitet ? `/tradeins/${bearbeitet.id}` : '/tradeins', {
        method: bearbeitet ? 'PUT' : 'POST',
        body: JSON.stringify(nutzlast),
      })
      setOffen(false)
      laden()
      toast(bearbeitet ? 'Altgerät aktualisiert' : 'Altgerät erfasst')
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Speichern fehlgeschlagen', 'error')
    } finally {
      setSpeichert(false)
    }
  }

  async function loeschen(row: TradeIn) {
    if (!window.confirm(`Altgerät „${row.model}“ von ${row.customer_name} wirklich löschen?`)) return
    try {
      await api(`/tradeins/${row.id}`, {method: 'DELETE'})
      laden()
      toast('Altgerät gelöscht')
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Löschen fehlgeschlagen', 'error')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Altgeräte</h1>
          <p>Hereingenommene Geräte erfassen und nachverfolgen.</p>
        </div>
        <button className="primary" onClick={anlegen}>
          <Plus size={18} /> Altgerät erfassen
        </button>
      </div>

      {summary && summary.total > 0 && (
        <div className="tradein-filter">
          <button
            type="button"
            className={statusFilter === '' ? 'is-active' : undefined}
            onClick={() => setStatusFilter('')}
          >
            Alle <span>{summary.total}</span>
          </button>
          {STATUS.map(([wert, label]) => (
            <button
              type="button"
              key={wert}
              className={statusFilter === wert ? 'is-active' : undefined}
              onClick={() => setStatusFilter(statusFilter === wert ? '' : wert)}
            >
              {label} <span>{summary[wert] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="search-field tradein-suche">
          <Search size={17} />
          <input
            placeholder="Modell, Seriennummer oder Kunde suchen…"
            value={suche}
            onChange={e => setSuche(e.target.value)}
          />
        </div>
        <select value={zustandFilter} onChange={e => setZustandFilter(e.target.value)} aria-label="Zustand">
          <option value="">Jeder Zustand</option>
          {ZUSTAENDE.map(([wert, label]) => (
            <option key={wert} value={wert}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Gerät</th>
              <th>Kunde</th>
              <th>Zustand</th>
              <th>Status</th>
              <th>Angenommen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>
                  <strong>{row.model}</strong>
                  {row.serial_number && <small>SN: {row.serial_number}</small>}
                  {row.notes && <small>{row.notes}</small>}
                </td>
                <td>{row.customer_name}</td>
                <td>
                  <span className={`tradein-zustand is-${row.condition}`}>{row.condition_label}</span>
                </td>
                <td>
                  <span className={`tradein-status is-${row.status}`}>{row.status_label}</span>
                </td>
                <td>{formatDateTime(row.received_on).replace(/,.*$/, '')}</td>
                <td>
                  <div className="admin-aktionen">
                    <button type="button" onClick={() => bearbeiten(row)} title="Bearbeiten">
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-danger"
                      onClick={() => loeschen(row)}
                      title="Löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            {suche || statusFilter || zustandFilter
              ? 'Keine Altgeräte zu diesen Filtern.'
              : 'Noch keine Altgeräte erfasst.'}
          </div>
        )}
      </div>

      {offen && (
        <Modal
          title={bearbeitet ? 'Altgerät bearbeiten' : 'Altgerät erfassen'}
          onClose={() => setOffen(false)}
        >
          <form className="form-grid" onSubmit={speichern}>
            <label className="span-2">
              Kunde
              <select
                required
                value={formular.customer_id}
                disabled={!!bearbeitet}
                onChange={e => setFormular({...formular, customer_id: e.target.value})}
              >
                <option value="">Kunde auswählen…</option>
                {customers.map(kunde => (
                  <option key={kunde.id} value={kunde.id}>
                    {kunde.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Gerät / Modell
              <input
                required
                value={formular.model}
                onChange={e => setFormular({...formular, model: e.target.value})}
              />
            </label>
            <label>
              Seriennummer
              <input
                value={formular.serial_number}
                onChange={e => setFormular({...formular, serial_number: e.target.value})}
              />
            </label>

            <label>
              Zustand
              <select
                value={formular.condition}
                onChange={e => setFormular({...formular, condition: e.target.value})}
              >
                {ZUSTAENDE.map(([wert, label]) => (
                  <option key={wert} value={wert}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={formular.status}
                onChange={e => setFormular({...formular, status: e.target.value})}
              >
                {STATUS.map(([wert, label]) => (
                  <option key={wert} value={wert}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Angenommen am
              <input
                required
                type="date"
                value={formular.received_on}
                onChange={e => setFormular({...formular, received_on: e.target.value})}
              />
            </label>

            <label className="span-2">
              Bemerkung
              <textarea
                value={formular.notes}
                onChange={e => setFormular({...formular, notes: e.target.value})}
              />
            </label>

            <div className="form-actions span-2">
              <button type="button" onClick={() => setOffen(false)}>
                Abbrechen
              </button>
              <button className="primary" disabled={speichert || !me}>
                {speichert ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
