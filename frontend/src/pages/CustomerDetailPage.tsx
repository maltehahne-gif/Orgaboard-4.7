import {FormEvent, useCallback, useEffect, useState} from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Download,
  ShieldOff,
  Mail,
  MapPin,
  MessageSquarePlus,
  Package,
  PackageCheck,
  Phone,
  Presentation,
  ShoppingCart,
  StickyNote,
  Undo2,
} from 'lucide-react'
import {Link, useParams} from 'react-router-dom'
import {api, formatDateTime} from '../lib/api'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'

type Customer = {
  id: string
  full_name: string
  address: string
  phone: string | null
  email: string | null
  notes: string | null
}

type Event = {
  kind: string
  at: string
  title: string
  detail: string | null
  entity_id: string | null
  meta: Record<string, unknown>
}

type Timeline = {
  customer: Customer
  funnel_stage: string
  funnel_label: string
  events: Event[]
}

const FUNNEL_ORDER = [
  'contact',
  'appointment_set',
  'appointment_done',
  'presentation',
  'offer',
  'sale',
  'aftercare',
]

const KIND_ICON: Record<string, typeof CalendarDays> = {
  appointment: CalendarDays,
  presentation: Presentation,
  sale: ShoppingCart,
  rental: Package,
  rental_return: Undo2,
  note: StickyNote,
  follow_up: PackageCheck,
}

const KIND_LABEL: Record<string, string> = {
  appointment: 'Termin',
  presentation: 'Vorführung',
  sale: 'Verkauf',
  rental: 'Verleih',
  rental_return: 'Rückgabe',
  note: 'Notiz',
  follow_up: 'Nachfassen',
}

export function CustomerDetailPage() {
  const {customerId} = useParams<{customerId: string}>()
  const [data, setData] = useState<Timeline | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const {me} = useAuth()
  const isTeamLeader = me?.role === 'TEAM_LEADER'

  /**
   * Auskunft nach Art. 15 DSGVO: alle gespeicherten Daten als Datei.
   * Die Datei entsteht im Browser aus der Antwort - so wandert nichts über
   * einen zusätzlichen Umweg.
   */
  async function datenauskunft() {
    if (!customerId) return
    try {
      const daten = await api<Record<string, unknown>>(`/customers/${customerId}/export`)
      const blob = new Blob([JSON.stringify(daten, null, 2)], {type: 'application/json'})
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Datenauskunft-${customerId}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast('Datenauskunft heruntergeladen')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Auskunft fehlgeschlagen', 'error')
    }
  }

  /** Löschung nach Art. 17 DSGVO - unwiderruflich, deshalb zweistufig. */
  async function anonymisieren() {
    if (!customerId || !data) return
    const name = data.customer.full_name
    if (!window.confirm(
      `Personenbezogene Daten von ${name} unwiderruflich entfernen?\n\n` +
      'Name, Adresse, Telefon, E-Mail und alle Notizen werden gelöscht – auch in ' +
      'Terminen und im Protokoll.\n\n' +
      'Verkäufe und Umsatzzahlen bleiben erhalten, ohne Personenbezug.\n\n' +
      'Das lässt sich nicht rückgängig machen.'
    )) return

    if (window.prompt('Zur Bestätigung bitte ANONYMISIEREN eintippen:') !== 'ANONYMISIEREN') {
      toast('Abgebrochen – nichts geändert')
      return
    }

    try {
      await api(`/customers/${customerId}/anonymize`, {method: 'POST'})
      toast('Kunde wurde anonymisiert')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Anonymisierung fehlgeschlagen', 'error')
    }
  }

  const load = useCallback(async () => {
    if (!customerId) return
    try {
      setData(await api<Timeline>(`/customers/${customerId}/timeline`))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Konnte nicht laden', 'error')
    }
  }, [customerId])

  useEffect(() => {
    load()
  }, [load])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    const body = noteBody.trim()
    if (!body || !customerId) return
    setSaving(true)
    try {
      await api(`/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({body}),
      })
      setNoteBody('')
      toast('Notiz gespeichert')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <div className="loading">Kundenakte wird geladen…</div>

  const {customer, events} = data
  const stageIndex = FUNNEL_ORDER.indexOf(data.funnel_stage)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/kunden" className="back-link">
            <ArrowLeft size={16} /> Alle Kunden
          </Link>
          <h1>{customer.full_name}</h1>
          <p>{customer.address || 'Keine Adresse hinterlegt'}</p>
        </div>

        <div className="page-head-actions">
          <button type="button" onClick={datenauskunft} title="Alle gespeicherten Daten als Datei (Art. 15 DSGVO)">
            <Download size={16} /> Datenauskunft
          </button>
          {isTeamLeader && (
            <button type="button" className="danger-button" onClick={anonymisieren}
              title="Personenbezug unwiderruflich entfernen (Art. 17 DSGVO)">
              <ShieldOff size={16} /> Anonymisieren
            </button>
          )}
        </div>
      </div>

      <div className="customer-contact card">
        {customer.phone && (
          <a href={`tel:${customer.phone}`}>
            <Phone size={16} /> {customer.phone}
          </a>
        )}
        {customer.email && (
          <a href={`mailto:${customer.email}`}>
            <Mail size={16} /> {customer.email}
          </a>
        )}
        {customer.address && (
          <span>
            <MapPin size={16} /> {customer.address}
          </span>
        )}
      </div>

      {/* Trichterstufe – aus den Ereignissen abgeleitet, nicht gespeichert */}
      <section className="card funnel-strip">
        <div className="section-title">
          <h2>Status: {data.funnel_label}</h2>
        </div>
        <ol className="funnel-steps">
          {FUNNEL_ORDER.map((stage, index) => (
            <li
              key={stage}
              className={
                index < stageIndex
                  ? 'done'
                  : index === stageIndex
                    ? 'current'
                    : ''
              }
            >
              <span />
            </li>
          ))}
        </ol>
      </section>

      <form className="card note-compose" onSubmit={addNote}>
        <label>
          <MessageSquarePlus size={16} /> Notiz hinzufügen
          <textarea
            rows={3}
            value={noteBody}
            onChange={e => setNoteBody(e.target.value)}
            placeholder="Was wurde besprochen?"
          />
        </label>
        <div className="form-actions">
          <button className="primary" disabled={saving || !noteBody.trim()}>
            {saving ? 'Wird gespeichert…' : 'Notiz speichern'}
          </button>
        </div>
      </form>

      <section className="card timeline-card">
        <div className="section-title">
          <h2>Verlauf</h2>
        </div>

        {events.length === 0 ? (
          <p className="muted">Zu diesem Kunden ist noch nichts erfasst.</p>
        ) : (
          <ol className="timeline">
            {events.map((event, index) => {
              const Icon = KIND_ICON[event.kind] ?? StickyNote
              return (
                <li key={`${event.kind}-${event.entity_id}-${index}`} className={`timeline-item ${event.kind}`}>
                  <span className="timeline-icon">
                    <Icon size={15} />
                  </span>
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <strong>{event.title}</strong>
                      <span className="timeline-kind">{KIND_LABEL[event.kind] ?? event.kind}</span>
                    </div>
                    {event.detail && <p>{event.detail}</p>}
                    <small>{formatDateTime(event.at)}</small>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
