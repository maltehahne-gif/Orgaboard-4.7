import {Bell, Check, CheckCheck} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {api, formatDateTime} from '../lib/api'
import {connectRealtime} from '../lib/realtime'

type Notification = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  read_at: string | null
}

export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const load = () => {
    api<Notification[]>('/notifications')
      .then(setItems)
      .catch(() => setItems([]))
  }

  useEffect(() => {
    load()
    return connectRealtime(() => load())
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = items.filter(item => !item.read_at).length
  const badge = unread > 9 ? '9+' : String(unread)

  async function markRead(notification: Notification) {
    if (notification.read_at) return
    try {
      await api(`/notifications/${notification.id}/read`, {method: 'PATCH'})
      setItems(current =>
        current.map(item =>
          item.id === notification.id ? {...item, read_at: new Date().toISOString()} : item,
        ),
      )
    } catch {
      // Kein UI-Feedback nötig - die Ansicht bleibt konsistent, weil der
      // nächste Ladevorgang den echten Stand nachzieht.
    }
  }

  /**
   * Antippen heißt: gelesen und hin da. Die Meldung sagt, dass etwas ansteht -
   * sie nur abzuhaken, ließe den Benutzer den Weg dorthin selbst suchen.
   */
  function oeffnen(notification: Notification) {
    markRead(notification)
    if (notification.link) {
      setOpen(false)
      navigate(notification.link)
    }
  }

  async function alleGelesen() {
    try {
      await api('/notifications/read-all', {method: 'POST'})
      const jetzt = new Date().toISOString()
      setItems(current => current.map(item => (item.read_at ? item : {...item, read_at: jetzt})))
    } catch {
      // Wie oben: der nächste Ladevorgang zieht den echten Stand nach.
    }
  }

  return (
    <div className="ob-notif" ref={boxRef}>
      <button
        type="button"
        className="ob-icon-button"
        onClick={() => setOpen(current => !current)}
        aria-label="Benachrichtigungen"
        aria-expanded={open}
      >
        <Bell size={19} strokeWidth={1.9} />
        {unread > 0 && <span className="ob-notif-dot" aria-label={`${badge} ungelesen`} />}
      </button>

      {open && (
        <div className="ob-notif-popover">
          <div className="ob-notif-head">
            Benachrichtigungen
            {unread > 0 && (
              <button type="button" className="ob-notif-readall" onClick={alleGelesen}>
                <CheckCheck size={14} aria-hidden="true" /> Alle gelesen
              </button>
            )}
          </div>
          {items.length === 0 && <div className="ob-notif-empty">Keine Benachrichtigungen</div>}
          {items.slice(0, 20).map(item => (
            <button
              type="button"
              key={item.id}
              className={item.read_at ? 'ob-notif-row' : 'ob-notif-row is-unread'}
              onClick={() => oeffnen(item)}
            >
              <span className="ob-notif-row-main">
                <strong>{item.title}</strong>
                {item.body && <small>{item.body}</small>}
                <small className="ob-notif-time">{formatDateTime(item.created_at)}</small>
              </span>
              {!item.read_at && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
