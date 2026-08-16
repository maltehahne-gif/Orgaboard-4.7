import {useEffect, useState} from 'react'
import {Bell, BellOff, Smartphone} from 'lucide-react'
import {api} from '../lib/api'
import {useToast} from './Toast'
import {pushAusschalten, pushEinschalten, pushUnterstuetzt, pushZustand, type PushZustand} from '../lib/push'

type Kategorie = {
  category: string
  label: string
  in_app: boolean
  push: boolean
}

type Antwort = {
  push_available: boolean
  categories: Kategorie[]
}

/** Was der jeweilige Zustand für den Benutzer bedeutet. */
const ZUSTAND_TEXT: Record<PushZustand, string> = {
  'nicht-unterstuetzt':
    'Dieser Browser kann keine Push-Benachrichtigungen. Auf dem iPhone klappt es, sobald OrgaBoard über „Zum Home-Bildschirm“ installiert ist.',
  'nicht-eingerichtet':
    'Für dieses System ist kein Push eingerichtet. Die Benachrichtigungen erscheinen weiterhin in der Glocke.',
  blockiert:
    'Benachrichtigungen sind für diese Seite blockiert. Das lässt sich nur in den Browsereinstellungen wieder erlauben.',
  aus: 'Push ist auf diesem Gerät ausgeschaltet.',
  an: 'Push ist auf diesem Gerät eingeschaltet.',
}

export function NotificationSettings() {
  const toast = useToast()
  const [daten, setDaten] = useState<Antwort | null>(null)
  const [zustand, setZustand] = useState<PushZustand>('aus')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Antwort>('/notifications/settings')
      .then(async antwort => {
        setDaten(antwort)
        setZustand(await pushZustand(antwort.push_available))
      })
      .catch(() => setDaten(null))
  }, [])

  async function umschalten(kategorie: Kategorie, feld: 'in_app' | 'push', wert: boolean) {
    const vorher = daten
    // Sofort anzeigen; bei einem Fehler wird der alte Stand wiederhergestellt.
    setDaten(current =>
      current
        ? {
            ...current,
            categories: current.categories.map(c =>
              c.category === kategorie.category ? {...c, [feld]: wert} : c,
            ),
          }
        : current,
    )
    try {
      await api(`/notifications/settings/${kategorie.category}`, {
        method: 'PUT',
        body: JSON.stringify({
          in_app: feld === 'in_app' ? wert : kategorie.in_app,
          push: feld === 'push' ? wert : kategorie.push,
        }),
      })
    } catch (fehler) {
      setDaten(vorher)
      toast(fehler instanceof Error ? fehler.message : 'Einstellung konnte nicht gespeichert werden', 'error')
    }
  }

  async function pushUmschalten() {
    setBusy(true)
    try {
      const neu = zustand === 'an' ? await pushAusschalten() : await pushEinschalten()
      setZustand(neu)
      if (neu === 'an') toast('Push ist auf diesem Gerät eingeschaltet.')
      else if (neu === 'blockiert') toast('Benachrichtigungen sind im Browser blockiert.', 'error')
      else if (zustand === 'an') toast('Push ist auf diesem Gerät ausgeschaltet.')
    } catch (fehler) {
      toast(fehler instanceof Error ? fehler.message : 'Push konnte nicht geändert werden', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!daten) return null

  const kannUmschalten =
    pushUnterstuetzt() && daten.push_available && zustand !== 'blockiert'

  return (
    <section className="card notif-settings">
      <h2>Benachrichtigungen</h2>
      <p className="insights-note">
        Je Anlass lässt sich getrennt einstellen, ob er in der Glocke erscheint und ob er
        zusätzlich aufs Gerät geschickt wird.
      </p>

      <div className={zustand === 'an' ? 'notif-push-box is-on' : 'notif-push-box'}>
        <span className="notif-push-icon">
          {zustand === 'an' ? <Bell size={18} /> : <BellOff size={18} />}
        </span>
        <div className="notif-push-text">
          <strong>Push auf diesem Gerät</strong>
          <small>{ZUSTAND_TEXT[zustand]}</small>
        </div>
        {kannUmschalten && (
          <button type="button" className={zustand === 'an' ? '' : 'primary'} disabled={busy} onClick={pushUmschalten}>
            <Smartphone size={16} />
            {busy ? 'Einen Moment…' : zustand === 'an' ? 'Ausschalten' : 'Einschalten'}
          </button>
        )}
      </div>

      <table className="notif-table">
        <thead>
          <tr>
            <th>Anlass</th>
            <th>Glocke</th>
            <th>Push</th>
          </tr>
        </thead>
        <tbody>
          {daten.categories.map(kategorie => (
            <tr key={kategorie.category}>
              <td>{kategorie.label}</td>
              <td>
                <input
                  type="checkbox"
                  checked={kategorie.in_app}
                  aria-label={`${kategorie.label} in der Glocke anzeigen`}
                  onChange={event => umschalten(kategorie, 'in_app', event.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={kategorie.push}
                  aria-label={`${kategorie.label} als Push senden`}
                  onChange={event => umschalten(kategorie, 'push', event.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
