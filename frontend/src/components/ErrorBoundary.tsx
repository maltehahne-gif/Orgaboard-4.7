import {Component, type ErrorInfo, type ReactNode} from 'react'
import {AlertTriangle} from 'lucide-react'

type Props = {
  children: ReactNode
  /** Wechselt dieser Wert, versucht die Grenze es erneut - etwa beim Seitenwechsel. */
  zuruecksetzenBei?: unknown
  /** Beschreibt, welcher Teil abgestürzt ist, für die Meldung an den Benutzer. */
  bereich?: string
}

type State = {fehler: Error | null}

/**
 * Fängt Abstürze beim Aufbau der Oberfläche ab.
 *
 * Ohne diese Grenze reicht ein einziger unerwarteter Wert - ein fehlendes
 * Feld in einer Antwort, ein Datum, das nicht kommt - und React räumt den
 * gesamten Baum ab: Der Benutzer sieht eine weiße Seite, ohne Meldung, ohne
 * Menü, ohne Weg zurück. Mit der Grenze bleibt der Rest der Anwendung
 * bedienbar, und statt der weißen Seite steht dort, was zu tun ist.
 *
 * Der technische Fehlertext geht bewusst nur in die Entwicklerkonsole: Ein
 * Stacktrace hilft dem Vertrieb nicht weiter und kann Interna preisgeben.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {fehler: null}

  static getDerivedStateFromError(fehler: Error): State {
    return {fehler}
  }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    // Für die Fehlersuche - sichtbar nur in der Konsole, nicht im Fenster.
    console.error('Oberfläche abgestürzt:', fehler, info.componentStack)
  }

  componentDidUpdate(vorher: Props) {
    // Nach einem Seitenwechsel darf der alte Fehler nicht kleben bleiben,
    // sonst wäre die Anwendung bis zum Neuladen blockiert.
    if (this.state.fehler && vorher.zuruecksetzenBei !== this.props.zuruecksetzenBei) {
      this.setState({fehler: null})
    }
  }

  render() {
    if (!this.state.fehler) return this.props.children

    return (
      <div className="absturz card" role="alert">
        <AlertTriangle size={26} />
        <h2>{this.props.bereich ?? 'Dieser Bereich'} konnte nicht angezeigt werden.</h2>
        <p>
          Es ist ein unerwarteter Fehler aufgetreten. Deine Daten sind davon nicht
          betroffen – gespeichert ist, was vorher gespeichert wurde.
        </p>
        <div className="absturz-aktionen">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Seite neu laden
          </button>
          <button
            type="button"
            className="plain-button"
            onClick={() => this.setState({fehler: null})}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }
}
