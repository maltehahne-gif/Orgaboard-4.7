import {FormEvent, useState} from 'react'
import {Send} from 'lucide-react'
import {api} from '../lib/api'
import {letzterBesuchterPfad} from '../App'

type Kategorie = 'bug' | 'improvement' | 'feature_request' | 'design' | 'performance' | 'other'

const KATEGORIEN: {value: Kategorie; label: string}[] = [
  {value: 'bug', label: 'Fehler / Bug'},
  {value: 'improvement', label: 'Verbesserung'},
  {value: 'feature_request', label: 'Funktionswunsch'},
  {value: 'design', label: 'Design / Bedienung'},
  {value: 'performance', label: 'Performance'},
  {value: 'other', label: 'Sonstiges'},
]

const NACHRICHT_MINDESTLAENGE = 10

function leeresFormular() {
  return {
    category: 'bug' as Kategorie,
    subject: '',
    message: '',
    page_path: letzterBesuchterPfad(),
  }
}

export function FeedbackPage() {
  const [form, setForm] = useState(leeresFormular)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{reference: string} | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setError('')
    setSuccess(null)

    const subject = form.subject.trim()
    const message = form.message.trim()

    if (!subject || !message) {
      setError('Bitte fülle Betreff und Nachricht aus.')
      return
    }
    if (message.length < NACHRICHT_MINDESTLAENGE) {
      setError(`Die Nachricht sollte mindestens ${NACHRICHT_MINDESTLAENGE} Zeichen lang sein.`)
      return
    }

    setBusy(true)
    try {
      const antwort = await api<{ok: boolean; reference: string; email_sent: boolean}>('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          subject,
          message,
          page_path: form.page_path.trim() || null,
        }),
      })
      setSuccess({reference: antwort.reference})
      setForm(leeresFormular())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback konnte nicht gesendet werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Feedback</h1>
          <p>Melde einen Fehler, eine Idee oder alles andere, was OrgaBoard besser machen würde.</p>
        </div>
      </div>

      <form className="card form-grid feedback-form" onSubmit={submit}>
        <label>
          Kategorie
          <select
            required
            value={form.category}
            onChange={e => setForm({...form, category: e.target.value as Kategorie})}
          >
            {KATEGORIEN.map(kategorie => (
              <option key={kategorie.value} value={kategorie.value}>{kategorie.label}</option>
            ))}
          </select>
        </label>

        <label>
          Betreff
          <input
            type="text"
            required
            maxLength={200}
            value={form.subject}
            onChange={e => setForm({...form, subject: e.target.value})}
            placeholder="Kurze Zusammenfassung"
          />
        </label>

        <label className="span-2">
          Nachricht
          <textarea
            required
            rows={8}
            maxLength={8000}
            value={form.message}
            onChange={e => setForm({...form, message: e.target.value})}
            placeholder="Was ist passiert? Was hast du erwartet? Wo trat es auf? Wie lässt es sich reproduzieren?"
          />
        </label>
        <p className="span-2 muted feedback-hint">
          Am hilfreichsten sind Antworten auf: Was ist passiert? Was wurde erwartet?
          Wo trat das Problem auf? Wie lässt es sich reproduzieren?
        </p>

        <label className="span-2">
          Aktuelle Seite <span className="muted">(optional)</span>
          <input
            type="text"
            maxLength={300}
            value={form.page_path}
            onChange={e => setForm({...form, page_path: e.target.value})}
            placeholder="z. B. /verkaeufe"
          />
        </label>

        {error && (
          <div className="error-box span-2" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="info-box span-2" role="status" aria-live="polite">
            Vielen Dank! Dein Feedback wurde erfolgreich übermittelt.
            <br />
            <small>Referenz: {success.reference}</small>
          </div>
        )}

        <div className="form-actions span-2">
          <button className="primary" type="submit" disabled={busy}>
            <Send size={16} aria-hidden="true" />
            {busy ? 'Wird gesendet …' : 'Feedback senden'}
          </button>
        </div>
      </form>
    </div>
  )
}
