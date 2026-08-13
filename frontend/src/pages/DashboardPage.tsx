import {BadgeEuro,CalendarClock,CalendarDays,CalendarRange,Clock3,Info,Mail,MapPinned,PackageCheck,Target} from 'lucide-react'
import {useCallback,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {api,formatDateTime,money} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {StatCard} from '../components/StatCard'
import {useAuth} from '../lib/auth'
import type {Appointment,Customer,Product} from '../types'
import {AppointmentWeek} from '../components/AppointmentWeek'
import {AppointmentModal} from '../components/AppointmentModal'
import {addDays,appointmentPayload,downloadCalendarFile,openDirections,startOfWorkWeek,type AppointmentDraft} from '../lib/appointments'
import {useToast} from '../components/Toast'

type Dash={revenue_today_cents:number;revenue_week_cents:number;revenue_month_cents:number;k70_revenue_today_cents:number;k70_revenue_week_cents:number;k70_revenue_month_cents:number;units_week:number;units_month:number;units_target:number;units_missing:number;units_percent:number;next_appointment:Appointment|null;today_appointments:Appointment[];active_rentals:number;unread_messages:number}
type TeamEmployee={id:string;display_name:string}
type Editor={appointment?:Appointment;initialDay?:Date}

export function DashboardPage(){
  const {me}=useAuth()
  const toast=useToast()
  const [dashboard,setDashboard]=useState<Dash|null>(null)
  const [appointments,setAppointments]=useState<Appointment[]>([])
  const [customers,setCustomers]=useState<Customer[]>([])
  const [products,setProducts]=useState<Product[]>([])
  const [employees,setEmployees]=useState<TeamEmployee[]>([])
  const [weekStart,setWeekStart]=useState(()=>startOfWorkWeek())
  const [editor,setEditor]=useState<Editor|null>(null)
  const [saving,setSaving]=useState(false)
  const isTeamLeader=me?.role==='TEAM_LEADER'

  const load=useCallback(async()=>{
    const end=addDays(weekStart,7)
    const query=`?start=${encodeURIComponent(weekStart.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    try{
      const [dash,appointmentRows,customerRows,productRows,employeeRows]=await Promise.all([
        api<Dash>('/dashboard'),
        api<Appointment[]>(`/appointments${query}`),
        api<Customer[]>('/customers'),
        api<Product[]>('/products'),
        isTeamLeader?api<TeamEmployee[]>('/team/employees'):Promise.resolve([]),
      ])
      setDashboard(dash);setAppointments(appointmentRows);setCustomers(customerRows);setProducts(productRows);setEmployees(employeeRows)
    }catch(error){toast(error instanceof Error?error.message:'Dashboard konnte nicht geladen werden','error')}
  },[isTeamLeader,toast,weekStart])

  useEffect(()=>{load();return connectRealtime(()=>load())},[load])

  async function save(form:AppointmentDraft){
    setSaving(true)
    try{
      const appointment=editor?.appointment
      const saved=await api<Appointment>(appointment?`/appointments/${appointment.id}`:'/appointments',{method:appointment?'PUT':'POST',body:JSON.stringify(appointmentPayload(form))})
      setEditor(null);await load();toast(appointment?'Termin aktualisiert':'Termin gespeichert')
      if(form.add_to_calendar)downloadCalendarFile(saved,form.reminder_minutes)
    }catch(error){toast(error instanceof Error?error.message:'Termin konnte nicht gespeichert werden','error')}
    finally{setSaving(false)}
  }

  async function toggleCompleted(appointment:Appointment){
    const status=appointment.status==='completed'?'planned':'completed'
    try{await api(`/appointments/${appointment.id}/status`,{method:'PATCH',body:JSON.stringify({status})});await load();toast(status==='completed'?'Termin als erledigt markiert':'Termin wieder geöffnet')}
    catch(error){toast(error instanceof Error?error.message:'Status konnte nicht geändert werden','error')}
  }

  async function remove(appointment:Appointment,confirmed=false){
    if(!confirmed&&!window.confirm(`Termin „${appointment.customer_name||'Termin'}“ wirklich löschen?`))return
    setSaving(true)
    try{await api(`/appointments/${appointment.id}`,{method:'DELETE'});setEditor(null);await load();toast('Termin gelöscht')}
    catch(error){toast(error instanceof Error?error.message:'Termin konnte nicht gelöscht werden','error')}
    finally{setSaving(false)}
  }

  if(!dashboard)return <div className="loading">Dashboard wird geladen…</div>
  return <div className="page">
    <div className="page-head dashboard-welcome"><div><h1>Willkommen zurück, {me?.full_name.split(' ')[0]}! <span aria-hidden="true">👋</span></h1><p>Hier ist dein Überblick für diese Woche.</p></div></div>
    <AppointmentWeek
      weekStart={weekStart}
      appointments={appointments}
      onShiftWeek={days=>setWeekStart(current=>addDays(current,days))}
      onToday={()=>setWeekStart(startOfWorkWeek())}
      onCreate={day=>setEditor({initialDay:day})}
      onEdit={appointment=>setEditor({appointment})}
      onToggleCompleted={toggleCompleted}
      onDelete={appointment=>remove(appointment)}
    />
    <div className="stat-grid"><StatCard label="Umsatz heute" value={money(dashboard.revenue_today_cents)} accent="green"/><StatCard label="Umsatz Woche" value={money(dashboard.revenue_week_cents)} accent="green"/><StatCard label="Umsatz Monat" value={money(dashboard.revenue_month_cents)}/><StatCard label="Noch bis 30 Einheiten" value={`${dashboard.units_missing}`} accent={dashboard.units_missing===0?'green':'orange'}/></div>
    <section className="card k70-revenue-overview">
      <div className="k70-revenue-head">
        <div className="k70-revenue-title">
          <span className="k70-revenue-logo"><BadgeEuro size={23}/></span>
          <div><small>K70-MATERIAL</small><h2>K70-Umsatz</h2></div>
        </div>
        <span className="k70-revenue-badge">Separat ausgewertet</span>
      </div>
      <div className="k70-revenue-grid">
        <article><div className="k70-revenue-label"><Clock3 size={17}/><span>Heute</span></div><strong>{money(dashboard.k70_revenue_today_cents)}</strong><small>Tagesumsatz</small></article>
        <article><div className="k70-revenue-label"><CalendarDays size={17}/><span>Diese Woche</span></div><strong>{money(dashboard.k70_revenue_week_cents)}</strong><small>Wochenumsatz</small></article>
        <article><div className="k70-revenue-label"><CalendarRange size={17}/><span>Dieser Monat</span></div><strong>{money(dashboard.k70_revenue_month_cents)}</strong><small>Monatsumsatz</small></article>
      </div>
      <div className="k70-revenue-note"><Info size={16}/><span>K70-Produkte fließen vollständig in den Umsatz ein, werden aber nicht als Einheit gezählt.</span></div>
    </section>
    <div className="dashboard-grid">
      <section className="card big"><div className="section-title"><Target size={20}/><h2>Monatsziel</h2></div><div className="units-line"><strong>{dashboard.units_month}</strong><span>/ {dashboard.units_target} Einheiten</span></div><div className="progress"><span style={{width:`${Math.min(dashboard.units_percent,100)}%`}}/></div><p>{dashboard.units_percent}% erreicht · {dashboard.units_missing} Einheiten fehlen</p></section>
      <section className="card"><div className="section-title"><CalendarClock size={20}/><h2>Nächster Termin</h2></div>{dashboard.next_appointment?<><h3>{dashboard.next_appointment.customer_name}</h3><p>{formatDateTime(dashboard.next_appointment.start_at)}</p><small>{dashboard.next_appointment.address||'Keine Adresse hinterlegt'}</small>{dashboard.next_appointment.address&&<button type="button" className="dashboard-directions-action" onClick={()=>openDirections(dashboard.next_appointment!.address!)}><MapPinned size={16}/> Wegbeschreibung</button>}</>:<p>Kein kommender Termin.</p>}</section>
      <section className="card"><div className="section-title"><CalendarClock size={20}/><h2>Heute</h2></div>{dashboard.today_appointments.length?dashboard.today_appointments.map(appointment=><div className="list-row dashboard-today-appointment" key={appointment.id}><strong>{new Date(appointment.start_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</strong><span>{appointment.customer_name}</span>{appointment.address&&<button type="button" className="appointment-route-icon" onClick={()=>openDirections(appointment.address!)} aria-label={`Wegbeschreibung zu ${appointment.customer_name||appointment.address}`} title="Wegbeschreibung"><MapPinned size={15}/></button>}</div>):<p>Heute keine Termine.</p>}</section>
      <Link to="/verleih" className="card dashboard-link-card" aria-label="Verleihgeräte öffnen"><div className="section-title"><PackageCheck size={20}/><h2>Verleihgeräte</h2></div><div className="hero-number">{dashboard.active_rentals}</div><p>aktive Geräte im Verleih</p><span className="dashboard-link-hint">Verleih öffnen →</span></Link>
      <Link to="/nachrichten" className="card dashboard-link-card" aria-label="Nachrichten öffnen"><div className="section-title"><Mail size={20}/><h2>Nachrichten</h2></div><div className="hero-number">{dashboard.unread_messages}</div><p>ungelesene Nachrichten</p><span className="dashboard-link-hint">Chat öffnen →</span></Link>
    </div>
    {editor&&<AppointmentModal
      appointment={editor.appointment}
      initialDay={editor.initialDay}
      ownEmployeeId={me?.employee?.id}
      isTeamLeader={isTeamLeader}
      customers={customers}
      products={products}
      employees={employees}
      saving={saving}
      onClose={()=>setEditor(null)}
      onSave={save}
      onDelete={editor.appointment?()=>remove(editor.appointment!,true):undefined}
    />}
  </div>
}
