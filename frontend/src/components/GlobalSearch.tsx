import {Search, X} from 'lucide-react'
import {useEffect, useRef, useState} from 'react'
import {api} from '../lib/api'

type Result = {kind: string; id: string; title: string; subtitle: string}

export function GlobalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim().length < 2) {
        setResults([])
        return
      }
      api<Result[]>(`/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="global-search">
      <Search size={16} />
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Globale Suche…"
        aria-label="Kunden, Produkte, Termine und Verkäufe durchsuchen"
      />
      {q ? (
        <button className="icon-button" onClick={() => setQ('')}>
          <X size={15} />
        </button>
      ) : (
        <span className="global-search-hint">⌘K</span>
      )}
      {results.length > 0 && (
        <div className="search-popover">
          {results.map(r => (
            <div key={`${r.kind}-${r.id}`} className="search-result">
              <span className="badge">{r.kind}</span>
              <div>
                <strong>{r.title}</strong>
                <small>{r.subtitle}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
