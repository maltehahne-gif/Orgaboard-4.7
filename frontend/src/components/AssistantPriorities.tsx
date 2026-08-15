import {useEffect, useState} from 'react'
import {AlarmClock, ChevronRight, PackageCheck, Presentation, Target} from 'lucide-react'
import {Link} from 'react-router-dom'
import {api} from '../lib/api'

type Eintrag = {
  level: 'hoch' | 'mittel' | 'niedrig'
  kind: string
  customer_id: string | null
  customer: string
  title: string
  reasons: string[]
}

type Prioritaeten = {
  date: string
  items: Eintrag[]
  counts: {hoch: number; mittel: number}
  note: string | null
}

const SYMBOL: Record<string, typeof AlarmClock> = {
  follow_up_overdue: AlarmClock,
  follow_up_today: AlarmClock,
  presentation_without_sale: Presentation,
  rental_due: PackageCheck,
}

/**
 * Was heute am wichtigsten ist.
 *
 * Jeder Eintrag trägt seine Begründung sichtbar mit – eine Empfehlung, die
 * man nicht nachvollziehen kann, ist im Vertrieb wertlos. Die Reihenfolge
 * entsteht serverseitig aus benannten Regeln, nicht aus einer Gewichtung,
 * die niemand nachrechnen kann.
 */
export function AssistantPriorities() {
  const [daten, setDaten] = useState<Prioritaeten | null>(null)
  const [fehler, setFehler] = useState(false)

  useEffect(() => {
    api<Prioritaeten>('/assistant/insights/priorities')
      .then(setDaten)
      .catch(() => setFehler(true))
  }, [])

  // Der Assistent darf keine Voraussetzung sein: fällt die Auswertung aus,
  // verschwindet die Karte, der Rest der Seite bleibt bedienbar.
  if (fehler) return null
  if (!daten) return <div className="loading">Prioritäten werden geladen…</div>

  return (
    <section className="card ki-prioritaeten">
      <div className="section-title">
        <Target size={17} />
        <h2>Heute wichtig</h2>
        {daten.counts.hoch > 0 && (
          <span className="ki-zaehler">{daten.counts.hoch} × hoch</span>
        )}
      </div>

      {daten.items.length === 0 ? (
        <p className="muted">{daten.note}</p>
      ) : (
        <ol className="ki-prio-liste">
          {daten.items.map((e, i) => {
            const Symbol = SYMBOL[e.kind] ?? Target
            const inhalt = (
              <>
                <span className={`ki-prio-stufe ${e.level}`}>
                  <Symbol size={14} />
                </span>
                <span className="ki-prio-text">
                  <strong>{e.title}</strong>
                  <small>{e.reasons.join(' · ')}</small>
                </span>
                {e.customer_id && <ChevronRight size={15} />}
              </>
            )

            return (
              <li key={`${e.kind}-${e.customer_id}-${i}`} className={`ki-prio ${e.level}`}>
                {e.customer_id
                  ? <Link to={`/kunden/${e.customer_id}`}>{inhalt}</Link>
                  : <span>{inhalt}</span>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
