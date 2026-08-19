/**
 * Ergebnis eines CSV-Imports - sichtbar für den Benutzer.
 *
 * Vorher landeten die Gründe für übersprungene Zeilen nur in
 * `console.info`. Wer die Entwicklerkonsole nicht offen hat - also
 * praktisch jeder - sah nur "12 angelegt, 40 übersprungen" und hatte keine
 * Möglichkeit herauszufinden, was mit den 40 Zeilen war.
 *
 * Die Hinweise werden nach Grund gruppiert statt Zeile für Zeile
 * ausgeschrieben: "37 × Produkt ist nicht angelegt" sagt mehr als
 * siebenunddreißig fast gleiche Sätze, und eine lange Liste einzelner
 * Datensätze gehört ohnehin nicht ungefragt auf den Bildschirm.
 */
export type ImportErgebnis = {
  angelegt: number
  uebersprungen: number
  hinweise: string[]
  /** "Kunden", "Preise" - was gezählt wurde. */
  einheit: string
  /** "angelegt", "gesetzt" - was damit geschehen ist. */
  taetigkeit?: string
}

// So viele Zeilennummern werden je Grund genannt. Danach nur noch die
// Anzahl - eine vollständige Liste wäre bei einem großen Import eine
// Bildschirmseite voller Nummern.
const MAX_ZEILEN_JE_GRUND = 8

const ZEILEN_MUSTER = /^Zeile\s+(\d+):\s*(.+)$/

type Gruppe = {grund: string; zeilen: number[]; anzahl: number}

/** Hinweise nach Grund zusammenfassen, Zeilennummern getrennt sammeln. */
export function gruppiereHinweise(hinweise: string[]): Gruppe[] {
  const nach_grund = new Map<string, Gruppe>()

  for (const hinweis of hinweise) {
    const treffer = ZEILEN_MUSTER.exec(hinweis.trim())
    const grund = treffer ? treffer[2].trim() : hinweis.trim()
    const zeile = treffer ? Number(treffer[1]) : null

    const vorhanden = nach_grund.get(grund) ?? {grund, zeilen: [], anzahl: 0}
    if (zeile !== null) vorhanden.zeilen.push(zeile)
    vorhanden.anzahl += 1
    nach_grund.set(grund, vorhanden)
  }

  return [...nach_grund.values()].sort((a, b) => b.anzahl - a.anzahl)
}

export function ImportSummary({ergebnis, onClose}: {ergebnis: ImportErgebnis; onClose: () => void}) {
  const {angelegt, uebersprungen, hinweise, einheit} = ergebnis
  const taetigkeit = ergebnis.taetigkeit ?? 'angelegt'
  const gruppen = gruppiereHinweise(hinweise)

  // Der Server schickt nur die ersten Hinweise mit. Wenn mehr übersprungen
  // wurde, als hier begründet ist, muss das dastehen - sonst sieht es aus,
  // als wären die restlichen Zeilen grundlos verschwunden.
  const begruendet = gruppen.reduce((summe, g) => summe + g.anzahl, 0)
  const ohne_begruendung = Math.max(0, uebersprungen - begruendet)

  return (
    <div className={uebersprungen ? 'import-summary has-skipped' : 'import-summary'} role="status" aria-live="polite">
      <div className="import-summary-head">
        <strong>
          {angelegt} {einheit} {taetigkeit}
          {uebersprungen > 0 && `, ${uebersprungen} übersprungen`}
        </strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Importergebnis schließen">
          ×
        </button>
      </div>

      {uebersprungen > 0 && (
        <ul className="import-summary-reasons">
          {gruppen.map(gruppe => (
            <li key={gruppe.grund}>
              <span className="import-summary-count">{gruppe.anzahl} ×</span> {gruppe.grund}
              {gruppe.zeilen.length > 0 && (
                <small>
                  {' '}
                  (Zeile {gruppe.zeilen.slice(0, MAX_ZEILEN_JE_GRUND).join(', ')}
                  {gruppe.zeilen.length > MAX_ZEILEN_JE_GRUND &&
                    ` und ${gruppe.zeilen.length - MAX_ZEILEN_JE_GRUND} weitere`}
                  )
                </small>
              )}
            </li>
          ))}
          {ohne_begruendung > 0 && (
            <li>
              <span className="import-summary-count">{ohne_begruendung} ×</span> weitere übersprungene
              Zeilen ohne Einzelbegründung
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
