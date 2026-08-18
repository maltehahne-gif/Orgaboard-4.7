import {DashboardInsights} from '../components/DashboardInsights'
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ContactRound,
  FileText,
  Package,
  Route as RouteIcon,
  ShoppingCart,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {api, formatDateTime, money} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import type {Appointment, Customer, Product, Sale} from '../types'
import {AppointmentWeek} from '../components/AppointmentWeek'
import {AppointmentModal} from '../components/AppointmentModal'
import {LineChart, Sparkline} from '../components/Charts'
import {addDays, appointmentPayload, appointmentTypeOption, downloadCalendarFile, startOfWorkWeek, type AppointmentDraft} from '../lib/appointments'
import {useToast} from '../components/Toast'

type RentalRow = {id: string; product_id: string; due_at: string | null; status: string}
type MessageRow = {id: string; sender_name: string; body: string; created_at: string; is_read?: boolean}

type Dash = {
  revenue_today_cents: number
  revenue_week_cents: number
  revenue_month_cents: number
  k70_revenue_today_cents: number
  k70_revenue_week_cents: number
  k70_revenue_month_cents: number
  units_week: number
  units_month: number
  units_target: number
  units_missing: number
  units_percent: number
  next_appointment: Appointment | null
  today_appointments: Appointment[]
  active_rentals: number
  rentals: RentalRow[]
  unread_messages: number
}

type TeamEmployee = {id: string; display_name: string}
type Editor = {appointment?: Appointment; initialDay?: Date}

const weekFormatter = new Intl.DateTimeFormat('de-DE', {day: '2-digit', month: 'short'})
const timeFormatter = new Intl.DateTimeFormat('de-DE', {hour: '2-digit', minute: '2-digit'})
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function greeting() {
  const hour = new Date().getHours()
  if (hour < 11) return 'Guten Morgen'
  if (hour < 18) return 'Guten Tag'
  return 'Guten Abend'
}

function relativeTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Minute${minutes === 1 ? '' : 'n'}`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `vor ${hours} Stunde${hours === 1 ? '' : 'n'}`
  const days = Math.round(hours / 24)
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`
}

function initials(name: string) {
  return name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Kurzform für die Achse: 128.450,00 € -> "128k €". */
function compactEuro(cents: number) {
  const euro = cents / 100
  if (euro >= 1000) return `${Math.round(euro / 1000)}k €`
  return `${Math.round(euro)} €`
}

/** Tagesindex innerhalb einer Woche, die montags beginnt. */
function dayIndex(weekStart: Date, value: string) {
  const day = new Date(value)
  day.setHours(0, 0, 0, 0)
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  return Math.floor((day.getTime() - start.getTime()) / 86400000)
}

/** Zählt Einträge auf die sieben Tage einer Woche. */
function weekSeries<T>(rows: T[], weekStart: Date, date: (row: T) => string, value: (row: T) => number) {
  const series = Array<number>(7).fill(0)
  for (const row of rows) {
    const index = dayIndex(weekStart, date(row))
    if (index >= 0 && index < 7) series[index] += value(row)
  }
  return series
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function Delta({percent}: {percent: number | null}) {
  if (percent === null) {
    return <span className="dash-kpi-delta neutral">kein Vorwochenwert</span>
  }
  const up = percent >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`dash-kpi-delta ${up ? 'up' : 'down'}`}>
      <Icon size={13} strokeWidth={2.4} />
      {up ? '+' : ''}
      {percent.toLocaleString('de-DE')}%
      <em>vs. letzte Woche</em>
    </span>
  )
}

type KpiProps = {
  label: string
  value: string
  icon: ReactNode
  percent: number | null
  series: number[]
  /** Wohin die Karte führt. */
  to: string
  /** Was einen dort erwartet - für die Vorlesehilfe. */
  ziel: string
}

/**
 * Kennzahlenkarte.
 *
 * Die ganze Karte ist ein Link, nicht nur eine Zeile am Fuß: Wer eine Zahl
 * sieht, die ihn stutzig macht, will die dahinterliegende Liste sehen. Ein
 * Link statt onClick, damit Mittelklick und "in neuem Tab öffnen"
 * funktionieren.
 */
function Kpi({label, value, icon, percent, series, to, ziel}: KpiProps) {
  return (
    <Link to={to} className="dash-kpi dashboard-link-card" aria-label={`${label}: ${value}. ${ziel}`}>
      <header>
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-kpi-icon">{icon}</span>
      </header>
      <strong className="dash-kpi-value">{value}</strong>
      <Delta percent={percent} />
      <Sparkline values={series} />
    </Link>
  )
}

export function DashboardPage() {
  const {me} = useAuth()
  const navigate = useNavigate()

  const toast = useToast()
  const [dashboard, setDashboard] = useState<Dash | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  // Nur für den Vorwochenvergleich der Kennzahl - der Wochenplaner darunter
  // bekommt weiterhin ausschliesslich die Termine der angezeigten Woche.
  const [previousAppointments, setPreviousAppointments] = useState<Appointment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [employees, setEmployees] = useState<TeamEmployee[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWorkWeek())
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  const isTeamLeader = darfVerwalten(me?.role)

  const load = useCallback(async () => {
    const range = (from: Date) =>
      `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(addDays(from, 7).toISOString())}`
    try {
      const [dash, appointmentRows, previousRows, customerRows, productRows, employeeRows, saleRows, messageRows] =
        await Promise.all([
          api<Dash>('/dashboard'),
          api<Appointment[]>(`/appointments${range(weekStart)}`),
          api<Appointment[]>(`/appointments${range(addDays(weekStart, -7))}`),
          api<Customer[]>('/customers'),
          api<Product[]>('/products'),
          isTeamLeader ? api<TeamEmployee[]>('/team/employees') : Promise.resolve([]),
          api<Sale[]>('/sales'),
          api<MessageRow[]>('/messages'),
        ])
      setDashboard(dash)
      setAppointments(appointmentRows)
      setPreviousAppointments(previousRows)
      setCustomers(customerRows)
      setProducts(productRows)
      setEmployees(employeeRows)
      setSales(saleRows)
      setMessages(messageRows)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Dashboard konnte nicht geladen werden', 'error')
    }
  }, [isTeamLeader, toast, weekStart])

  useEffect(() => {
    load()
    return connectRealtime(() => load())
  }, [load])

  async function save(form: AppointmentDraft) {
    setSaving(true)
    try {
      const appointment = editor?.appointment
      const saved = await api<Appointment>(
        appointment ? `/appointments/${appointment.id}` : '/appointments',
        {method: appointment ? 'PUT' : 'POST', body: JSON.stringify(appointmentPayload(form))},
      )
      setEditor(null)
      await load()
      toast(appointment ? 'Termin aktualisiert' : 'Termin gespeichert')
      if (form.add_to_calendar) downloadCalendarFile(saved, form.reminder_minutes)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Termin konnte nicht gespeichert werden', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleCompleted(appointment: Appointment) {
    const status = appointment.status === 'completed' ? 'planned' : 'completed'
    try {
      await api(`/appointments/${appointment.id}/status`, {method: 'PATCH', body: JSON.stringify({status})})
      await load()
      toast(status === 'completed' ? 'Termin als erledigt markiert' : 'Termin wieder geöffnet')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Status konnte nicht geändert werden', 'error')
    }
  }

  async function remove(appointment: Appointment, confirmed = false) {
    if (!confirmed && !window.confirm(`Termin „${appointment.customer_name || 'Termin'}“ wirklich löschen?`)) return
    setSaving(true)
    try {
      await api(`/appointments/${appointment.id}`, {method: 'DELETE'})
      setEditor(null)
      await load()
      toast('Termin gelöscht')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Termin konnte nicht gelöscht werden', 'error')
    } finally {
      setSaving(false)
    }
  }

  const productName = useCallback(
    (productId: string) => products.find(p => p.id === productId)?.name ?? 'Produkt',
    [products],
  )

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    return `${weekFormatter.format(weekStart)} – ${weekFormatter.format(end)}`
  }, [weekStart])

  /** Alle vier Kennzahlen samt Tagesreihe und Vorwochenvergleich. */
  const kpis = useMemo(() => {
    const previousStart = addDays(weekStart, -7)
    const activeSales = sales.filter(sale => !sale.cancelled)
    const newCustomers = customers.filter(customer => customer.created_at)

    const revenue = weekSeries(activeSales, weekStart, s => s.sold_at, s => s.counts_total_cents)
    const revenuePrev = weekSeries(activeSales, previousStart, s => s.sold_at, s => s.counts_total_cents)
    const deals = weekSeries(activeSales, weekStart, s => s.sold_at, () => 1)
    const dealsPrev = weekSeries(activeSales, previousStart, s => s.sold_at, () => 1)
    const fresh = weekSeries(newCustomers, weekStart, c => c.created_at!, () => 1)
    const freshPrev = weekSeries(newCustomers, previousStart, c => c.created_at!, () => 1)
    const dates = weekSeries(appointments, weekStart, a => a.start_at, () => 1)
    const datesPrev = weekSeries(previousAppointments, previousStart, a => a.start_at, () => 1)

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

    return {
      revenue,
      revenueTotal: sum(revenue),
      revenueChange: changePercent(sum(revenue), sum(revenuePrev)),
      deals,
      dealsTotal: sum(deals),
      dealsChange: changePercent(sum(deals), sum(dealsPrev)),
      fresh,
      freshTotal: sum(fresh),
      freshChange: changePercent(sum(fresh), sum(freshPrev)),
      dates,
      datesTotal: sum(dates),
      datesChange: changePercent(sum(dates), sum(datesPrev)),
    }
  }, [appointments, customers, previousAppointments, sales, weekStart])

  const topCustomers = useMemo(() => {
    const totals = new Map<string, {name: string; cents: number; deals: number}>()
    for (const sale of sales) {
      if (sale.cancelled) continue
      const entry = totals.get(sale.customer_id) ?? {name: sale.customer_name, cents: 0, deals: 0}
      entry.cents += sale.counts_total_cents
      entry.deals += 1
      totals.set(sale.customer_id, entry)
    }
    return [...totals.entries()]
      .map(([customerId, value]) => ({customerId, ...value}))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 3)
  }, [sales])

  if (!dashboard) return <div className="loading">Dashboard wird geladen…</div>

  const firstName = me?.full_name?.split(' ')[0]
  const today = dashboard.today_appointments

  return (
    <div className="dash">
      {/* ---------- Seitenkopf ---------- */}
      <header className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            {greeting()}, {firstName}! Hier ist dein Überblick für heute.
          </p>
        </div>
        <div className="dash-head-tools">
          <button type="button" className="dash-pill" onClick={() => setWeekStart(startOfWorkWeek())}>
            Diese Woche
            <ChevronDown size={14} strokeWidth={2.2} />
          </button>
          <Link to="/termine" className="dash-pill-icon" aria-label="Zum Terminkalender">
            <CalendarDays size={16} strokeWidth={1.9} />
          </Link>
        </div>
      </header>

      {/* ---------- Reihe 1: vier Kennzahlen mit Verlaufskurve ---------- */}
      <div className="dash-row dash-row-kpi">
        <Kpi
          label="Umsatz (Woche)"
          value={money(kpis.revenueTotal)}
          icon={<TrendingUp size={16} strokeWidth={2} />}
          percent={kpis.revenueChange}
          series={kpis.revenue}
          to="/verkaeufe"
          ziel="Zu den Verkäufen"
        />
        <Kpi
          label="Abgeschlossene Verkäufe"
          value={String(kpis.dealsTotal)}
          icon={<ShoppingCart size={16} strokeWidth={2} />}
          percent={kpis.dealsChange}
          series={kpis.deals}
          to="/verkaeufe"
          ziel="Zu den Verkäufen"
        />
        <Kpi
          label="Neukunden"
          value={String(kpis.freshTotal)}
          icon={<UserPlus size={16} strokeWidth={2} />}
          percent={kpis.freshChange}
          series={kpis.fresh}
          to="/kunden"
          ziel="Zu den Kunden"
        />
        <Kpi
          label="Termine (Woche)"
          value={String(kpis.datesTotal)}
          icon={<CalendarRange size={16} strokeWidth={2} />}
          percent={kpis.datesChange}
          series={kpis.dates}
          to="/termine"
          ziel="Zu den Terminen"
        />
      </div>

      {/* ---------- Reihe 2: vier Karten ---------- */}
      <div className="dash-row dash-row-four">
        <section className="dash-card">
          <h2 className="dash-card-title">Heute – Termine</h2>

          <div className="dash-card-body">
            {today.length === 0 && <p className="dash-empty">Heute keine Termine geplant</p>}
            <ol className="agenda">
              {today.slice(0, 4).map((item, index) => {
                const type = appointmentTypeOption(item.appointment_type)
                return (
                  <li className={index === 0 ? 'agenda-row is-next' : 'agenda-row'} key={item.id}>
                    <span className="agenda-time">
                      <b>{timeFormatter.format(new Date(item.start_at))}</b>
                      {item.end_at && <i>{timeFormatter.format(new Date(item.end_at))}</i>}
                    </span>
                    <span className="agenda-rail">
                      <i className="agenda-dot" style={{background: type.color}} />
                    </span>
                    <button type="button" className="agenda-body" onClick={() => setEditor({appointment: item})}>
                      <b>{type.label}</b>
                      <span>{item.customer_name || 'Termin'}</span>
                      <i>{item.notes || item.address || 'Kein Ort hinterlegt'}</i>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          <Link to="/termine" className="dash-card-action">
            Alle Termine anzeigen
          </Link>
        </section>

        <section className="dash-card">
          <h2 className="dash-card-title">Schnellzugriff</h2>
          <div className="dash-card-body">
            <div className="quick">
              <button type="button" onClick={() => setEditor({initialDay: new Date()})}>
                <span><CalendarDays size={18} strokeWidth={1.9} /></span>
                Neuer Termin
              </button>
              <button type="button" onClick={() => navigate('/kunden', {state: {openCreate: true}})}>
                <span><ContactRound size={18} strokeWidth={1.9} /></span>
                Neuer Kunde
              </button>
              <button type="button" onClick={() => navigate('/nachfassen')}>
                <span><AlarmClock size={18} strokeWidth={1.9} /></span>
                Nachfassen
              </button>
              <button type="button" onClick={() => navigate('/routenplanung')}>
                <span><RouteIcon size={18} strokeWidth={1.9} /></span>
                Route planen
              </button>
              <button type="button" onClick={() => navigate('/verkaeufe', {state: {openCreate: true}})}>
                <span><FileText size={18} strokeWidth={1.9} /></span>
                Neuer Verkauf
              </button>
              <button type="button" onClick={() => navigate('/verkaufstabelle')}>
                <span><BarChart3 size={18} strokeWidth={1.9} /></span>
                Bericht öffnen
              </button>
            </div>
          </div>
        </section>

        <section className="dash-card">
          <h2 className="dash-card-title">Top Kunden</h2>
          <div className="dash-card-body">
            {topCustomers.length === 0 && <p className="dash-empty">Noch keine Verkäufe erfasst</p>}
            <ul className="people">
              {topCustomers.map((entry, index) => (
                <li key={entry.customerId}>
                  <Link to={`/kunden/${entry.customerId}`}>
                    <span className="people-avatar">{initials(entry.name)}</span>
                    <span className="people-main">
                      <b>{entry.name}</b>
                      <i>Umsatz: {money(entry.cents)}</i>
                    </span>
                    <span className="people-rank" title={`${entry.deals} Verkäufe`}>
                      {index + 1}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link to="/kunden" className="dash-card-link">
            Alle Kunden anzeigen
          </Link>
        </section>

        <section className="dash-card">
          <h2 className="dash-card-title">Nachrichten</h2>
          <div className="dash-card-body">
            {messages.length === 0 && <p className="dash-empty">Noch keine Nachrichten</p>}
            <ul className="people">
              {messages.slice(0, 3).map(item => (
                <li key={item.id}>
                  <Link to="/nachrichten">
                    <span className="people-avatar">{initials(item.sender_name)}</span>
                    <span className="people-main">
                      <b>{item.sender_name}</b>
                      <i>{item.body}</i>
                      <em>{relativeTime(item.created_at)}</em>
                    </span>
                    {item.is_read === false && <span className="people-unread" aria-label="ungelesen" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link to="/nachrichten" className="dash-card-action">
            Alle Nachrichten anzeigen
          </Link>
        </section>
      </div>

      {/* ---------- Reihe 3: Route und Umsatzverlauf ---------- */}
      <div className="dash-row dash-row-split">
        <section className="dash-card">
          <h2 className="dash-card-title">Routenplanung – Heute</h2>
          <div className="dash-card-body route">
            <div className="route-map" aria-hidden="true">
              <svg viewBox="0 0 260 140" preserveAspectRatio="none">
                <path className="route-line" d="M28 108 C60 60, 84 56, 108 74 S158 108, 182 72 S222 34, 236 40" />
              </svg>
              <span className="route-stop" style={{left: '10.8%', top: '77%'}} />
              <span className="route-stop" style={{left: '41.5%', top: '53%'}} />
              <span className="route-stop" style={{left: '70%', top: '51%'}} />
              <span className="route-stop" style={{left: '90.8%', top: '28.5%'}} />
            </div>

            <div className="route-stats">
              <div>
                <b>{today.length}</b>
                <i>Stopps</i>
              </div>
              <div>
                <b>–</b>
                <i>Gesamtdistanz</i>
              </div>
              <div>
                <b>–</b>
                <i>Fahrzeit</i>
              </div>
              <Link to="/routenplanung" className="route-button">
                Route anzeigen
              </Link>
            </div>
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-head">
            <h2 className="dash-card-title">Verkäufe – Umsatzentwicklung</h2>
            <span className="dash-pill is-static">
              {weekLabel}
              <ChevronDown size={14} strokeWidth={2.2} />
            </span>
          </div>
          <div className="dash-card-body">
            <LineChart
              values={kpis.revenue}
              labels={WEEKDAYS}
              formatTick={compactEuro}
              formatPoint={(value, label) => `${label}: ${money(value)}`}
            />
          </div>
          <Link to="/verkaeufe" className="dash-card-action">
            Alle Verkäufe
          </Link>
        </section>
      </div>

      {/* ---------- Wochenplaner und Auswertungen ---------- */}
      <div className="dash-section-head">
        <CalendarRange size={18} />
        <div>
          <h2>Wochenplaner</h2>
          <p>Termine der Woche planen, bestätigen und dokumentieren.</p>
        </div>
      </div>

      <AppointmentWeek
        weekStart={weekStart}
        appointments={appointments}
        onShiftWeek={days => setWeekStart(current => addDays(current, days))}
        onToday={() => setWeekStart(startOfWorkWeek())}
        onCreate={day => setEditor({initialDay: day})}
        onEdit={appointment => setEditor({appointment})}
        onToggleCompleted={toggleCompleted}
        onDelete={appointment => remove(appointment, true)}
      />

      <div className="dash-row dash-row-two">
        <section className="dash-card">
          <h2 className="dash-card-title">K70-Material</h2>
          <div className="dash-card-body">
            <div className="k70">
              <div>
                <i>Heute</i>
                <b>{money(dashboard.k70_revenue_today_cents)}</b>
              </div>
              <div>
                <i>Woche</i>
                <b>{money(dashboard.k70_revenue_week_cents)}</b>
              </div>
              <div>
                <i>Monat</i>
                <b>{money(dashboard.k70_revenue_month_cents)}</b>
              </div>
            </div>
          </div>
        </section>

        <section className="dash-card">
          <div className="dash-card-head">
            <h2 className="dash-card-title">Ausleihen</h2>
            <Link to="/verleih" className="dash-card-link is-inline">
              Alle anzeigen
            </Link>
          </div>
          <div className="dash-card-body">
            {dashboard.rentals.length === 0 && <p className="dash-empty">Keine aktiven Ausleihen</p>}
            <ul className="rentals">
              {dashboard.rentals.slice(0, 4).map(rental => (
                <li key={rental.id}>
                  <span>
                    <Package size={14} />
                    {productName(rental.product_id)}
                  </span>
                  <span className={rental.status === 'due' ? 'rental-flag overdue' : 'rental-flag soon'}>
                    {rental.due_at ? `bis ${formatDateTime(rental.due_at)}` : rental.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <DashboardInsights />

      {editor && (
        <AppointmentModal
          appointment={editor.appointment}
          initialDay={editor.initialDay}
          ownEmployeeId={me?.employee?.id}
          isTeamLeader={isTeamLeader}
          customers={customers}
          products={products}
          employees={employees}
          saving={saving}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={editor.appointment ? () => remove(editor.appointment!, true) : undefined}
        />
      )}
    </div>
  )
}
