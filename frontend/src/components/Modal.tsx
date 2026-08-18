import React, {useEffect, useId, useRef} from 'react'
import {X} from 'lucide-react'

const FOKUSIERBAR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  title: string
  children: React.ReactNode
  onClose: () => void
  /**
   * Während eines kritischen Speichervorgangs: weder ein Klick auf den
   * Hintergrund noch Escape noch die Schließen-Schaltfläche dürfen den
   * Dialog dann unbeabsichtigt schließen - eine laufende Anfrage liefe sonst
   * unbemerkt im Hintergrund weiter, ohne dass ihr Ergebnis noch irgendwo
   * ankommt.
   */
  closeDisabled?: boolean
}

/**
 * Zentrales Dialogfenster - jede Änderung hier wirkt auf alle Modals der
 * Anwendung (Verkauf, Angebot, Verleih, Termin, Verwaltung, ...).
 *
 * role="dialog"/aria-modal/aria-labelledby machen aus einer optisch
 * abgedunkelten Fläche einen fuer Screenreader tatsaechlich erkennbaren
 * Dialog. Escape schliesst, der Fokus wandert beim Oeffnen hinein und beim
 * Schliessen zurueck zu dem Element, das den Dialog geoeffnet hat - ohne das
 * bliebe die Tastatur nach dem Schliessen "verloren" mitten im Dokument.
 * Tab haelt sich innerhalb des Dialogs (Fokus-Falle), sonst wandert man beim
 * Weitertabben unbemerkt in die Seite dahinter.
 */
export function Modal({title, children, onClose, closeDisabled = false}: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // Der Dialog selbst bekommt den Fokus, nicht sein erstes fokussierbares
    // Kind - das wäre hier immer die Schließen-Schaltfläche (sie steht im
    // Markup vor dem eigentlichen Inhalt) und damit ein irreführender erster
    // Stopp fuer Tastatur und Screenreader.
    dialogRef.current?.focus()

    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (closeDisabled) return
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const fokusierbare = Array.from(dialog.querySelectorAll<HTMLElement>(FOKUSIERBAR))
      if (fokusierbare.length === 0) return

      const erste = fokusierbare[0]
      const letzte = fokusierbare[fokusierbare.length - 1]

      if (event.shiftKey && document.activeElement === erste) {
        event.preventDefault()
        letzte.focus()
      } else if (!event.shiftKey && document.activeElement === letzte) {
        event.preventDefault()
        erste.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, closeDisabled])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={() => {
        if (!closeDisabled) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id={titleId}>{title}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Schließen"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
