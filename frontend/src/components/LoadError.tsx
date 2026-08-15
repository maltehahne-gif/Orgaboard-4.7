import {AlertTriangle} from 'lucide-react'

/**
 * Hinweis, wenn eine Seite ihre Daten nicht laden konnte.
 *
 * Eine leere Liste und ein fehlgeschlagener Abruf sehen sonst gleich aus –
 * der Benutzer glaubt dann, es gäbe keine Daten, obwohl nur der Server nicht
 * erreichbar war. Deshalb sagt diese Karte, was passiert ist, zeigt die
 * Meldung des Servers und bietet einen zweiten Versuch an.
 */
export function LoadError({meldung, onRetry}: {meldung: string; onRetry?: () => void}) {
  return (
    <div className="card error-box lade-fehler" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>Daten konnten nicht geladen werden.</strong>
        <small>{meldung}</small>
      </div>
      {onRetry && (
        <button type="button" className="plain-button" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  )
}
