import {CalendarPlus,Check,ChevronLeft,ChevronRight,Pencil,RotateCcw,Trash2} from 'lucide-react'
import type {Appointment} from '../types'
import {addDays,dateKey,downloadCalendarFile} from '../lib/appointments'

type Props={
  weekStart:Date
  appointments:Appointment[]
  onShiftWeek:(days:number)=>void
  onToday:()=>void
  onCreate:(day:Date)=>void
  onEdit:(appointment:Appointment)=>void
  onToggleCompleted:(appointment:Appointment)=>void
  onDelete:(appointment:Appointment)=>void
}

const dayFormatter=new Intl.DateTimeFormat('de-DE',{weekday:'long'})
const dateFormatter=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'})
const rangeFormatter=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})
const timeFormatter=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'})

export function AppointmentWeek({weekStart,appointments,onShiftWeek,onToday,onCreate,onEdit,onToggleCompleted,onDelete}:Props){
  const days=Array.from({length:5},(_,index)=>addDays(weekStart,index))
  const end=days[days.length-1]
  return <section className="card appointment-week-shell" aria-label="Termine dieser Woche">
    <div className="appointment-week-toolbar">
      <div><h2>Termine dieser Woche</h2><p>{rangeFormatter.format(weekStart)} – {rangeFormatter.format(end)}</p></div>
      <div className="week-nav">
        <button type="button" className="week-arrow" onClick={()=>onShiftWeek(-7)} aria-label="Vorherige Woche"><ChevronLeft size={18}/></button>
        <button type="button" onClick={onToday}>Diese Woche</button>
        <button type="button" className="week-arrow" onClick={()=>onShiftWeek(7)} aria-label="Nächste Woche"><ChevronRight size={18}/></button>
      </div>
    </div>
    <div className="appointment-week-scroll">
      <div className="appointment-week-grid">
        {days.map(day=>{
          const rows=appointments.filter(appointment=>dateKey(appointment.start_at)===dateKey(day))
          const today=dateKey(day)===dateKey(new Date())
          return <div className={`appointment-day${today?' today':''}`} key={dateKey(day)}>
            <div className="appointment-day-head">
              <strong>{dayFormatter.format(day)}</strong>
              <span>{dateFormatter.format(day)}</span>
              <button type="button" onClick={()=>onCreate(day)}>+ Termin</button>
            </div>
            <div className="appointment-day-body">
              {rows.length===0?<div className="appointment-day-empty">Keine Termine</div>:rows.map(appointment=><article className={`week-appointment status-${appointment.status}`} key={appointment.id}>
                <button type="button" className="week-appointment-main" onClick={()=>onEdit(appointment)} aria-label={`${appointment.customer_name||'Termin'} bearbeiten`}>
                  <strong>{timeFormatter.format(new Date(appointment.start_at))}{appointment.end_at?` – ${timeFormatter.format(new Date(appointment.end_at))}`:''}</strong>
                  <b>{appointment.customer_name||'Termin'}</b>
                  {appointment.notes&&<span>{appointment.notes}</span>}
                </button>
                <div className="week-appointment-actions">
                  <button type="button" onClick={()=>downloadCalendarFile(appointment)} title="Zum Kalender hinzufügen"><CalendarPlus size={14}/><span>Kalender</span></button>
                  <button type="button" onClick={()=>onEdit(appointment)} title="Termin bearbeiten" aria-label="Termin bearbeiten"><Pencil size={14}/></button>
                  <button type="button" onClick={()=>onToggleCompleted(appointment)} title={appointment.status==='completed'?'Wieder als geplant markieren':'Als erledigt markieren'} aria-label={appointment.status==='completed'?'Wieder öffnen':'Als erledigt markieren'}>{appointment.status==='completed'?<RotateCcw size={14}/>:<Check size={14}/>}</button>
                  <button type="button" onClick={()=>onDelete(appointment)} title="Termin löschen" aria-label="Termin löschen"><Trash2 size={14}/></button>
                </div>
              </article>)}
            </div>
          </div>
        })}
      </div>
    </div>
    <button type="button" className="appointment-week-add" onClick={()=>onCreate(new Date())}><CalendarPlus size={17}/> Termin eintragen</button>
  </section>
}
