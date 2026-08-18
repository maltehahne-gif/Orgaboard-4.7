import {ChangeEvent, FormEvent, useEffect, useRef, useState} from 'react'
import {AlertTriangle, ChevronDown, ChevronRight, Trash2, Upload} from 'lucide-react'
import {api} from '../lib/api'
import {useToast} from './Toast'
import {heuteIso} from '../lib/datum'

type Preis = {
  id: string
  amount_cents: number
  currency: string
  valid_from: string | null
  valid_to: string | null
  source_url: string
  verified: boolean
  fetched_at: string
}

type Zeile = {
  product_id: string
  name: string
  category: string
  verified: boolean
  price: Preis | null
  unverified_count: number
  history_count: number
}

type Uebersicht = {
  products: Zeile[]
  without_price: number
}

function euro(cents: number) {
  return (cents / 100).toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function datum(wert: string | null) {
  if (!wert) return '–'
  const [jahr, monat, tag] = wert.split('-')
  return `${tag}.${monat}.${jahr}`
}

/**
 * Zentrale Preisverwaltung.
 *
 * Bisher liess sich ein Preis nur beim Anlegen eines Produkts mitgeben. Wer
 * wissen wollte, wo überhaupt ein Preis fehlt, musste jedes Produkt einzeln
 * öffnen. Hier stehen alle nebeneinander – mit Verlauf, damit eine
 * Preiserhöhung nachvollziehbar bleibt.
 */
export function ProductPrices() {
  const [daten, setDaten] = useState<Uebersicht | null>(null)
  const [suche, setSuche] = useState('')
  const [nurOhnePreis, setNurOhnePreis] = useState(false)
  const [offen, setOffen] = useState<string | null>(null)
  const [verlauf, setVerlauf] = useState<Record<string, Preis[]>>({})
  const [form, setForm] = useState({betrag: '', ab: heuteIso(), quelle: ''})
  const [busy, setBusy] = useState(false)
  const [importiere, setImportiere] = useState(false)
  const dateiRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  async function laden() {
    try {
      setDaten(await api<Uebersicht>('/products/prices/overview'))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Konnte nicht laden', 'error')
    }
  }

  useEffect(() => {
    laden()
  }, [])

  async function verlaufLaden(produktId: string) {
    try {
      setVerlauf(v => ({...v, [produktId]: []}))
      const liste = await api<Preis[]>(`/products/${produktId}/prices`)
      setVerlauf(v => ({...v, [produktId]: liste}))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Verlauf nicht abrufbar', 'error')
    }
  }

  function aufklappen(zeile: Zeile) {
    if (offen === zeile.product_id) {
      setOffen(null)
      return
    }
    setOffen(zeile.product_id)
    setForm({betrag: '', ab: heuteIso(), quelle: ''})
    verlaufLaden(zeile.product_id)
  }

  async function speichern(event: FormEvent, produktId: string) {
    event.preventDefault()
    if (busy) return

    const betrag = Number(form.betrag.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(betrag) || betrag < 0) {
      toast('Bitte einen gültigen Betrag eintragen', 'error')
      return
    }
    if (!form.quelle.trim()) {
      toast('Bitte eintragen, woher der Preis stammt', 'error')
      return
    }

    setBusy(true)
    try {
      await api(`/products/${produktId}/prices`, {
        method: 'POST',
        body: JSON.stringify({
          amount_cents: Math.round(betrag * 100),
          source_url: form.quelle.trim(),
          valid_from: form.ab || null,
          verified: true,
        }),
      })
      toast('Preis gespeichert')
      setForm({betrag: '', ab: heuteIso(), quelle: ''})
      await Promise.all([laden(), verlaufLaden(produktId)])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function loeschen(produktId: string, preis: Preis) {
    if (!window.confirm(
      `Preiseintrag ${euro(preis.amount_cents)} ab ${datum(preis.valid_from)} entfernen?\n\n` +
      'Bereits erfasste Verkäufe behalten ihren Preis – Umsatzzahlen der ' +
      'Vergangenheit ändern sich dadurch nicht.'
    )) return

    try {
      await api(`/products/${produktId}/prices/${preis.id}`, {method: 'DELETE'})
      toast('Preiseintrag entfernt')
      await Promise.all([laden(), verlaufLaden(produktId)])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Löschen fehlgeschlagen', 'error')
    }
  }

  /* CSV einlesen und an den Server geben. Das Zerlegen passiert dort, damit
     dieselben Regeln gelten wie beim Eintragen von Hand. */
  async function importieren(event: ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0]
    event.target.value = ''
    if (!datei) return

    const quelle = window.prompt(
      'Woher stammen diese Preise? (gilt für alle Zeilen ohne eigene Quellenspalte)',
      datei.name,
    )
    if (quelle === null) return

    setImportiere(true)
    try {
      const text = await datei.text()
      const ergebnis = await api<{gesetzt: number; uebersprungen: number; hinweise: string[]}>(
        '/products/prices/import',
        {method: 'POST', body: JSON.stringify({csv: text, source_url: quelle || null})},
      )
      await laden()
      toast(
        ergebnis.uebersprungen
          ? `${ergebnis.gesetzt} Preise gesetzt, ${ergebnis.uebersprungen} übersprungen`
          : `${ergebnis.gesetzt} Preise gesetzt`,
      )
      if (ergebnis.hinweise.length) console.info('Preisimport übersprungen:', ergebnis.hinweise)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import fehlgeschlagen', 'error')
    } finally {
      setImportiere(false)
    }
  }

  if (!daten) return <div className="loading">Preise werden geladen…</div>

  const begriff = suche.trim().toLowerCase()
  const zeilen = daten.products.filter(z => {
    if (nurOhnePreis && z.price) return false
    if (begriff && !`${z.name} ${z.category}`.toLowerCase().includes(begriff)) return false
    return true
  })

  return (
    <>
      <div className="preis-kopf">
        <div className="preis-filter">
          <input
            type="search"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Produkt oder Kategorie suchen …"
          />
          <label className="preis-nur-ohne">
            <input
              type="checkbox"
              checked={nurOhnePreis}
              onChange={e => setNurOhnePreis(e.target.checked)}
            />
            Nur ohne Preis
          </label>
        </div>

        <input ref={dateiRef} type="file" accept=".csv,text/csv" hidden onChange={importieren} />
        <button
          type="button"
          disabled={importiere}
          onClick={() => dateiRef.current?.click()}
          title="Preise aus einer CSV-Datei übernehmen"
        >
          <Upload size={16} /> {importiere ? 'Import läuft…' : 'Preise importieren'}
        </button>
      </div>

      {daten.without_price > 0 && (
        <div className="preis-hinweis">
          <AlertTriangle size={16} />
          <span>
            {daten.without_price === 1
              ? 'Bei einem Produkt fehlt der Preis.'
              : `Bei ${daten.without_price} Produkten fehlt der Preis.`}
            {' '}Ohne Preis lässt es sich zwar verkaufen, der Betrag muss dann aber
            jedes Mal von Hand eingetragen werden.
          </span>
        </div>
      )}

      <div className="preis-tabelle table-card">
        <table>
          <thead>
            <tr>
              <th />
              <th>Produkt</th>
              <th>Kategorie</th>
              <th className="rechts">Gültiger Preis</th>
              <th>Gültig ab</th>
              <th>Verlauf</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(z => {
              const aufgeklappt = offen === z.product_id
              const eintraege = verlauf[z.product_id]

              return [
                <tr
                  key={z.product_id}
                  className={z.price ? 'preis-zeile' : 'preis-zeile ohne-preis'}
                  onClick={() => aufklappen(z)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={aufgeklappt}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      aufklappen(z)
                    }
                  }}
                >
                  <td className="preis-pfeil">
                    {aufgeklappt ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </td>
                  <td><strong>{z.name}</strong></td>
                  <td>{z.category || '–'}</td>
                  <td className="rechts">
                    {z.price
                      ? <strong>{euro(z.price.amount_cents)}</strong>
                      : <span className="preis-fehlt">nicht hinterlegt</span>}
                  </td>
                  <td>{z.price ? datum(z.price.valid_from) : '–'}</td>
                  <td>
                    {z.history_count === 0
                      ? '–'
                      : `${z.history_count} ${z.history_count === 1 ? 'Eintrag' : 'Einträge'}`}
                  </td>
                </tr>,

                aufgeklappt && (
                  <tr key={`${z.product_id}-detail`} className="preis-detail">
                    <td colSpan={6}>
                      <form className="preis-form" onSubmit={e => speichern(e, z.product_id)}>
                        <label>
                          Neuer Preis (EUR)
                          <input
                            value={form.betrag}
                            onChange={e => setForm({...form, betrag: e.target.value})}
                            inputMode="decimal"
                            placeholder="1.299,00"
                            required
                          />
                        </label>
                        <label>
                          Gültig ab
                          <input
                            type="date"
                            value={form.ab}
                            onChange={e => setForm({...form, ab: e.target.value})}
                          />
                        </label>
                        <label className="preis-quelle">
                          Quelle
                          <input
                            value={form.quelle}
                            onChange={e => setForm({...form, quelle: e.target.value})}
                            placeholder="z. B. Preisliste 08/2026"
                            required
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          {busy ? 'Speichern…' : 'Preis setzen'}
                        </button>
                      </form>

                      {eintraege === undefined ? null : eintraege.length === 0 ? (
                        <p className="muted">Noch kein Preis erfasst.</p>
                      ) : (
                        <table className="preis-verlauf">
                          <thead>
                            <tr>
                              <th className="rechts">Betrag</th>
                              <th>Gültig ab</th>
                              <th>Gültig bis</th>
                              <th>Quelle</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {eintraege.map(p => (
                              <tr key={p.id} className={p.verified ? undefined : 'unbestaetigt'}>
                                <td className="rechts">{euro(p.amount_cents)}</td>
                                <td>{datum(p.valid_from)}</td>
                                <td>{p.valid_to ? datum(p.valid_to) : 'offen'}</td>
                                <td className="preis-quelle-zelle">
                                  {p.source_url}
                                  {!p.verified && <span className="preis-marke">unbestätigt</span>}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="plain-button preis-loeschen"
                                    onClick={() => loeschen(z.product_id, p)}
                                    title="Eintrag entfernen"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>

        {zeilen.length === 0 && <p className="muted preis-leer">Kein Produkt passt zur Suche.</p>}
      </div>

      <p className="preis-csv-hilfe muted">
        <strong>CSV-Format:</strong> erste Zeile Spaltennamen, Semikolon oder Komma als
        Trennzeichen. Erkannt werden <code>Produkt</code>, <code>Preis</code>,
        {' '}<code>Gültig ab</code> (JJJJ-MM-TT) und <code>Quelle</code>. Zugeordnet wird über
        den Produktnamen – unbekannte Produkte werden übersprungen und nicht angelegt.
      </p>
    </>
  )
}
