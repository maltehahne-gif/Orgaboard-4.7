import {useCallback, useEffect, useMemo, useState} from 'react'
import {Download, FileText, Search, X} from 'lucide-react'
import {api, downloadFile, formatDate, money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {LoadError} from '../components/LoadError'
import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'
import type {Invoice} from '../types'

const ZAHLUNGSARTEN = [
  {value: '', label: 'Noch offen'},
  {value: 'cash', label: 'Barzahlung'},
  {value: 'card', label: 'Kartenzahlung'},
]

/* Dieselbe Schreibweise wie in der Verkaufsliste - fest in Europe/Berlin,
   damit ein Beleg überall dasselbe Datum trägt. */
function datum(wert:string){
  return formatDate(wert)
}

export function InvoicesPage(){
  const {me} = useAuth()
  const toast = useToast()
  const istFuehrung = darfVerwalten(me?.role)

  const [rows, setRows] = useState<Invoice[]>([])
  const [ladend, setLadend] = useState(true)
  const [ladefehler, setLadefehler] = useState<string|null>(null)
  const [suche, setSuche] = useState('')
  const [offen, setOffen] = useState<Invoice|null>(null)
  const [busy, setBusy] = useState(false)

  const laden = useCallback(async () => {
    setLadend(true)
    try {
      setRows(await api<Invoice[]>('/invoices'))
      setLadefehler(null)
    } catch (error) {
      setLadefehler(error instanceof Error ? error.message : 'Die Rechnungen sind gerade nicht erreichbar.')
    } finally {
      setLadend(false)
    }
  }, [])

  useEffect(() => { laden() }, [laden])

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (!begriff) return rows
    return rows.filter(rechnung => [
      rechnung.number,
      rechnung.customer.name,
      rechnung.issuer.name,
      rechnung.customer.city,
    ].filter(Boolean).join(' ').toLowerCase().includes(begriff))
  }, [rows, suche])

  const gesamt = useMemo(
    () => gefiltert.reduce((summe, rechnung) => summe + rechnung.total_cents, 0),
    [gefiltert],
  )

  async function pdfLaden(rechnung:Invoice){
    try {
      await downloadFile(`/invoices/${rechnung.id}/pdf`, `${rechnung.number}.pdf`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Die PDF-Datei konnte nicht geladen werden.', 'error')
    }
  }

  async function speichern(rechnung:Invoice, aenderung:Record<string,unknown>){
    setBusy(true)
    try {
      const gespeichert = await api<Invoice>(`/invoices/${rechnung.id}`, {
        method: 'PATCH',
        body: JSON.stringify(aenderung),
      })
      setRows(current => current.map(item => item.id === gespeichert.id ? gespeichert : item))
      setOffen(gespeichert)
      toast('Rechnung aktualisiert')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Die Rechnung konnte nicht gespeichert werden.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page">
    <div className="page-head">
      <div>
        <h1>Rechnungen</h1>
        <p>Zu jedem gespeicherten Verkauf entsteht automatisch eine Rechnung.</p>
      </div>
    </div>

    {ladend && <div className="loading">Rechnungen werden geladen…</div>}
    {!ladend && ladefehler && <LoadError meldung={ladefehler} onRetry={laden}/>}

    {!ladend && !ladefehler && <>
      <section className="sales-filter-panel card">
        <div className="sales-filter-search">
          <Search size={17}/>
          <input
            type="search"
            value={suche}
            onChange={event => setSuche(event.target.value)}
            placeholder="Suchen – Rechnungsnummer, Kunde, Berater …"
          />
        </div>
        {suche && (
          <button type="button" className="sales-filter-reset" onClick={() => setSuche('')}>
            <X size={16}/> Suche zurücksetzen
          </button>
        )}
        <div className="sales-filter-result">
          <strong>{gefiltert.length}</strong> {gefiltert.length === 1 ? 'Rechnung' : 'Rechnungen'}
          {' · '}
          <strong>{money(gesamt)}</strong> Gesamtbetrag
        </div>
      </section>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Rechnungsnummer</th>
              <th>Datum</th>
              <th>Kunde</th>
              {istFuehrung && <th>Berater</th>}
              <th>Zahlungsart</th>
              <th>Gesamtbetrag</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 && (
              <tr>
                <td colSpan={istFuehrung ? 7 : 6} className="empty">
                  {rows.length === 0
                    ? 'Noch keine Rechnung vorhanden. Sie entsteht mit dem ersten Verkauf.'
                    : 'Keine Rechnung für diese Suche gefunden.'}
                </td>
              </tr>
            )}
            {gefiltert.map(rechnung => (
              <tr key={rechnung.id}>
                <td>{rechnung.number}</td>
                <td>{datum(rechnung.issued_on)}</td>
                <td>{rechnung.customer.name}</td>
                {istFuehrung && <td>{rechnung.issuer.name}</td>}
                <td>{rechnung.payment_method_label || 'Noch offen'}</td>
                <td>{money(rechnung.total_cents)}</td>
                <td className="invoice-actions">
                  <button type="button" onClick={() => setOffen(rechnung)}>
                    <FileText size={16}/> Öffnen
                  </button>
                  <button type="button" onClick={() => pdfLaden(rechnung)}>
                    <Download size={16}/> PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>}

    {offen && <Modal title={`Rechnung ${offen.number}`} onClose={() => setOffen(null)} closeDisabled={busy}>
      <div className="invoice-detail">
        <div className="invoice-detail-head">
          <div>
            <strong>{offen.issuer.name}</strong>
            {offen.issuer.street && <span>{offen.issuer.street}</span>}
            {(offen.issuer.postal_code || offen.issuer.city) && (
              <span>{[offen.issuer.postal_code, offen.issuer.city].filter(Boolean).join(' ')}</span>
            )}
            {offen.issuer.phone && <span>Mobil: {offen.issuer.phone}</span>}
          </div>
          <dl>
            <div><dt>Rechnungsnummer</dt><dd>{offen.number}</dd></div>
            <div><dt>Rechnungsdatum</dt><dd>{datum(offen.issued_on)}</dd></div>
            <div><dt>Leistungsdatum</dt><dd>{datum(offen.service_on)}</dd></div>
            <div><dt>Berater</dt><dd>{offen.issuer.name}</dd></div>
          </dl>
        </div>

        <div className="invoice-detail-customer">
          <h3>Kundendaten</h3>
          <div>
            <span><small>Kunde / Firma</small><strong>{offen.customer.name}</strong></span>
            <span><small>PLZ / Ort</small><strong>{[offen.customer.postal_code, offen.customer.city].filter(Boolean).join(' ') || '–'}</strong></span>
            <span><small>Straße / Hausnummer</small><strong>{offen.customer.street || '–'}</strong></span>
            <span><small>Telefon</small><strong>{offen.customer.phone || '–'}</strong></span>
            <span><small>Ansprechpartner</small><strong>{offen.customer.contact || '–'}</strong></span>
            <span><small>E-Mail</small><strong>{offen.customer.email || '–'}</strong></span>
          </div>
        </div>

        <table className="invoice-detail-items">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Artikel / Leistung</th>
              <th>Menge</th>
              <th>Einzelpreis</th>
              <th>MwSt.</th>
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {offen.items.map(item => (
              <tr key={item.id}>
                <td>{item.position}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{money(item.unit_price_cents)}</td>
                <td>{item.vat_percent} %</td>
                <td>{money(item.total_cents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th colSpan={5}>Zwischensumme</th><td>{money(offen.subtotal_cents)}</td></tr>
            <tr><th colSpan={5}>MwSt.</th><td>{money(offen.vat_cents)}</td></tr>
            <tr className="invoice-detail-total"><th colSpan={5}>Gesamtbetrag</th><td>{money(offen.total_cents)}</td></tr>
          </tfoot>
        </table>

        <div className="form-grid">
          <label>Zahlungsart
            <select
              value={offen.payment_method || ''}
              disabled={busy}
              onChange={event => speichern(offen, {payment_method: event.target.value || null})}
            >
              {ZAHLUNGSARTEN.map(art => <option key={art.value} value={art.value}>{art.label}</option>)}
            </select>
          </label>
          <label>Ansprechpartner
            <input
              defaultValue={offen.customer.contact || ''}
              disabled={busy}
              onBlur={event => {
                if (event.target.value !== (offen.customer.contact || '')) {
                  speichern(offen, {customer_contact: event.target.value})
                }
              }}
            />
          </label>
          <label className="span-2">Bemerkungen
            <textarea
              rows={3}
              defaultValue={offen.notes || ''}
              disabled={busy}
              onBlur={event => {
                if (event.target.value !== (offen.notes || '')) {
                  speichern(offen, {notes: event.target.value})
                }
              }}
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => setOffen(null)} disabled={busy}>Schließen</button>
          <button type="button" className="primary" onClick={() => pdfLaden(offen)}>
            <Download size={16}/> PDF herunterladen
          </button>
        </div>
      </div>
    </Modal>}
  </div>
}
