import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  AlarmClock,
  CalendarClock,
  Check,
  ChevronRight,
  MapPin,
  Phone,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {Link} from 'react-router-dom'
import {api} from '../lib/api'
import {useToast} from '../components/Toast'
import {connectRealtime} from '../lib/realtime'
import type {Customer} from '../types'
import {ausIso, heuteIso, isoDatum} from '../lib/datum'

type FollowUp = {
  id: string
  customer_id: string
  customer_name: string
  customer_address: string | null
  customer_phone: string | null
  due_on: string
  reason: string
  reason_label: string
  status: string
  note: string | null
  is_overdue: boolean
  is_due_today: boolean
  days_overdue: number
}

type Summary = {
  open: number
  due_today: number
  overdue: number
  upcoming: number
}

type Scope = 'today' | 'overdue' | 'open' | 'done'

const SCOPES: {key: Scope; label: string}[] = [
  {key: 'today', label: 'Heute'},
  {key: 'overdue', label: 'Überfällig'},
  {key: 'open', label: 'Alle offenen'},
  {key: 'done', label: 'Erledigt'},
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(ausIso(value))
}

export function FollowUpsPage() {
  const [scope, setScope] = useState<Scope>('today')
  const [items, setItems] = useState<FollowUp[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<FollowUp | null>(null)
  const [completeNote, setCompleteNote] = useState('')
  const toast = useToast()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [creating, setCreating] = useState(false)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [newCustomerId, setNewCustomerId] = useState('')
  const [newCustomerSearch, setNewCustomerSearch] = useState('')
  const [newDueOn, setNewDueOn] = useState(heuteIso())
  const [newNote, setNewNote] = useState('')

  const load = useCallback(async () => {
    try {
      const [rows, counts] = await Promise.all([
        api<FollowUp[]>(`/followups?scope=${scope}`),
        api<Summary>('/followups/summary'),
      ])
      setItems(rows)
      setSummary(counts)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Konnte nicht laden', 'error')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    return connectRealtime(event => {
      if (event?.entity === 'followup') load()
    })
  }, [load])

  useEffect(() => {
    api<Customer[]>('/customers').then(setCustomers).catch(() => {})
  }, [])

  const customerMatches = useMemo(() => {
    const query = newCustomerSearch.trim().toLowerCase()
    if (!query) return customers.slice(0, 8)
    return customers
      .filter(c => `${c.full_name} ${c.address}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [customers, newCustomerSearch])

  function openCreate() {
    setNewCustomerId('')
    setNewCustomerSearch('')
    setNewDueOn(heuteIso())
    setNewNote('')
    setCreating(true)
  }

  async function createFollowUp() {
    if (!newCustomerId) {
      toast('Bitte einen Kunden auswählen', 'error')
      return
    }
    const customer = customers.find(c => c.id === newCustomerId)
    if (!customer) return
    setCreatingBusy(true)
    try {
      await api('/followups', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: newCustomerId,
          employee_id: customer.employee_id,
          due_on: newDueOn,
          reason: 'manual',
          note: newNote.trim() || null,
        }),
      })
      toast('Wiedervorlage angelegt')
      setCreating(false)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setCreatingBusy(false)
    }
  }

  async function complete() {
    if (!completing) return
    try {
      await api(`/followups/${completing.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({completed_note: completeNote.trim() || null}),
      })
      toast('Nachfassaktion erledigt')
      setCompleting(null)
      setCompleteNote('')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    }
  }

  async function postpone(item: FollowUp, days: number) {
    const next = ausIso(item.due_on)
    next.setDate(next.getDate() + days)
    try {
      await api(`/followups/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({due_on: isoDatum(next)}),
      })
      toast(`Auf ${formatDate(isoDatum(next))} verschoben`)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    }
  }

  const grouped = useMemo(() => {
    const overdue = items.filter(i => i.is_overdue)
    const today = items.filter(i => i.is_due_today)
    const later = items.filter(i => !i.is_overdue && !i.is_due_today)
    return {overdue, today, later}
  }, [items])

  function card(item: FollowUp) {
    return (
      <article className="followup-card" key={item.id}>
        <div className="followup-main">
          <div className="followup-head">
            <Link to={`/kunden/${item.customer_id}`} className="followup-name">
              {item.customer_name}
              <ChevronRight size={15} />
            </Link>
            <span className={`followup-badge ${item.reason}`}>{item.reason_label}</span>
          </div>

          {item.note && <p className="followup-note">{item.note}</p>}

          <div className="followup-meta">
            <span>
              <CalendarClock size={14} />
              {item.is_overdue
                ? `${formatDate(item.due_on)} · ${item.days_overdue} ${
                    item.days_overdue === 1 ? 'Tag' : 'Tage'
                  } überfällig`
                : formatDate(item.due_on)}
            </span>
            {item.customer_phone && (
              <a href={`tel:${item.customer_phone}`}>
                <Phone size={14} />
                {item.customer_phone}
              </a>
            )}
            {item.customer_address && (
              <span>
                <MapPin size={14} />
                {item.customer_address}
              </span>
            )}
          </div>
        </div>

        {item.status === 'open' && (
          <div className="followup-actions">
            <button className="primary" onClick={() => setCompleting(item)}>
              <Check size={16} /> Erledigt
            </button>
            <button onClick={() => postpone(item, 1)}>+1 Tag</button>
            <button onClick={() => postpone(item, 7)}>+1 Woche</button>
          </div>
        )}
      </article>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Nachfassen</h1>
          <p>Wiedervorlagen, die heute anstehen oder liegengeblieben sind.</p>
        </div>
        <button className="primary" onClick={openCreate}>
          <Plus size={18} /> Neue Wiedervorlage
        </button>
      </div>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card orange">
            <small>Überfällig</small>
            <strong>{summary.overdue}</strong>
          </div>
          <div className="stat-card green">
            <small>Heute fällig</small>
            <strong>{summary.due_today}</strong>
          </div>
          <div className="stat-card">
            <small>Später</small>
            <strong>{summary.upcoming}</strong>
          </div>
          <div className="stat-card">
            <small>Offen gesamt</small>
            <strong>{summary.open}</strong>
          </div>
        </div>
      )}

      <div className="followup-tabs" role="tablist">
        {SCOPES.map(s => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            className={scope === s.key ? 'is-active' : ''}
            onClick={() => setScope(s.key)}
          >
            {s.label}
            {s.key === 'overdue' && summary?.overdue ? ` (${summary.overdue})` : ''}
            {s.key === 'today' && summary?.due_today ? ` (${summary.due_today})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Wird geladen…</div>
      ) : items.length === 0 ? (
        <div className="empty card">
          {scope === 'today'
            ? 'Für heute ist nichts offen. Gut gemacht.'
            : scope === 'overdue'
              ? 'Nichts überfällig.'
              : 'Keine Einträge in dieser Ansicht.'}
        </div>
      ) : (
        <div className="followup-list">
          {grouped.overdue.length > 0 && (
            <>
              <h2 className="followup-group overdue">
                <AlarmClock size={17} /> Überfällig ({grouped.overdue.length})
              </h2>
              {grouped.overdue.map(card)}
            </>
          )}
          {grouped.today.length > 0 && (
            <>
              <h2 className="followup-group">Heute ({grouped.today.length})</h2>
              {grouped.today.map(card)}
            </>
          )}
          {grouped.later.length > 0 && (
            <>
              <h2 className="followup-group">
                {scope === 'done' ? 'Erledigt' : 'Später'} ({grouped.later.length})
              </h2>
              {grouped.later.map(card)}
            </>
          )}
        </div>
      )}

      {completing && (
        <div className="modal-backdrop" onMouseDown={() => setCompleting(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Nachfassen bei {completing.customer_name}</h3>
              <button className="icon-button" onClick={() => setCompleting(null)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Was ist dabei herausgekommen? (optional)
                <textarea
                  rows={4}
                  value={completeNote}
                  onChange={e => setCompleteNote(e.target.value)}
                  placeholder="z. B. Kunde meldet sich im September wieder"
                />
              </label>
              <div className="form-actions span-2">
                <button onClick={() => setCompleting(null)}>Abbrechen</button>
                <button className="primary" onClick={complete}>
                  <Check size={16} /> Als erledigt markieren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Neue Wiedervorlage</h3>
              <button className="icon-button" onClick={() => setCreating(false)}>
                <X />
              </button>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Kunde
                <div className="search-field">
                  <Search size={16} />
                  <input
                    value={newCustomerId ? customers.find(c => c.id === newCustomerId)?.full_name || '' : newCustomerSearch}
                    onChange={e => {
                      setNewCustomerId('')
                      setNewCustomerSearch(e.target.value)
                    }}
                    placeholder="Kunde suchen…"
                  />
                </div>
                {!newCustomerId && newCustomerSearch.trim() && (
                  <div className="followup-customer-results">
                    {customerMatches.length === 0 && <div className="followup-customer-empty">Keine Treffer</div>}
                    {customerMatches.map(c => (
                      <button
                        type="button"
                        key={c.id}
                        className="followup-customer-result"
                        onClick={() => {
                          setNewCustomerId(c.id)
                          setNewCustomerSearch('')
                        }}
                      >
                        <strong>{c.full_name}</strong>
                        <small>{c.address}</small>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="span-2">
                Nachfassdatum
                <input type="date" value={newDueOn} onChange={e => setNewDueOn(e.target.value)} />
              </label>
              <label className="span-2">
                Notiz (optional)
                <textarea
                  rows={3}
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Worum geht es?"
                />
              </label>
              <div className="form-actions span-2">
                <button onClick={() => setCreating(false)}>Abbrechen</button>
                <button className="primary" disabled={creatingBusy || !newCustomerId} onClick={createFollowUp}>
                  <Plus size={16} /> Anlegen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
