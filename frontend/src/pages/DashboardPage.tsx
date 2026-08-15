import {DashboardInsights} from '../components/DashboardInsights'
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  BadgeEuro,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ContactRound,
  Mail,
  Package,
  PackageCheck,
  Route as RouteIcon,
  ShoppingCart,
  Target,
} from 'lucide-react'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {api, formatDateTime, money} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {useAuth} from '../lib/auth'
import type {Appointment, Customer, Product, Sale} from '../types'
import {AppointmentWeek} from '../components/AppointmentWeek'
import {AppointmentModal} from '../components/AppointmentModal'
import {addDays, appointmentPayload, appointmentTypeOption, downloadCalendarFile, startOfWorkWeek, type AppointmentDraft} from '../lib/appointments'
import {useToast} from '../components/Toast'

type RentalRow = {id: string; product_id: string; due_at: string | null; status: string}
type MessageRow = {id: string; sender_name: string; body: string; created_at: string}

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

type WeekTrend = {revenue_change_percent: number | null}
type TeamEmployee = {id: string; display_name: string}
type Editor = {appointment?: Appointment; initialDay?: Date}

const weekFormatter = new Intl.DateTimeFormat('de-DE', {day: '2-digit', month: 'short'})
const timeFormatter = new Intl.DateTimeFormat('de-DE', {hour: '2-digit', minute: '2-digit'})

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

function Delta({percent}: {percent: number | null | undefined}) {
  if (percent === null || percent === undefined) return null
  const up = percent >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      <Icon size={13} />
      {up ? '+' : ''}
      {percent.toLocaleString('de-DE')}% vs. letzte Woche
    </span>
  )
}

export function DashboardPage() {
  const {me} = useAuth()
  const navigate = useNavigate()

  const toast = useToast()
  const [dashboard, setDashboard] = useState<Dash | null>(null)
  const [weekTrend, setWeekTrend] = useState<WeekTrend | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [employees, setEmployees] = useState<TeamEmployee[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfWorkWeek())
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  const isTeamLeader = me?.role === 'TEAM_LEADER'

  const load = useCallback(async () => {
    const end = addDays(weekStart, 7)
    const query = `?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    try {
      const [dash, appointmentRows, customerRows, productRows, employeeRows, trend, saleRows, messageRows] =
        await Promise.all([
          api<Dash>('/dashboard'),
          api<Appointment[]>(`/appointments${query}`),
          api<Customer[]>('/customers'),
          api<Product[]>('/products'),
          isTeamLeader ? api<TeamEmployee[]>('/team/employees') : Promise.resolve([]),
          api<WeekTrend>('/dashboard/trend?period=week'),
          api<Sale[]>('/sales'),
          api<MessageRow[]>('/messages'),
        ])
      setDashboard(dash)
      setAppointments(appointmentRows)
      setCustomers(customerRows)
      setProducts(productRows)
      setEmployees(employeeRows)
      setWeekTrend(trend)
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

  const dueRentals = useMemo(
    () => dashboard?.rentals.filter(r => r.status === 'due').length ?? 0,
    [dashboard],
  )

  const topCustomers = useMemo(() => {
    const totals = new Map<string, {name: string; cents: number}>()
    for (const sale of sales) {
      if (sale.cancelled) continue
      const entry = totals.get(sale.customer_id) ?? {name: sale.customer_name, cents: 0}
      entry.cents += sale.counts_total_cents
      totals.set(sale.customer_id, entry)
    }
    return [...totals.entries()]
      .map(([customerId, value]) => ({customerId, ...value}))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 4)
  }, [sales])

  if (!dashboard) return <div className="loading">Dashboard wird geladen…</div>

  const firstName = me?.full_name?.split(' ')[0]

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            {greeting()}, {firstName}! Hier ist dein Überblick für diese Woche.
          </p>
        </div>
        <span className="dash-week-pill">
          <CalendarDays size={15} />
          {weekLabel}
        </span>
      </div>

      <div className="dash-kpi-grid">
        <div className="dash-kpi">
          <div className="dash-kpi-top">
            <small>Umsatz (Woche)</small>
            <span className="dash-kpi-icon">
              <BadgeEuro size={17} />
            </span>
          </div>
          <strong>{money(dashboard.revenue_week_cents)}</strong>
          <Delta percent={weekTrend?.revenue_change_percent} />
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-top">
            <small>Einheiten (Monat)</small>
            <span className="dash-kpi-icon">
              <Target size={17} />
            </span>
          </div>
          <strong>{dashboard.units_month}</strong>
          <span className="dash-kpi-sub">
            {dashboard.units_percent}% von {dashboard.units_target} Ziel
          </span>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpi-top">
            <small>Aktive Ausleihen</small>
            <span className="dash-kpi-icon">
              <PackageCheck size={17} />
            </span>
          </div>
          <strong>{dashboard.active_rentals}</strong>
          <span className="dash-kpi-sub">
            {dueRentals > 0 ? `${dueRentals} bald fällig` : 'alles im Zeitplan'}
          </span>
        </div>

        <Link to="/nachrichten" className="dash-kpi dash-kpi-link">
          <div className="dash-kpi-top">
            <small>Ungelesene Nachrichten</small>
            <span className="dash-kpi-icon">
              <Mail size={17} />
            </span>
          </div>
          <strong>{dashboard.unread_messages}</strong>
          <span className="dash-kpi-sub">Postfach öffnen</span>
        </Link>
      </div>

      <div className="dash-grid-4">
        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Heute – Termine</h2>
          </div>
          {dashboard.today_appointments.length === 0 && <p className="dash-list-empty">Heute keine Termine geplant</p>}
          <div className="dash-agenda">
            {dashboard.today_appointments.slice(0, 4).map(item => {
              const type = appointmentTypeOption(item.appointment_type)
              return (
                <div className="dash-agenda-row" key={item.id}>
                  <div className="dash-agenda-time">
                    <strong>{timeFormatter.format(new Date(item.start_at))}</strong>
                    {item.end_at && <span>{timeFormatter.format(new Date(item.end_at))}</span>}
                  </div>
                  <div className="dash-agenda-line">
                    <span className="dash-agenda-dot" style={{background: type.color}} />
                  </div>
                  <div className="dash-agenda-main">
                    <strong>{type.label}</strong>
                    <span>{item.customer_name || 'Termin'}</span>
                    {(item.notes || item.address) && <small>{item.notes || item.address}</small>}
                  </div>
                </div>
              )
            })}
          </div>
          <Link to="/termine" className="dash-card-button">
            <CalendarDays size={15} />
            Alle Termine anzeigen
          </Link>
        </section>

        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Schnellzugriff</h2>
          </div>
          <div className="dash-quick-grid">
            <button onClick={() => setEditor({initialDay: new Date()})}>
              <CalendarDays size={18} />
              Neuer Termin
            </button>
            <button onClick={() => navigate('/kunden', {state: {openCreate: true}})}>
              <ContactRound size={18} />
              Neuer Kunde
            </button>
            <button onClick={() => navigate('/nachfassen')}>
              <AlarmClock size={18} />
              Nachfassen
            </button>
            <button onClick={() => navigate('/routenplanung')}>
              <RouteIcon size={18} />
              Route planen
            </button>
            <button onClick={() => navigate('/verkaeufe', {state: {openCreate: true}})}>
              <ShoppingCart size={18} />
              Neuer Verkauf
            </button>
            <button onClick={() => navigate('/verkaufstabelle')}>
              <BarChart3 size={18} />
              Bericht öffnen
            </button>
          </div>
        </section>

        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Top Kunden</h2>
          </div>
          {topCustomers.length === 0 && <p className="dash-list-empty">Noch keine Verkäufe erfasst</p>}
          <div className="dash-people">
            {topCustomers.map(entry => (
              <Link to={`/kunden/${entry.customerId}`} className="dash-people-row" key={entry.customerId}>
                <span className="dash-people-avatar">{initials(entry.name)}</span>
                <span className="dash-people-main">
                  <strong>{entry.name}</strong>
                  <span>Umsatz: {money(entry.cents)}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link to="/kunden" className="dash-card-link">
            Alle Kunden anzeigen
          </Link>
        </section>

        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Nachrichten</h2>
          </div>
          {messages.length === 0 && <p className="dash-list-empty">Noch keine Nachrichten</p>}
          <div className="dash-people">
            {messages.slice(0, 4).map(item => (
              <Link to="/nachrichten" className="dash-people-row" key={item.id}>
                <span className="dash-people-avatar">{initials(item.sender_name)}</span>
                <span className="dash-people-main">
                  <strong>{item.sender_name}</strong>
                  <span>{item.body}</span>
                  <small>{relativeTime(item.created_at)}</small>
                </span>
              </Link>
            ))}
          </div>
          <Link to="/nachrichten" className="dash-card-link">
            Alle Nachrichten anzeigen
          </Link>
        </section>
      </div>

      <div className="dash-grid-2">
        <section className="card dash-card dash-route-card">
          <div className="dash-card-head">
            <h2>Routenplanung – Heute</h2>
          </div>
          <div className="dash-route-body">
            <div className="dash-route-visual" aria-hidden="true">
              <svg viewBox="0 0 260 100" preserveAspectRatio="none" className="dash-route-path">
                <path d="M22 74 C48 30, 70 30, 92 46 S140 78, 168 50 S210 18, 238 24" />
              </svg>
              <span className="dash-route-dot" style={{left: '8.5%', top: '74%'}} />
              <span className="dash-route-dot" style={{left: '35.4%', top: '46%'}} />
              <span className="dash-route-dot" style={{left: '64.6%', top: '50%'}} />
              <span className="dash-route-dot" style={{left: '91.5%', top: '24%'}} />
            </div>
            <div className="dash-route-stats">
              <div>
                <strong>{dashboard.today_appointments.length}</strong>
                <span>Stopps</span>
              </div>
              <div>
                <strong>–</strong>
                <span>Gesamtdistanz</span>
              </div>
              <div>
                <strong>–</strong>
                <span>Fahrzeit</span>
              </div>
              <Link to="/routenplanung" className="primary">
                <RouteIcon size={16} />
                Route planen
              </Link>
            </div>
          </div>
        </section>

        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Umsatz – Entwicklung</h2>
          </div>
          <div className="dash-revenue-chart">
            {[
              {label: 'Heute', cents: dashboard.revenue_today_cents},
              {label: 'Woche', cents: dashboard.revenue_week_cents},
              {label: 'Monat', cents: dashboard.revenue_month_cents},
            ].map(bar => (
              <div className="dash-revenue-bar" key={bar.label}>
                <strong>{money(bar.cents)}</strong>
                <span className="dash-revenue-track">
                  <span
                    className="dash-revenue-fill"
                    style={{height: `${Math.max(6, (bar.cents / (dashboard.revenue_month_cents || 1)) * 100)}%`}}
                  />
                </span>
                <small>{bar.label}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

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

      <div className="dash-grid-2">
        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>K70-Material</h2>
          </div>
          <div className="dash-k70-grid">
            <div>
              <span>Heute</span>
              <strong>{money(dashboard.k70_revenue_today_cents)}</strong>
            </div>
            <div>
              <span>Woche</span>
              <strong>{money(dashboard.k70_revenue_week_cents)}</strong>
            </div>
            <div>
              <span>Monat</span>
              <strong>{money(dashboard.k70_revenue_month_cents)}</strong>
            </div>
          </div>
        </section>

        <section className="card dash-card">
          <div className="dash-card-head">
            <h2>Ausleihen</h2>
            <Link to="/verleih">Alle anzeigen</Link>
          </div>
          {dashboard.rentals.length === 0 && <p className="dash-list-empty">Keine aktiven Ausleihen</p>}
          <div className="dash-list">
            {dashboard.rentals.slice(0, 4).map(rental => (
              <div className="dash-list-row" key={rental.id}>
                <span className="dash-rental-name">
                  <Package size={14} />
                  {productName(rental.product_id)}
                </span>
                <span className={rental.status === 'due' ? 'rental-flag overdue' : 'rental-flag soon'}>
                  {rental.due_at ? `bis ${formatDateTime(rental.due_at)}` : rental.status}
                </span>
              </div>
            ))}
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
