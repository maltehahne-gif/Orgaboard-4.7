import {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {createPortal} from 'react-dom'
import {Package, Search, X} from 'lucide-react'

/**
 * Produktauswahl mit Suche – die eine Stelle für alle Formulare.
 *
 * Vorher stand dieselbe Liste dreimal im Projekt (Verkauf, Angebot,
 * Terminabschluss) und schob sich als gewöhnlicher Block in den Textfluss.
 * Das war der eigentliche Fehler: bei 50 Produkten war die Liste höher als
 * das halbe Formular, die Felder darunter rutschten weg, und in einem Dialog
 * schnitt das nächste `overflow:hidden` sie ab.
 *
 * Deshalb hängt die Liste hier nicht mehr im Formular, sondern in einem
 * Portal am `document.body` und positioniert sich `fixed` am Eingabefeld.
 * Damit ist sie unabhängig von jedem Elternteil – kein `overflow:hidden`
 * schneidet sie ab, kein fremder Stapelkontext schiebt sie hinter das
 * nächste Feld, und es braucht keinen z-index-Wettlauf.
 *
 * Die Höhe richtet sich nach dem sichtbaren Bereich: passt sie unter das
 * Feld, öffnet sie nach unten, sonst nach oben. Was nicht hineinpasst, wird
 * innerhalb der Liste gescrollt – nicht das Formular.
 *
 * Auf Telefonen zählt der Bereich, den die Bildschirmtastatur übrig lässt
 * (`visualViewport`), sonst läge die halbe Liste unter der Tastatur.
 *
 * Was hier bewusst *nicht* passiert: filtern, Preise rechnen, Produkte
 * laden. Das bleibt beim Aufrufer, weil jede Seite ihre eigenen Regeln hat.
 * Die Komponente bekommt fertige Einträge und meldet die getroffene Wahl
 * zurück.
 */

export type ProduktEintrag = {
  id: string
  name: string
  /** Kategorie – kleiner und ruhiger als der Name. */
  category?: string | null
  /** Zusatz wie K70-Gruppe oder Artikelnummer. */
  meta?: string | null
  /** Fertig formatierter Preis. null heißt: kein Preis hinterlegt. */
  price?: string | null
}

type Props = {
  /** Suchtext im Feld. Der Aufrufer hält ihn, damit seine Logik greift. */
  value: string
  onChange: (wert: string) => void
  /** Bereits gefilterte Treffer – die Filterregel bleibt beim Aufrufer. */
  options: ProduktEintrag[]
  onSelect: (eintrag: ProduktEintrag) => void
  /** Zurücksetzen; ohne diese Angabe erscheint kein Löschknopf. */
  onClear?: () => void
  placeholder?: string
  emptyText?: ReactNode
  label?: ReactNode
  disabled?: boolean
  /** Aufschrift des Feldes für Vorlesehilfen, wenn kein Label danebensteht. */
  ariaLabel?: string
}

type Lage = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

/* Wunschhöhe der Liste. Mehr als das sieht auch auf einem großen Bildschirm
   nach „Seite zugedeckt“ aus; weniger macht das Scrollen mühsam. */
const WUNSCHHOEHE = 340
const MINDESTHOEHE = 132
const RAND = 8
const ABSTAND = 4

function sichtbarerBereich() {
  /* visualViewport kennt die Bildschirmtastatur, window.innerHeight nicht.
     Ohne diese Unterscheidung öffnet die Liste auf dem Telefon unter der
     Tastatur und ist nicht mehr erreichbar. */
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    hoehe: vv?.height ?? window.innerHeight,
    breite: vv?.width ?? window.innerWidth,
    versatzOben: vv?.offsetTop ?? 0,
    versatzLinks: vv?.offsetLeft ?? 0,
  }
}

function berechneLage(anker: HTMLElement): Lage {
  const feld = anker.getBoundingClientRect()
  const sicht = sichtbarerBereich()

  const untererRand = sicht.versatzOben + sicht.hoehe - RAND
  const obererRand = sicht.versatzOben + RAND

  const platzUnten = untererRand - feld.bottom - ABSTAND
  const platzOben = feld.top - obererRand - ABSTAND

  /* Nach oben nur, wenn es unten wirklich eng ist und oben mehr Platz hat.
     Sonst springt die Liste bei jedem Tastendruck hin und her. */
  const nachOben = platzUnten < MINDESTHOEHE && platzOben > platzUnten

  const verfuegbar = Math.max(nachOben ? platzOben : platzUnten, 0)
  const maxHeight = Math.max(
    Math.min(WUNSCHHOEHE, verfuegbar),
    Math.min(MINDESTHOEHE, Math.max(verfuegbar, 0)) || MINDESTHOEHE,
  )

  const width = Math.min(feld.width, sicht.breite - 2 * RAND)
  let left = feld.left
  const rechterRand = sicht.versatzLinks + sicht.breite - RAND
  if (left + width > rechterRand) left = rechterRand - width
  if (left < sicht.versatzLinks + RAND) left = sicht.versatzLinks + RAND

  return nachOben
    ? {left, width, maxHeight, bottom: window.innerHeight - feld.top + ABSTAND}
    : {left, width, maxHeight, top: feld.bottom + ABSTAND}
}

export function ProductCombobox({
  value,
  onChange,
  options,
  onSelect,
  onClear,
  placeholder = 'Produkt suchen …',
  emptyText = 'Kein Produkt gefunden.',
  label,
  disabled,
  ariaLabel,
}: Props) {
  const [offen, setOffen] = useState(false)
  const [markiert, setMarkiert] = useState(0)
  const [lage, setLage] = useState<Lage | null>(null)

  const feldRef = useRef<HTMLDivElement>(null)
  const eingabeRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)

  const listenId = useId()

  const nachfuehren = useCallback(() => {
    if (feldRef.current) setLage(berechneLage(feldRef.current))
  }, [])

  /* Vor dem ersten Zeichnen messen – sonst blitzt die Liste einen Bildaufbau
     lang an der falschen Stelle auf. */
  useLayoutEffect(() => {
    if (offen) nachfuehren()
  }, [offen, nachfuehren, options.length])

  useEffect(() => {
    if (!offen) return

    /* `true` als dritter Wert: auch das Scrollen eines Elterncontainers oder
       Dialogs muss die Liste mitnehmen, nicht nur das der Seite. */
    const beiBewegung = () => nachfuehren()
    window.addEventListener('scroll', beiBewegung, true)
    window.addEventListener('resize', beiBewegung)
    window.visualViewport?.addEventListener('resize', beiBewegung)
    window.visualViewport?.addEventListener('scroll', beiBewegung)

    return () => {
      window.removeEventListener('scroll', beiBewegung, true)
      window.removeEventListener('resize', beiBewegung)
      window.visualViewport?.removeEventListener('resize', beiBewegung)
      window.visualViewport?.removeEventListener('scroll', beiBewegung)
    }
  }, [offen, nachfuehren])

  useEffect(() => {
    if (!offen) return
    const beiKlickAussen = (e: Event) => {
      const ziel = e.target as Node
      if (feldRef.current?.contains(ziel) || listeRef.current?.contains(ziel)) return
      setOffen(false)
    }
    /* In der Capture-Phase, nicht beim Blasen. Die Formulare, in denen diese
       Auswahl steckt, liegen durchweg in einem Dialog – und der Dialog hält
       mousedown auf, damit ein Klick in ihn hinein ihn nicht schließt. Beim
       Blasen käme das Ereignis hier deshalb nie an, und die Liste bliebe
       offen stehen, sobald man daneben klickt. */
    const optionen = {capture: true}
    document.addEventListener('mousedown', beiKlickAussen, optionen)
    document.addEventListener('touchstart', beiKlickAussen, {capture: true, passive: true})
    return () => {
      document.removeEventListener('mousedown', beiKlickAussen, optionen)
      document.removeEventListener('touchstart', beiKlickAussen, optionen)
    }
  }, [offen])

  /* Die Markierung darf nicht auf einen Eintrag zeigen, den es nach dem
     Tippen nicht mehr gibt. */
  useEffect(() => {
    setMarkiert(m => (m >= options.length ? 0 : m))
  }, [options.length])

  useEffect(() => {
    if (!offen) return
    const zeile = listeRef.current?.querySelector<HTMLElement>('[data-markiert="ja"]')
    // Nicht jede Umgebung kennt scrollIntoView – ohne die Prüfung stünde
    // hier ein Fehler statt einer nur nicht mitgeführten Liste.
    zeile?.scrollIntoView?.({block: 'nearest'})
  }, [markiert, offen])

  function waehle(eintrag: ProduktEintrag) {
    onSelect(eintrag)
    // Sofort schließen: die Liste hat ihre Aufgabe erfüllt, und die Felder
    // darunter müssen wieder erreichbar sein.
    setOffen(false)
    setMarkiert(0)
  }

  function beiTaste(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (offen) {
        e.stopPropagation()
        setOffen(false)
      }
      return
    }
    if (e.key === 'Tab') {
      setOffen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!offen) {
        setOffen(true)
        return
      }
      if (!options.length) return
      setMarkiert(m =>
        e.key === 'ArrowDown'
          ? (m + 1) % options.length
          : (m - 1 + options.length) % options.length,
      )
      return
    }
    if (e.key === 'Home' && offen && options.length) {
      e.preventDefault()
      setMarkiert(0)
      return
    }
    if (e.key === 'End' && offen && options.length) {
      e.preventDefault()
      setMarkiert(options.length - 1)
      return
    }
    if (e.key === 'Enter' && offen && options[markiert]) {
      // Nur schlucken, wenn wirklich etwas ausgewählt wird – sonst kann das
      // Formular nicht mehr mit Enter abgeschickt werden.
      e.preventDefault()
      waehle(options[markiert])
    }
  }

  const aktiveId = offen && options[markiert] ? `${listenId}-${markiert}` : undefined

  const feld = (
    <div className="produktwahl" ref={feldRef}>
      <Search size={18} aria-hidden="true" />
      <input
        ref={eingabeRef}
        type="text"
        role="combobox"
        aria-expanded={offen}
        aria-controls={listenId}
        aria-autocomplete="list"
        aria-activedescendant={aktiveId}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={e => {
          onChange(e.target.value)
          setOffen(true)
          setMarkiert(0)
        }}
        onFocus={() => setOffen(true)}
        /* Zusätzlich zum Fokus: nach einer Auswahl bleibt der Fokus im Feld
           stehen, und ein erneuter Klick löst dann kein onFocus mehr aus.
           Ohne diese Zeile ließe sich die Liste nur noch durch Tippen oder
           Wegklicken-und-Zurückklicken öffnen. */
        onClick={() => setOffen(true)}
        onKeyDown={beiTaste}
      />
      {value && onClear && (
        <button
          type="button"
          className="produktwahl-leeren"
          aria-label="Auswahl zurücksetzen"
          onClick={() => {
            onClear()
            setOffen(false)
            eingabeRef.current?.focus()
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )

  return (
    <>
      {label ? (
        <label className="produktwahl-label">
          {label}
          {feld}
        </label>
      ) : (
        feld
      )}

      {offen &&
        lage &&
        createPortal(
          <div
            ref={listeRef}
            id={listenId}
            role="listbox"
            className="produktwahl-liste"
            style={{
              left: lage.left,
              width: lage.width,
              maxHeight: lage.maxHeight,
              ...(lage.top !== undefined ? {top: lage.top} : {bottom: lage.bottom}),
            }}
            /* Den Fokus im Eingabefeld halten: sonst schließt der Blur die
               Liste, bevor der Klick auf den Eintrag ankommt. */
            onMouseDown={e => e.preventDefault()}
          >
            {options.length === 0 ? (
              <p className="produktwahl-leer">{emptyText}</p>
            ) : (
              options.map((eintrag, i) => (
                <div
                  key={eintrag.id}
                  id={`${listenId}-${i}`}
                  role="option"
                  aria-selected={i === markiert}
                  data-markiert={i === markiert ? 'ja' : 'nein'}
                  className="produktwahl-zeile"
                  onMouseEnter={() => setMarkiert(i)}
                  onClick={() => waehle(eintrag)}
                >
                  <span className="produktwahl-symbol" aria-hidden="true">
                    <Package size={18} />
                  </span>

                  <span className="produktwahl-text">
                    <strong className="produktwahl-name">{eintrag.name}</strong>
                    {(eintrag.category || eintrag.meta) && (
                      <small className="produktwahl-kategorie">
                        {[eintrag.category, eintrag.meta].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </span>

                  <span
                    className={
                      eintrag.price
                        ? 'produktwahl-preis'
                        : 'produktwahl-preis ist-offen'
                    }
                  >
                    {eintrag.price ?? 'Preis nicht hinterlegt'}
                  </span>
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
