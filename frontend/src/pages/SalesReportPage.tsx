import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import {ChevronLeft, ChevronRight, Download, Loader2} from 'lucide-react'
import {api, money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {ausIso, montagIso} from '../lib/datum'
import {LoadError} from '../components/LoadError'

type ReportEmployee = {id:string; display_name:string}

type Spalte = {key:string; label:string}

type Zeile = {
  sale_id:string
  time:string
  customer_name:string
  customer_address:string
  contact_way:string|null
  is_customer:boolean
  is_target_customer:boolean
  area:'field'|'white'
  profi:string|null
  trade_in:boolean
  products:Record<string,{sold:number; presented:boolean}>
  units:number
  product_revenue_cents:number
  k70_revenue_cents:number
  cancelled:boolean
}

type Summe = {
  units:number
  product_revenue_cents:number
  k70_revenue_cents:number
  products:Record<string,number>
}

type Tag = {date:string; weekday:string; rows:Zeile[]; totals:Summe}

type Wochenblatt = {
  employee:{id:string; name:string}
  week_start:string
  week_end:string
  calendar_week:number
  days:Tag[]
  totals:Summe
  columns:{contact_ways:Spalte[]; profi:Spalte[]; products:Spalte[]}
}

/* Die Farbklassen der Vorlage. Sie stehen zentral in styles.css - hier
   steht nur, welche Spalte welche Klasse trägt. Eigene Farben kommen an
   keiner Stelle dazu. */
const KONTAKT_KLASSE: Record<string,string> = {
  promotion: 'sheet-contact-promotion',
  recommendation: 'sheet-contact-recommendation',
  premium: 'sheet-contact-premium',
  kd_daten: 'sheet-contact-ko',
  adm: 'sheet-contact-aom',
}

const PROFI_KLASSE: Record<string,string> = {
  job_ticket: '',
  recommendation: 'sheet-profi-recommendation',
  premium: 'sheet-profi-premium',
}

/** Leere Zeilen je Tag, damit jeder Wochentag wie auf dem Papier gleich
 *  hoch bleibt - auch an einem Tag ohne Verkauf. */
const ZEILEN_JE_TAG = 3

export default function SalesReportPage(){
  const {me} = useAuth()
  const isTeamLeader = darfVerwalten(me?.role)

  const [week, setWeek] = useState(montagIso())
  const [employee, setEmployee] = useState(me?.employee?.id || '')
  const [employees, setEmployees] = useState<ReportEmployee[]>([])
  const [blatt, setBlatt] = useState<Wochenblatt|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const sheetRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    if (!isTeamLeader) { setEmployees([]); return }
    api<ReportEmployee[]>('/team/employees')
      .then(rows => {
        setEmployees(rows)
        setEmployee(current => current || rows[0]?.id || '')
      })
      .catch(() => setEmployees([]))
  }, [isTeamLeader])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Dieselbe Berechtigungs-/Scope-Regel wie bei /verkaeufe: das Backend
      // (scoped_employee_id) liefert einem Mitarbeiter ausschließlich die
      // eigene Woche, einer Führungsrolle die des gewählten Mitarbeiters.
      const query = employee ? `&employee_id=${encodeURIComponent(employee)}` : ''
      setBlatt(await api<Wochenblatt>(`/sales/wochentabelle?week_start=${week}${query}`))
    } catch (err) {
      setBlatt(null)
      setError(err instanceof Error ? err.message : 'Die Verkaufsdaten sind gerade nicht erreichbar.')
    } finally {
      setLoading(false)
    }
  }, [week, employee])

  useEffect(() => { load() }, [load])

  function shift(days:number){
    const d = ausIso(week)
    d.setDate(d.getDate() + days)
    setWeek(montagIso(d))
  }

  const spalten = blatt?.columns
  const spaltenzahl = useMemo(() => {
    if (!spalten) return 0
    // Wochentag + Uhrzeit + Kunde + Kontaktwege + Zielkunde/Kunde
    // + Festgebiet/Weißgebiet + Profi + Altgeräte + Produkte
    // + Einheiten + zwei Umsätze
    return 3 + spalten.contact_ways.length + 2 + 2 + spalten.profi.length + 1
      + spalten.products.length + 3
  }, [spalten])

  async function exportPdf(){
    if (!sheetRef.current) return
    setPdfBusy(true)
    try {
      // Abbild genau des angezeigten Blattes - keine zweite Datenquelle,
      // die von der Anzeige abweichen könnte.
      const canvas = await html2canvas(sheetRef.current, {scale: 2, useCORS: true, backgroundColor: '#ffffff'})
      const pdf = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
      const img = canvas.toDataURL('image/png')
      const width = pdf.internal.pageSize.getWidth()
      const height = (canvas.height * width) / canvas.width
      pdf.addImage(img, 'PNG', 10, 10, width - 20, height)
      pdf.save(`Verkaufstabelle_KW${blatt?.calendar_week ?? ''}.pdf`)
    } catch (err) {
      console.error(err)
      setError('Die PDF-Datei konnte nicht erstellt werden.')
    } finally {
      setPdfBusy(false)
    }
  }

  const hatZeilen = (blatt?.days || []).some(tag => tag.rows.length > 0)

  return (
    <div className="page sales-report-page">
      <div className="page-head sales-report-page-head">
        <div>
          <h1>Verkaufstabelle</h1>
          <p>Wochenblatt nach der Papiervorlage – mit denselben Berechtigungen wie die Verkaufsliste.</p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="primary" disabled={pdfBusy || !hatZeilen} onClick={exportPdf}>
            {pdfBusy ? <Loader2 size={18} className="sales-report-spin"/> : <Download size={18}/>}
            {pdfBusy ? 'PDF wird erstellt…' : 'PDF exportieren'}
          </button>
        </div>
      </div>

      <div className="sales-report-toolbar">
        <div className="sales-report-week-nav">
          <button type="button" onClick={() => shift(-7)} aria-label="Vorherige Woche"><ChevronLeft size={18}/></button>
          <div>
            <small>Kalenderwoche</small>
            <strong>
              {blatt
                ? `KW ${blatt.calendar_week} · ${ausIso(blatt.week_start).toLocaleDateString('de-DE')} – ${ausIso(blatt.week_end).toLocaleDateString('de-DE')}`
                : '–'}
            </strong>
          </div>
          <button type="button" onClick={() => shift(7)} aria-label="Nächste Woche"><ChevronRight size={18}/></button>
        </div>

        {isTeamLeader && (
          <label>
            Mitarbeiter
            <select value={employee} onChange={e => setEmployee(e.target.value)}>
              {employees.map(item => (
                <option key={item.id} value={item.id}>{item.display_name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <LoadError meldung={error} onRetry={load}/>}

      {!error && loading && <div className="sales-report-loading">Verkaufstabelle wird geladen…</div>}

      {!error && !loading && blatt && spalten && (
        <div className="sales-report-scroll">
          <div className="sales-week-sheet" ref={sheetRef}>

            <div className="sales-week-sheet-meta">
              <span>{blatt.employee.name}</span>
              <span>
                KW {blatt.calendar_week} · {ausIso(blatt.week_start).toLocaleDateString('de-DE')} – {ausIso(blatt.week_end).toLocaleDateString('de-DE')}
              </span>
            </div>

            <table className="sales-week-table">
              <colgroup>
                <col className="col-day"/>
                <col className="col-time"/>
                <col className="col-customer"/>
                {spalten.contact_ways.map(s => <col className="col-mark" key={`c-${s.key}`}/>)}
                <col className="col-mark"/>
                <col className="col-mark"/>
                <col className="col-mark"/>
                <col className="col-mark"/>
                {spalten.profi.map(s => <col className="col-mark" key={`p-${s.key}`}/>)}
                <col className="col-mark"/>
                {spalten.products.map(s => <col className="col-product" key={`w-${s.key}`}/>)}
                <col className="col-units"/>
                <col className="col-revenue"/>
                <col className="col-revenue"/>
              </colgroup>

              <thead>
                <tr className="sales-sheet-group-row">
                  <th className="sales-sheet-logo-cell" rowSpan={2}>
                    <span className="sales-sheet-logo" aria-hidden="true"><i/><i/><i/><i/></span>
                  </th>
                  <th className="sales-sheet-main-head" rowSpan={2}>Uhrzeit</th>
                  <th className="sales-sheet-main-head" rowSpan={2}>Kunde, Anschrift</th>
                  <th colSpan={spalten.contact_ways.length}>Kontaktweg</th>
                  <th colSpan={2}>Kunde</th>
                  <th colSpan={2}>Gebiet</th>
                  <th colSpan={spalten.profi.length}>Profi</th>
                  <th colSpan={1}>Kunde</th>
                  <th colSpan={spalten.products.length}>Vorgeführt = X / Verkauft = Anzahl</th>
                  <th colSpan={3}>Einheiten und Umsätze</th>
                </tr>
                <tr className="sales-sheet-label-row">
                  {spalten.contact_ways.map(s => (
                    <th className="vertical" key={`ch-${s.key}`}><span>{s.label}</span></th>
                  ))}
                  <th className="vertical"><span>Zielkunde</span></th>
                  <th className="vertical"><span>Kunde</span></th>
                  <th className="vertical"><span>Festgebiet</span></th>
                  <th className="vertical"><span>Weißgebiet</span></th>
                  {spalten.profi.map(s => (
                    <th className="vertical" key={`ph-${s.key}`}><span>{s.label}</span></th>
                  ))}
                  <th className="vertical"><span>Altgeräte</span></th>
                  {spalten.products.map(s => (
                    <th className="vertical" key={`wh-${s.key}`}><span>{s.label}</span></th>
                  ))}
                  <th className="vertical"><span>Einh.</span></th>
                  <th className="vertical"><span>Umsatz Produkte</span></th>
                  <th className="vertical"><span>Umsatz K70</span></th>
                </tr>
              </thead>

              <tbody>
                {blatt.days.map(tag => {
                  const zeilen = tag.rows.length >= ZEILEN_JE_TAG
                    ? tag.rows
                    : [...tag.rows, ...Array.from({length: ZEILEN_JE_TAG - tag.rows.length}, () => null)]

                  return zeilen.map((zeile, index) => (
                    <tr
                      key={`${tag.date}-${zeile?.sale_id || `leer-${index}`}`}
                      className={index === zeilen.length - 1 ? 'sales-sheet-day-end' : undefined}
                    >
                      {index === 0 && (
                        <th className="sales-sheet-day" rowSpan={zeilen.length} scope="row">
                          {tag.weekday}
                        </th>
                      )}

                      <td className="sales-sheet-time">{zeile?.time || ''}</td>

                      <td className="sales-sheet-customer">
                        {zeile && <>
                          <strong>{zeile.customer_name}</strong>
                          {zeile.customer_address && <small>{zeile.customer_address}</small>}
                        </>}
                      </td>

                      {spalten.contact_ways.map(s => (
                        <td className={KONTAKT_KLASSE[s.key]} key={`c-${s.key}`}>
                          {zeile?.contact_way === s.key ? 'X' : ''}
                        </td>
                      ))}

                      <td>{zeile?.is_target_customer ? 'X' : ''}</td>
                      <td>{zeile?.is_customer ? 'X' : ''}</td>
                      <td>{zeile?.area === 'field' ? 'X' : ''}</td>
                      <td>{zeile?.area === 'white' ? 'X' : ''}</td>

                      {spalten.profi.map(s => (
                        <td className={PROFI_KLASSE[s.key]} key={`p-${s.key}`}>
                          {zeile?.profi === s.key ? 'X' : ''}
                        </td>
                      ))}

                      <td>{zeile?.trade_in ? 'X' : ''}</td>

                      {spalten.products.map(s => {
                        const zelle = zeile?.products?.[s.key]
                        return (
                          <td className="sales-sheet-product-cell" key={`w-${s.key}`}>
                            {zelle?.sold ? zelle.sold : zelle?.presented ? 'X' : ''}
                          </td>
                        )
                      })}

                      <td className="sales-sheet-number">{zeile?.units || ''}</td>
                      <td className="sales-sheet-money">{zeile ? money(zeile.product_revenue_cents) : ''}</td>
                      <td className="sales-sheet-money">{zeile ? money(zeile.k70_revenue_cents) : ''}</td>
                    </tr>
                  ))
                })}

                <tr className="sales-sheet-total-row">
                  <th scope="row" colSpan={3 + spalten.contact_ways.length + 4 + spalten.profi.length + 1}>Summe</th>
                  {spalten.products.map(s => (
                    <td className="sales-sheet-product-cell" key={`t-${s.key}`}>
                      {blatt.totals.products[s.key] || ''}
                    </td>
                  ))}
                  <td className="sales-sheet-number">{blatt.totals.units || ''}</td>
                  <td className="sales-sheet-money">{money(blatt.totals.product_revenue_cents)}</td>
                  <td className="sales-sheet-money sales-sheet-alt-total">{money(blatt.totals.k70_revenue_cents)}</td>
                </tr>

                {!hatZeilen && (
                  <tr>
                    <td className="empty" colSpan={spaltenzahl}>
                      In dieser Woche wurde noch kein Verkauf erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <p className="sales-sheet-footnote">
              Vorgeführt = X · Verkauft = Anzahl · Stornierte Verkäufe zählen in keiner Summe mit.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
