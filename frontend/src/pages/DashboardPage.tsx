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

  const [current,setCurrent]=useState(new Date())
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

  return <div className="apple-dashboard">

    <section className="apple-main-column">

      <div className="apple-welcome">
        <h1>
          Willkommen zurück, {me?.full_name?.split(' ')[0]}! 👋
        </h1>
        <p>
          Hier ist dein Überblick für diese Woche.
        </p>
      </div>


      <AppointmentWeek
        weekStart={current}
        appointments={appointments}
        onShiftWeek={(days)=>setCurrent(addDays(current,days))}
        onToday={()=>setCurrent(new Date())}
        onCreate={(day)=>setEditor({initialDay:day})}
        onEdit={(appointment)=>setEditor({appointment})}
        onToggleCompleted={toggleCompleted}
        onDelete={(appointment)=>remove(appointment,true)}
      />


      <div className="apple-stat-grid">

        <div className="apple-stat">
          <small>Umsatz heute</small>
          <strong>
            {money(dashboard.revenue_today_cents)}
          </strong>
        </div>


        <div className="apple-stat">
          <small>Umsatz Woche</small>
          <strong>
            {money(dashboard.revenue_week_cents)}
          </strong>
        </div>


        <div className="apple-stat">
          <small>Umsatz Monat</small>
          <strong>
            {money(dashboard.revenue_month_cents)}
          </strong>
        </div>


        <div className="apple-stat">
          <small>Noch bis Monatsziel</small>
          <strong className="orange">
            {dashboard.units_missing}
          </strong>
        </div>

      </div>


      <section className="apple-k70">

        <div>
          <small>K70-MATERIAL</small>
          <h2>K70-Umsatz</h2>
        </div>

        <div className="apple-k70-grid">

          <article>
            <span>Heute</span>
            <strong>
              {money(dashboard.k70_revenue_today_cents)}
            </strong>
          </article>


          <article>
            <span>Diese Woche</span>
            <strong>
              {money(dashboard.k70_revenue_week_cents)}
            </strong>
          </article>


          <article>
            <span>Dieser Monat</span>
            <strong>
              {money(dashboard.k70_revenue_month_cents)}
            </strong>
          </article>

        </div>

      </section>

    </section>



    <aside className="apple-right-panel">


      <div className="apple-brand-card">

        <h2>
          Willkommen,
          <br/>
          {me?.full_name}
        </h2>

        <p>
          Vertriebspartner
        </p>

        <span>
          Mehr Zeit für Menschen.
          <br/>
          Mehr Möglichkeiten im Vertrieb.
        </span>

      </div>



      <div className="apple-card">

        <h3>
          Umsatz heute
        </h3>

        <strong>
          {money(dashboard.revenue_today_cents)}
        </strong>

        <span className="green">
          ↗ +12%
        </span>

      </div>



      <div className="apple-card">

        <h3>
          Deine nächsten Termine
        </h3>

        {appointments.slice(0,3).map(a=>
          <div className="apple-next" key={a.id}>

            <b>
              {new Date(a.start_at)
              .toLocaleTimeString("de-DE",
              {hour:"2-digit",minute:"2-digit"})}
            </b>

            <span>
              {a.customer_name}
            </span>

          </div>
        )}

      </div>



      <div className="apple-card">

        <h3>
          Schnellzugriff
        </h3>


        <div className="apple-actions">

          <button>
            Neuer Kunde
          </button>

          <button>
            Termin planen
          </button>

          <button>
            Neuer Verkauf
          </button>

          <button>
            Route erstellen
          </button>

        </div>


      </div>


    </aside>


  </div>

}
