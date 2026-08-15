import {useEffect, useState} from 'react'
import {ChevronLeft, ChevronRight, Download, Lightbulb} from 'lucide-react'
import {api, downloadFile} from '../lib/api'
import {useToast} from '../components/Toast'

type Kennzahlen = {
  revenue_cents: number
  revenue_previous_cents: number
  revenue_change_percent: number | null
  units: number
  units_previous: number
  sales: number
  appointments_total: number
  appointments_done: number
  appointments_done_previous: number
  appointments_with_sale: number
  presentations: number
  close_rate_percent: number
  close_rate_percent_previous: number
  revenue_per_appointment_cents: number
}

type Produkt = {
  name: string
  category: string | null
  quantity: number
  revenue_cents: number
  units: number
  share_percent: number
}

type Teamzeile = {
  employee_id: string
  name: string
  revenue_cents: number
  revenue_change_percent: number | null
  units: number
  appointments_done: number
  close_rate_percent: number
}

type Bericht = {
  kind: 'week' | 'month'
  label: string
  is_complete: boolean
  metrics: Kennzahlen
  products: Produkt[]
  rentals: {issued: number; returned: number; still_out: number; overdue: number}
  follow_ups: {created: number; open: number; overdue: number}
  highlights: string[]
  team: Teamzeile[] | null
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function zahl(wert: number) {
  return wert.toLocaleString('de-DE', {maximumFractionDigits: 1})
}

/** Veränderung als Text mit Vorzeichen; ohne Vorwert gibt es keine Prozentangabe. */
function veraenderung(prozent: number | null) {
  if (prozent === null) return {text: 'kein Vorwert', klasse: 'neutral'}
  if (prozent === 0) return {text: '±0 %', klasse: 'neutral'}
  return {
    text: `${prozent > 0 ? '+' : ''}${zahl(prozent)} %`,
    klasse: prozent > 0 ? 'auf' : 'ab',
  }
}

/**
 * Wochen- und Monatsberichte.
 *
 * Der Bericht wird bei jedem Aufruf frisch gerechnet – eine nachträglich
 * stornierte Buchung schlägt damit auch in einem alten Bericht durch, statt
 * eine überholte Zahl zu konservieren.
 */
export function ReportsPage() {
  const [art, setArt] = useState<'week' | 'month'>('week')
  const [offset, setOffset] = useState(1)
  const [bericht, setBericht] = useState<Bericht | null>(null)
  const [laedt, setLaedt] = useState(true)
  const toast = useToast()

  useEffect(() => {
    let abgebrochen = false
    setLaedt(true)
    api<Bericht>(`/reports/${art}?offset=${offset}`)
      .then(daten => {
        if (!abgebrochen) setBericht(daten)
      })
      .catch(err => {
        if (!abgebrochen) toast(err instanceof Error ? err.message : 'Konnte nicht laden', 'error')
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false)
      })
    return () => {
      abgebrochen = true
    }
  }, [art, offset])

  /* Die Textfassung kommt fertig vom Server - so steht in der Datei genau
     das, was auch die Seite zeigt. */
  async function herunterladen() {
    const titel = art === 'week' ? 'Wochenbericht' : 'Monatsbericht'
    try {
      await downloadFile(
        `/reports/${art}/text?offset=${offset}`,
        `${titel}-${bericht?.label ?? ''}.txt`.replace(/[\\/:*?"<>|]/g, '-'),
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download fehlgeschlagen', 'error')
    }
  }

  const m = bericht?.metrics
  const umsatz = veraenderung(m?.revenue_change_percent ?? null)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Berichte</h1>
          <p>Woche und Monat auf einen Blick – aus denselben Zahlen wie das Dashboard.</p>
        </div>
        <div className="page-head-actions">
          <button type="button" onClick={herunterladen} disabled={!bericht}>
            <Download size={16} /> Als Text speichern
          </button>
        </div>
      </div>

      <div className="bericht-steuerung">
        <div className="rental-tabs">
          <button
            type="button"
            className={art === 'week' ? 'plain-button is-active' : 'plain-button'}
            onClick={() => {
              setArt('week')
              setOffset(1)
            }}
          >
            Woche
          </button>
          <button
            type="button"
            className={art === 'month' ? 'plain-button is-active' : 'plain-button'}
            onClick={() => {
              setArt('month')
              setOffset(1)
            }}
          >
            Monat
          </button>
        </div>

        <div className="bericht-blaettern">
          <button type="button" onClick={() => setOffset(o => o + 1)} title="Weiter zurück">
            <ChevronLeft size={16} />
          </button>
          <strong>{bericht?.label ?? '…'}</strong>
          <button
            type="button"
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            title="Neuer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {laedt && !bericht ? (
        <div className="loading">Bericht wird erstellt…</div>
      ) : !bericht || !m ? (
        <p className="muted">Kein Bericht verfügbar.</p>
      ) : (
        <>
          {!bericht.is_complete && (
            <p className="bericht-zwischenstand">
              Der Zeitraum läuft noch – die Zahlen sind ein Zwischenstand.
            </p>
          )}

          <div className="bericht-kennzahlen">
            <div className="card bericht-kpi">
              <small>Umsatz</small>
              <strong>{euro(m.revenue_cents)}</strong>
              <span className={`bericht-delta ${umsatz.klasse}`}>
                {umsatz.text} · davor {euro(m.revenue_previous_cents)}
              </span>
            </div>

            <div className="card bericht-kpi">
              <small>Einheiten</small>
              <strong>{m.units}</strong>
              <span className="bericht-delta neutral">davor {m.units_previous}</span>
            </div>

            <div className="card bericht-kpi">
              <small>Termine durchgeführt</small>
              <strong>{m.appointments_done}</strong>
              <span className="bericht-delta neutral">
                davor {m.appointments_done_previous} · {m.appointments_with_sale} mit Abschluss
              </span>
            </div>

            <div className="card bericht-kpi">
              <small>Abschlussquote</small>
              <strong>{zahl(m.close_rate_percent)} %</strong>
              <span className="bericht-delta neutral">
                davor {zahl(m.close_rate_percent_previous)} % · {euro(m.revenue_per_appointment_cents)} je Termin
              </span>
            </div>
          </div>

          {bericht.highlights.length > 0 && (
            <section className="card bericht-hinweise">
              <div className="section-title">
                <Lightbulb size={17} />
                <h2>Auffälligkeiten</h2>
              </div>
              <ul>
                {bericht.highlights.map((satz, i) => (
                  <li key={i}>{satz}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="bericht-zweispaltig">
            <section className="card">
              <div className="section-title">
                <h2>Produkte</h2>
              </div>
              {bericht.products.length === 0 ? (
                <p className="muted">In diesem Zeitraum wurde nichts verkauft.</p>
              ) : (
                <table className="bericht-tabelle">
                  <thead>
                    <tr>
                      <th>Produkt</th>
                      <th className="rechts">Menge</th>
                      <th className="rechts">Umsatz</th>
                      <th className="rechts">Anteil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bericht.products.map(p => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="rechts">{p.quantity}</td>
                        <td className="rechts">{euro(p.revenue_cents)}</td>
                        <td className="rechts">{zahl(p.share_percent)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card">
              <div className="section-title">
                <h2>Verleih und Nachfassen</h2>
              </div>
              <ul className="bericht-liste">
                <li><span>Geräte ausgegeben</span><strong>{bericht.rentals.issued}</strong></li>
                <li><span>Geräte zurück</span><strong>{bericht.rentals.returned}</strong></li>
                <li>
                  <span>noch unterwegs</span>
                  <strong>
                    {bericht.rentals.still_out}
                    {bericht.rentals.overdue > 0 && (
                      <em className="bericht-warnend"> · {bericht.rentals.overdue} überfällig</em>
                    )}
                  </strong>
                </li>
                <li><span>Wiedervorlagen neu</span><strong>{bericht.follow_ups.created}</strong></li>
                <li>
                  <span>Wiedervorlagen offen</span>
                  <strong>
                    {bericht.follow_ups.open}
                    {bericht.follow_ups.overdue > 0 && (
                      <em className="bericht-warnend"> · {bericht.follow_ups.overdue} überfällig</em>
                    )}
                  </strong>
                </li>
              </ul>
            </section>
          </div>

          {bericht.team && (
            <section className="card">
              <div className="section-title">
                <h2>Team</h2>
              </div>
              <table className="bericht-tabelle">
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th className="rechts">Umsatz</th>
                    <th className="rechts">Veränderung</th>
                    <th className="rechts">Einheiten</th>
                    <th className="rechts">Termine</th>
                    <th className="rechts">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {bericht.team.map(t => {
                    const delta = veraenderung(t.revenue_change_percent)
                    return (
                      <tr key={t.employee_id}>
                        <td>{t.name}</td>
                        <td className="rechts">{euro(t.revenue_cents)}</td>
                        <td className={`rechts bericht-delta ${delta.klasse}`}>{delta.text}</td>
                        <td className="rechts">{t.units}</td>
                        <td className="rechts">{t.appointments_done}</td>
                        <td className="rechts">{zahl(t.close_rate_percent)} %</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  )
}
