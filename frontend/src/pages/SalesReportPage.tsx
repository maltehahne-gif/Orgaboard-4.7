import {useEffect, useMemo, useRef, useState} from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import {Ban, Download, Search, X} from 'lucide-react'
import {api, formatDateTime, money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {LoadError} from '../components/LoadError'
import type {Sale} from '../types'

type ReportEmployee = {id:string; display_name:string}

const CHANNEL_LABELS: Record<string, string> = {
  field: 'Außendienst',
  promotion: 'Promotion',
  k70: 'K70',
  other: 'Sonstiges',
}

type ReportRow = {
  saleId:string
  itemId:string
  customer:string
  product:string
  quantity:number
  unitPriceCents:number
  totalCents:number
  soldAt:string
  channel:string
  employeeId:string
  employeeName:string
  cancelled:boolean
  cancellationReason:string|null
}

export default function SalesReportPage(){
  const {me} = useAuth()
  const isTeamLeader = darfVerwalten(me?.role)

  const [sales, setSales] = useState<Sale[]>([])
  const [employees, setEmployees] = useState<ReportEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [showCancelled, setShowCancelled] = useState(true)

  const sheetRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  async function load(){
    setLoading(true)
    setError('')
    try {
      // Dieselbe Berechtigungs-/Scope-Regel wie bei /verkaeufe: das Backend
      // (scoped_employee_id) liefert einem Mitarbeiter ausschließlich die
      // eigenen Verkäufe, einer Führungsrolle wahlweise alle oder - über den
      // Mitarbeiterfilter unten - die eines einzelnen Mitarbeiters.
      const salesData = await api<Sale[]>('/sales')
      setSales(salesData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Die Verkaufsdaten sind gerade nicht erreichbar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!isTeamLeader) { setEmployees([]); return }
    api<ReportEmployee[]>('/team/employees').then(setEmployees).catch(() => setEmployees([]))
  }, [isTeamLeader])

  function employeeName(id:string){
    if (me?.employee?.id === id) return me.full_name
    return employees.find(e => e.id === id)?.display_name || '—'
  }

  const rows = useMemo<ReportRow[]>(() => {
    const out: ReportRow[] = []
    for (const sale of sales as any[]) {
      for (const item of sale.items || []) {
        out.push({
          saleId: sale.id,
          itemId: item.id || `${sale.id}-${item.product_id}`,
          customer: sale.customer_name || 'Unbekannt',
          product: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unit_price_cents,
          totalCents: item.quantity * item.unit_price_cents,
          soldAt: sale.sold_at,
          channel: sale.channel,
          employeeId: sale.employee_id,
          employeeName: employeeName(sale.employee_id),
          cancelled: sale.cancelled,
          cancellationReason: sale.cancellation_reason,
        })
      }
    }
    return out
  // employeeName liest employees/me - beide gehören als Abhängigkeit dazu,
  // sonst zeigt eine gerade erst geladene Mitarbeiterliste noch "—".
  }, [sales, employees, me])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const now = new Date()
    let periodStart: Date | null = null
    let periodEnd: Date | null = null

    if (period === 'today') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      periodEnd = new Date(periodStart)
      periodEnd.setDate(periodEnd.getDate() + 1)
    }
    if (period === 'week') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekday = (periodStart.getDay() + 6) % 7
      periodStart.setDate(periodStart.getDate() - weekday)
      periodEnd = new Date(periodStart)
      periodEnd.setDate(periodEnd.getDate() + 7)
    }
    if (period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }
    if (period === 'custom' && from) periodStart = new Date(`${from}T00:00:00`)
    if (period === 'custom' && to) {
      periodEnd = new Date(`${to}T00:00:00`)
      periodEnd.setDate(periodEnd.getDate() + 1)
    }

    return rows.filter(row => {
      if (!showCancelled && row.cancelled) return false
      const soldAt = new Date(row.soldAt)
      if (periodStart && soldAt < periodStart) return false
      if (periodEnd && soldAt >= periodEnd) return false
      if (isTeamLeader && employeeFilter && row.employeeId !== employeeFilter) return false
      if (channelFilter && row.channel !== channelFilter) return false
      if (query) {
        const text = [row.customer, row.product, row.employeeName, CHANNEL_LABELS[row.channel] || row.channel]
          .filter(Boolean).join(' ').toLowerCase()
        if (!text.includes(query)) return false
      }
      return true
    })
  }, [rows, search, period, from, to, employeeFilter, channelFilter, showCancelled, isTeamLeader])

  function resetFilters(){
    setSearch('')
    setPeriod('all')
    setFrom('')
    setTo('')
    setEmployeeFilter('')
    setChannelFilter('')
    setShowCancelled(true)
  }

  const totalRevenueCents = useMemo(
    () => filteredRows.filter(r => !r.cancelled).reduce((sum, r) => sum + r.totalCents, 0),
    [filteredRows],
  )

  async function exportPdf(){
    if (!sheetRef.current) return
    setPdfBusy(true)
    try {
      // Screenshot exakt der gerade sichtbaren, gefilterten Tabelle - keine
      // separate Datenquelle, die von der Anzeige abweichen könnte.
      const canvas = await html2canvas(sheetRef.current, {scale: 2, useCORS: true, backgroundColor: '#ffffff'})
      const pdf = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'})
      const img = canvas.toDataURL('image/png')
      const width = pdf.internal.pageSize.getWidth()
      const height = (canvas.height * width) / canvas.width
      pdf.addImage(img, 'PNG', 10, 10, width - 20, height)
      const date = new Date().toLocaleDateString('de-DE').replace(/\./g, '-')
      pdf.save(`Verkaufstabelle_${date}.pdf`)
    } catch (err) {
      console.error(err)
      setError('Die PDF-Datei konnte nicht erstellt werden.')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) return <div className="loading">Verkaufstabelle wird geladen…</div>

  return (
    <div className="page sales-report-page">
      <div className="page-head">
        <div>
          <h1>Verkaufstabelle</h1>
          <p>Alle Verkaufspositionen aus /verkaeufe - mit denselben Berechtigungen und Filtern.</p>
        </div>
        <div className="page-head-actions">
          <button type="button" disabled={pdfBusy || filteredRows.length === 0} onClick={exportPdf}>
            <Download size={18} />
            {pdfBusy ? 'PDF wird erstellt…' : 'PDF exportieren'}
          </button>
        </div>
      </div>

      {error && <LoadError meldung={error} onRetry={load} />}

      {!error && (
        <>
          <section className="sales-filter-panel card">
            <div className="sales-filter-search">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen – Kunde, Produkt, Mitarbeiter …"
              />
            </div>

            <label>
              Zeitraum
              <select value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="all">Alle</option>
                <option value="today">Heute</option>
                <option value="week">Diese Woche</option>
                <option value="month">Dieser Monat</option>
                <option value="custom">Eigener Zeitraum</option>
              </select>
            </label>

            {period === 'custom' && (
              <>
                <label>
                  Von
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                </label>
                <label>
                  Bis
                  <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
                </label>
              </>
            )}

            {isTeamLeader && (
              <label>
                Mitarbeiter
                <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
                  <option value="">Alle Mitarbeiter</option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>{employee.display_name}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Verkaufskanal
              <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
                <option value="">Alle Kanäle</option>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="sales-report-cancelled-toggle">
              <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
              Stornierte anzeigen
            </label>

            <button type="button" className="sales-filter-reset" onClick={resetFilters}>
              <X size={16} />
              Filter zurücksetzen
            </button>

            <div className="sales-filter-result">
              <strong>{filteredRows.length}</strong> {filteredRows.length === 1 ? 'Position' : 'Positionen'}
              {' · '}
              <strong>{money(totalRevenueCents)}</strong> Umsatz
            </div>
          </section>

          <div className="table-card" ref={sheetRef}>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Kunde</th>
                  <th>Produkt</th>
                  <th>Menge</th>
                  <th>Einzelpreis</th>
                  <th>Gesamtumsatz</th>
                  <th>Verkaufskanal</th>
                  {isTeamLeader && <th>Mitarbeiter</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={isTeamLeader ? 9 : 8} className="empty">
                      {sales.length === 0
                        ? 'Noch keine Verkäufe erfasst.'
                        : 'Keine Verkäufe für diese Auswahl gefunden.'}
                    </td>
                  </tr>
                )}
                {filteredRows.map(row => (
                  <tr key={row.itemId} className={row.cancelled ? 'is-cancelled' : undefined}>
                    <td>{formatDateTime(row.soldAt)}</td>
                    <td>{row.customer}</td>
                    <td>{row.product}</td>
                    <td>{row.quantity}</td>
                    <td>{money(row.unitPriceCents)}</td>
                    <td>{money(row.totalCents)}</td>
                    <td>{CHANNEL_LABELS[row.channel] || row.channel}</td>
                    {isTeamLeader && <td>{row.employeeName}</td>}
                    <td>
                      {row.cancelled ? (
                        <span className="sale-cancelled-flag" title={row.cancellationReason || 'Ohne Angabe eines Grundes'}>
                          <Ban size={14} /> Storniert
                        </span>
                      ) : (
                        'Aktiv'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
