import {Search, X} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {api} from '../lib/api'

type Result = {kind: string; id: string; title: string; subtitle: string}

/**
 * Wohin ein Treffer führt. "sale" hat keine eigene Ansicht - /verkaeufe
 * zeigt die Liste, in der der Verkauf auftaucht.
 */
function resultHref(result: Result): string {
  switch (result.kind) {
    case 'customer': return `/kunden/${result.id}`
    case 'product': return `/produkte`
    case 'appointment': return `/termine`
    case 'sale': return `/verkaeufe`
    default: return '/'
  }
}

export function GlobalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  // Drei Zustände, die vorher alle gleich aussahen: solange gesucht wird,
  // wenn nichts gefunden wurde, und wenn der Server nicht antwortet. Früher
  // wurde in allen drei Fällen einfach nichts eingeblendet - ein
  // Serverfehler war von "keine Treffer" nicht zu unterscheiden, und der
  // Benutzer suchte weiter nach etwas, das die Suche gerade gar nicht
  // beantworten konnte.
  const [zustand, setZustand] = useState<'leer' | 'laedt' | 'fertig' | 'fehler'>('leer')
  const [fehlertext, setFehlertext] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  // Zaehlt jeden gestarteten Abruf durch. Kommt eine Antwort zurueck, die
  // nicht mehr zum aktuellen Suchtext gehoert (weil der Benutzer laengst
  // weitergetippt hat), wird sie verworfen - sonst ueberschreibt eine spaet
  // eintreffende Antwort auf "M" das bereits sichtbare Ergebnis zu "Ma".
  const requestId = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) {
        setResults([])
        setZustand('leer')
        setActiveIndex(-1)
        return
      }
      const myId = ++requestId.current
      setZustand('laedt')
      api<Result[]>(`/search?q=${encodeURIComponent(q)}`)
        .then(data => {
          if (requestId.current !== myId) return
          setResults(data)
          setZustand('fertig')
          setActiveIndex(-1)
        })
        .catch(err => {
          if (requestId.current !== myId) return
          setResults([])
          setZustand('fehler')
          setFehlertext(err instanceof Error ? err.message : 'Die Suche ist gerade nicht erreichbar.')
        })
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Klick außerhalb schließt die Ergebnisliste, ohne den Suchtext zu löschen.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function goTo(result: Result) {
    navigate(resultHref(result))
    setOpen(false)
    setQ('')
    setResults([])
    setActiveIndex(-1)
    // Fokus zurück aufs Suchfeld, statt irgendwo im Dokument zu verschwinden -
    // ein Tab von hier soll wieder sinnvoll weitergehen.
    inputRef.current?.focus()
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => (index <= 0 ? results.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < results.length) {
        event.preventDefault()
        goTo(results[activeIndex])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  const showResults = open && results.length > 0
  // Das Feld bleibt auch dann geöffnet, wenn es nichts zu zeigen gibt -
  // sonst wäre die Antwort auf jede Suche ein leerer Bildschirm.
  const showPopover = open && q.trim().length >= 2 && zustand !== 'leer'

  return (
    <div className="global-search" ref={containerRef}>
      <Search size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder="Globale Suche…"
        aria-label="Kunden, Produkte, Termine und Verkäufe durchsuchen"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="global-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined}
        autoComplete="off"
      />
      {q ? (
        <button type="button" className="icon-button" onClick={() => { setQ(''); setResults([]); setZustand('leer'); inputRef.current?.focus() }} aria-label="Suche leeren">
          <X size={15} />
        </button>
      ) : (
        <span className="global-search-hint">⌘K</span>
      )}
      {showPopover && (
        <div className="search-popover" role="listbox" id="global-search-listbox">
          {zustand === 'laedt' && (
            <p className="search-state" role="status">Wird gesucht …</p>
          )}
          {zustand === 'fehler' && (
            <p className="search-state is-error" role="alert">
              {fehlertext}
            </p>
          )}
          {zustand === 'fertig' && results.length === 0 && (
            <p className="search-state" role="status">Keine Treffer.</p>
          )}
          {results.map((r, index) => (
            <button
              type="button"
              key={`${r.kind}-${r.id}`}
              id={`global-search-result-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'search-result is-active' : 'search-result'}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => goTo(r)}
            >
              <span className="badge">{r.kind}</span>
              <span>
                <strong>{r.title}</strong>
                <small>{r.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
