import {FormEvent, useCallback, useEffect, useRef, useState} from 'react'
import {
  AlarmClock,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Download,
  FileSignature,
  ShieldOff,
  Mail,
  MapPin,
  MessageSquarePlus,
  Navigation,
  Package,
  PackageCheck,
  Phone,
  Presentation,
  ShoppingCart,
  StickyNote,
  Undo2,
} from 'lucide-react'
import {Link, useNavigate, useParams} from 'react-router-dom'
import {api, formatDateTime} from '../lib/api'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {ausIso, heuteIso} from '../lib/datum'
import {FUNNEL_ORDER} from '../lib/funnel'
import {kartenHref, mailHref, telHref} from '../lib/mobile'

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

type FollowUp = {
  id: string
  due_on: string
  reason: string
  note: string | null
  days_until: number
  is_overdue: boolean
  is_today: boolean
}

type Timeline = {
  customer: Customer
  funnel_stage: string
  funnel_label: string
  next_follow_up: FollowUp | null
  events: Event[]
}

const REASON_LABEL: Record<string, string> = {
  no_result: 'Termin ohne Abschluss',
  after_sale: 'Nachbetreuung nach Verkauf',
  rental_return: 'Gerät zurückholen',
  offer: 'Angebot nachfassen',
  manual: 'Wiedervorlage',
}

function faelligkeitstext(f: FollowUp) {
  const datum = ausIso(f.due_on).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  if (f.is_today) return `heute fällig · ${datum}`
  if (f.is_overdue) {
    const tage = Math.abs(f.days_until)
    return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'} überfällig · ${datum}`
  }
  return `in ${f.days_until} ${f.days_until === 1 ? 'Tag' : 'Tagen'} · ${datum}`
}

const KIND_ICON: Record<string, typeof CalendarDays> = {
  appointment: CalendarDays,
  presentation: Presentation,
  offer: FileSignature,
  sale: ShoppingCart,
  rental: Package,
  rental_return: Undo2,
  note: StickyNote,
  follow_up: PackageCheck,
}

const KIND_LABEL: Record<string, string> = {
  appointment: 'Termin',
  presentation: 'Vorführung',
  offer: 'Angebot',
  sale: 'Verkauf',
  rental: 'Verleih',
  rental_return: 'Rückgabe',
  note: 'Notiz',
  follow_up: 'Nachfassen',
}

export function CustomerDetailPage() {
  const {customerId} = useParams<{customerId: string}>()
  const navigate = useNavigate()
  const [data, setData] = useState<Timeline | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [nachfassOffen, setNachfassOffen] = useState(false)
  const [nachfass, setNachfass] = useState({datum: heuteIso(), notiz: ''})
  const [nachfassBusy, setNachfassBusy] = useState(false)
  const notizFeldRef = useRef<HTMLTextAreaElement | null>(null)
  const toast = useToast()
  const {me} = useAuth()
  const isTeamLeader = darfVerwalten(me?.role)

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

  /** Wiedervorlage anlegen oder verschieben - beides über dieselbe Maske. */
  async function nachfassenSpeichern(e: FormEvent) {
    e.preventDefault()
    if (!customerId || !nachfass.datum) return

    setNachfassBusy(true)
    try {
      if (data?.next_follow_up) {
        await api(`/followups/${data.next_follow_up.id}`, {
          method: 'PUT',
          body: JSON.stringify({due_on: nachfass.datum, note: nachfass.notiz || null}),
        })
        toast('Wiedervorlage verschoben')
      } else {
        await api('/followups', {
          method: 'POST',
          body: JSON.stringify({
            customer_id: customerId,
            due_on: nachfass.datum,
            note: nachfass.notiz || null,
          }),
        })
        toast('Wiedervorlage angelegt')
      }
      setNachfassOffen(false)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setNachfassBusy(false)
    }
  }

  async function nachfassenErledigt() {
    if (!data?.next_follow_up) return
    try {
      await api(`/followups/${data.next_follow_up.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({completed_note: null}),
      })
      toast('Wiedervorlage erledigt')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
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
  const stageIndex = (FUNNEL_ORDER as readonly string[]).indexOf(data.funnel_stage)

  // Was Termin-, Verkaufs- und Angebotsmaske brauchen, um den Kunden schon
  // ausgefüllt zu übernehmen - eine Angabe, drei Ziele.
  const kundenZustand = {openCreate: true, customerId, customerName: customer.full_name}

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
          <button
            type="button"
            className="primary"
            onClick={() => navigate('/angebote', {state: {openCreate: true, customerId, customerName: customer.full_name}})}
            title="Angebot für diesen Kunden erstellen"
          >
            <FileSignature size={16} /> Angebot erstellen
          </button>
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
        {telHref(customer.phone) && (
          <a href={telHref(customer.phone)}>
            <Phone size={16} /> {customer.phone}
          </a>
        )}
        {mailHref(customer.email) && (
          <a href={mailHref(customer.email)}>
            <Mail size={16} /> {customer.email}
          </a>
        )}
        {/* Die Anschrift ist antippbar: unterwegs führt sie direkt in die
            Karten-App, statt zum Abtippen zu zwingen. */}
        {kartenHref(customer.address) ? (
          <a href={kartenHref(customer.address)} target="_blank" rel="noopener noreferrer">
            <MapPin size={16} /> {customer.address}
          </a>
        ) : customer.address && (
          <span>
            <MapPin size={16} /> {customer.address}
          </span>
        )}
      </div>

      {/* Schnellaktionen – das, was im Außendienst vor der Tür zählt. */}
      <div className="quick-actions card">
        {telHref(customer.phone) && (
          <a className="quick-action" href={telHref(customer.phone)}>
            <Phone size={18} /> Anrufen
          </a>
        )}
        {kartenHref(customer.address) && (
          <a
            className="quick-action"
            href={kartenHref(customer.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation size={18} /> Navigieren
          </a>
        )}
        <button
          type="button"
          className="quick-action"
          onClick={() => navigate('/termine', {state: kundenZustand})}
        >
          <CalendarDays size={18} /> Termin
        </button>
        <button
          type="button"
          className="quick-action"
          onClick={() => notizFeldRef.current?.focus()}
        >
          <StickyNote size={18} /> Notiz
        </button>
        <button
          type="button"
          className="quick-action"
          onClick={() => {
            setNachfass({
              datum: data.next_follow_up?.due_on ?? heuteIso(),
              notiz: data.next_follow_up?.note ?? '',
            })
            setNachfassOffen(true)
          }}
        >
          <AlarmClock size={18} /> Nachfassen
        </button>
        <button
          type="button"
          className="quick-action"
          onClick={() => navigate('/verkaeufe', {state: kundenZustand})}
        >
          <ShoppingCart size={18} /> Verkauf
        </button>
        <button
          type="button"
          className="quick-action"
          onClick={() => navigate('/angebote', {state: kundenZustand})}
        >
          <FileSignature size={18} /> Angebot
        </button>
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

      {/* Nächster Kontakt – die Frage, die man vor einem Besuch hat */}
      <section
        className={
          data.next_follow_up?.is_overdue
            ? 'card nachfass-karte is-overdue'
            : data.next_follow_up?.is_today
              ? 'card nachfass-karte is-today'
              : 'card nachfass-karte'
        }
      >
        <div className="nachfass-kopf">
          <span className="nachfass-symbol">
            {data.next_follow_up?.is_overdue ? <AlarmClock size={17} /> : <CalendarClock size={17} />}
          </span>

          <div className="nachfass-text">
            {data.next_follow_up ? (
              <>
                <strong>Nachfassen {faelligkeitstext(data.next_follow_up)}</strong>
                <span>
                  {REASON_LABEL[data.next_follow_up.reason] ?? 'Wiedervorlage'}
                  {data.next_follow_up.note && ` · ${data.next_follow_up.note}`}
                </span>
              </>
            ) : (
              <>
                <strong>Kein Nachfassdatum gesetzt</strong>
                <span>Ohne Termin für den nächsten Kontakt gerät ein Kunde leicht in Vergessenheit.</span>
              </>
            )}
          </div>

          <div className="nachfass-aktionen">
            {data.next_follow_up && (
              <button type="button" onClick={nachfassenErledigt}>
                <CheckCircle2 size={15} /> Erledigt
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNachfass({
                  datum: data.next_follow_up?.due_on ?? heuteIso(),
                  notiz: data.next_follow_up?.note ?? '',
                })
                setNachfassOffen(v => !v)
              }}
            >
              {data.next_follow_up ? 'Verschieben' : 'Nachfassen planen'}
            </button>
          </div>
        </div>

        {nachfassOffen && (
          <form className="nachfass-form" onSubmit={nachfassenSpeichern}>
            <label>
              Nachfassen am
              <input
                type="date"
                required
                value={nachfass.datum}
                onChange={e => setNachfass({...nachfass, datum: e.target.value})}
              />
            </label>
            <label className="nachfass-notiz">
              Worum geht es?
              <input
                value={nachfass.notiz}
                onChange={e => setNachfass({...nachfass, notiz: e.target.value})}
                placeholder="z. B. Angebot VK7 nachfassen"
              />
            </label>
            <button className="primary" disabled={nachfassBusy}>
              {nachfassBusy ? 'Speichern…' : 'Speichern'}
            </button>
          </form>
        )}
      </section>

      <form className="card note-compose" onSubmit={addNote}>
        <label>
          <MessageSquarePlus size={16} /> Notiz hinzufügen
          <textarea
            ref={notizFeldRef}
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
