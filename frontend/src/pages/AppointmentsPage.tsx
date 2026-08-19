import {useCallback,useEffect,useState} from 'react'
import {CalendarPlus,CheckCircle2,MapPinned,Pencil,Trash2} from 'lucide-react'
import {api,formatDateTime} from '../lib/api'
import type {Appointment,Customer,Product} from '../types'
import {useToast} from '../components/Toast'
import {LoadError} from '../components/LoadError'
import {AppointmentModal} from '../components/AppointmentModal'
import {AppointmentCompletionModal} from '../components/AppointmentCompletionModal'
import {appointmentPayload,appointmentStatuses,appointmentTypeOption,downloadCalendarFile,openDirections,type AppointmentDraft} from '../lib/appointments'
import {connectRealtime} from '../lib/realtime'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {useLocation,useNavigate} from 'react-router-dom'

type TeamEmployee={id:string;display_name:string}
type Editor={appointment?:Appointment;initialDay?:Date;customerId?:string}

export function AppointmentsPage(){
  const {me}=useAuth()
  const [rows,setRows]=useState<Appointment[]>([])
  const [customers,setCustomers]=useState<Customer[]>([])
  const [products,setProducts]=useState<Product[]>([])
  const [employees,setEmployees]=useState<TeamEmployee[]>([])
  const [editor,setEditor]=useState<Editor|null>(null)
  const [completion,setCompletion]=useState<Appointment|null>(null)
  const [saving,setSaving]=useState(false)
  const [ladend,setLadend]=useState(true)
  const [ladefehler,setLadefehler]=useState<string|null>(null)
  const [statusBusyId,setStatusBusyId]=useState<string|null>(null)
  const [gesuchterTermin,setGesuchterTermin]=useState<string|null>(null)
  const toast=useToast()
  const isTeamLeader=darfVerwalten(me?.role)
  const location=useLocation()
  const navigate=useNavigate()

  // Sprung aus der Kundenakte: Maske gleich mit dem Kunden oeffnen.
  // Sprung aus der Buntewoche: den angeklickten Termin oeffnen. Der Termin
  // steht beim Eintreffen noch nicht in rows - die Liste laedt erst -,
  // deshalb wird die ID gemerkt und unten aufgeloest, sobald sie da ist.
  useEffect(()=>{
    const state=location.state as any
    if(state?.openCreate){
      setEditor({initialDay:new Date(),customerId:state.customerId})
      navigate(location.pathname,{replace:true,state:null})
    }else if(state?.openAppointmentId){
      setGesuchterTermin(state.openAppointmentId)
      navigate(location.pathname,{replace:true,state:null})
    }
  },[location.state])

  useEffect(()=>{
    if(!gesuchterTermin)return
    const appointment=rows.find(row=>row.id===gesuchterTermin)
    if(appointment){
      setEditor({appointment})
      setGesuchterTermin(null)
    }else if(!ladend){
      // Geladen, aber nicht dabei: der Termin gehoert zu einem anderen
      // Mitarbeiter oder wurde inzwischen geloescht.
      setGesuchterTermin(null)
      toast('Dieser Termin ist nicht mehr vorhanden.','error')
    }
  },[gesuchterTermin,rows,ladend,toast])

  const load=useCallback(async()=>{
    try{
      const requests:[Promise<Appointment[]>,Promise<Customer[]>,Promise<Product[]>,Promise<TeamEmployee[]>]=[
        api<Appointment[]>('/appointments'),
        api<Customer[]>('/customers'),
        api<Product[]>('/products'),
        isTeamLeader?api<TeamEmployee[]>('/team/employees'):Promise.resolve([]),
      ]
      const [appointments,customerRows,productRows,employeeRows]=await Promise.all(requests)
      setRows(appointments);setCustomers(customerRows);setProducts(productRows);setEmployees(employeeRows)
      setLadefehler(null)
    }catch(error){
      const meldungText=error instanceof Error?error.message:'Termine konnten nicht geladen werden'
      toast(meldungText,'error')
      setLadefehler(meldungText)
    }finally{setLadend(false)}
  },[isTeamLeader,toast])

  useEffect(()=>{load();return connectRealtime(event=>{if(!event?.entity || event.entity==='appointment')load()})},[load])

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

  async function changeStatus(appointment:Appointment,status:string){
    if(statusBusyId===appointment.id)return
    if(status==='completed'&&appointment.status!=='completed'){
      setCompletion(appointment)
      return
    }

    setStatusBusyId(appointment.id)
    try{
      await api(`/appointments/${appointment.id}/status`,{
        method:'PATCH',
        body:JSON.stringify({status}),
      })
      await load()
      toast('Status aktualisiert')
    }catch(error){
      toast(
        error instanceof Error
          ?error.message
          :'Status konnte nicht geändert werden',
        'error',
      )
    }finally{setStatusBusyId(null)}
  }

  async function remove(appointment:Appointment,confirmed=false){
    if(saving)return
    if(!confirmed&&!window.confirm(`Termin „${appointment.customer_name||'Termin'}“ wirklich löschen?`))return
    setSaving(true)
    try{await api(`/appointments/${appointment.id}`,{method:'DELETE'});setEditor(null);await load();toast('Termin gelöscht')}
    catch(error){toast(error instanceof Error?error.message:'Termin konnte nicht gelöscht werden','error')}
    finally{setSaving(false)}
  }

  return <div className="page">
    <div className="page-head"><div><h1>Termine</h1><p>Planen, bestätigen, verschieben und sauber dokumentieren.</p></div><button className="primary" onClick={()=>setEditor({initialDay:new Date()})}><CalendarPlus size={18}/> Termin anlegen</button></div>
    {ladend&&<div className="loading">Termine werden geladen…</div>}
    {!ladend&&ladefehler&&<LoadError meldung={ladefehler} onRetry={()=>{setLadend(true);load()}}/>}
    {!ladend&&!ladefehler&&<div className="cards-list">
      {rows.length===0&&<div className="card empty">Noch keine Termine vorhanden.</div>}
      {rows.map(appointment=>{const type=appointmentTypeOption(appointment.appointment_type);return <div className={`card appointment-card appointment-list-status-${appointment.status}`} key={appointment.id}>
        <div className="appointment-list-copy">
          <span className="dot" style={{background:type.color}}/><strong>{appointment.customer_name||'Termin'}</strong><small>{type.label}</small>
          <p>{formatDateTime(appointment.start_at)}{appointment.end_at?` – ${new Date(appointment.end_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}`:''} · {appointment.address||'Adresse nicht hinterlegt'}</p>
          {appointment.notes&&<small>{appointment.notes}</small>}
          {appointment.products.length>0&&<small>Geplant: {appointment.products.map(product=>product.name).join(', ')}</small>}
        </div>
        <div className="appointment-list-actions">
          <select aria-label="Terminstatus" value={appointment.status} disabled={statusBusyId===appointment.id} onChange={event=>changeStatus(appointment,event.target.value)}>{appointmentStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          {appointment.address&&<button type="button" className="appointment-directions-action" onClick={()=>openDirections(appointment.address!)} title={`Wegbeschreibung zu ${appointment.address}`}><MapPinned size={16}/> Wegbeschreibung</button>}
          {appointment.status!=='completed'&&appointment.status!=='cancelled'&&<button type="button" className="appointment-complete-action" onClick={()=>setCompletion(appointment)}><CheckCircle2 size={16}/> Durchgeführt</button>}
          <button type="button" onClick={()=>setEditor({appointment})}><Pencil size={16}/> Bearbeiten</button>
          <button type="button" className="icon-danger" disabled={saving} onClick={()=>remove(appointment)} aria-label="Termin löschen" title="Termin löschen"><Trash2 size={16}/></button>
        </div>
      </div>})}
    </div>}
    {completion&&<AppointmentCompletionModal
      appointment={completion}
      products={products}
      onClose={()=>setCompletion(null)}
      onDone={async()=>{
        setCompletion(null)
        await load()
      }}
    />}
    {editor&&<AppointmentModal
      appointment={editor.appointment}
      initialDay={editor.initialDay}
      initialCustomerId={editor.customerId}
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
