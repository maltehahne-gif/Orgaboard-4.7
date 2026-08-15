import {Bell, Check} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {api, formatDateTime} from '../lib/api'
import {connectRealtime} from '../lib/realtime'

type Notification = {
  id: string
  kind: string
  title: string
  body: string | null
  created_at: string
  read_at: string | null
}

export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

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
        {unread > 0 && <span className="ob-notif-dot">{badge}</span>}
      </button>

      {open && (
        <div className="ob-notif-popover">
          <div className="ob-notif-head">Benachrichtigungen</div>
          {items.length === 0 && <div className="ob-notif-empty">Keine Benachrichtigungen</div>}
          {items.slice(0, 20).map(item => (
            <button
              type="button"
              key={item.id}
              className={item.read_at ? 'ob-notif-row' : 'ob-notif-row is-unread'}
              onClick={() => markRead(item)}
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
