import {FormEvent,useEffect,useMemo,useState,type CSSProperties} from 'react'
import {MapPinned} from 'lucide-react'
import type {Appointment,Customer,Product} from '../types'
import {Modal} from './Modal'
import {appointmentDraft,appointmentStatuses,appointmentTypeOptions,newAppointmentDraft,openDirections,type AppointmentDraft} from '../lib/appointments'

type TeamEmployee={id:string;display_name:string}

type Props={
  appointment?:Appointment|null
  initialDay?:Date|null
  ownEmployeeId?:string
  isTeamLeader:boolean
  customers:Customer[]
  products:Product[]
  employees:TeamEmployee[]
  saving?:boolean
  onClose:()=>void
  onSave:(form:AppointmentDraft)=>Promise<void>
  onDelete?:()=>Promise<void>
}

export function AppointmentModal({appointment,initialDay,ownEmployeeId='',isTeamLeader,customers,products,employees,saving=false,onClose,onSave,onDelete}:Props){
  const [form,setForm]=useState<AppointmentDraft>(()=>appointment ? appointmentDraft(appointment) : newAppointmentDraft(initialDay || new Date(),ownEmployeeId))
  const [error,setError]=useState('')

  useEffect(()=>{
    setForm(appointment ? appointmentDraft(appointment) : newAppointmentDraft(initialDay || new Date(),ownEmployeeId))
    setError('')
  },[appointment,initialDay,ownEmployeeId])

  const visibleCustomers=useMemo(()=>{
    if(!isTeamLeader || !form.employee_id)return customers
    return customers.filter(customer=>customer.employee_id===form.employee_id)
  },[customers,form.employee_id,isTeamLeader])
  const selectedCustomer=customers.find(customer=>customer.id===form.customer_id)

  function changeCustomer(customerId:string){
    const customer=customers.find(item=>item.id===customerId)
    setForm({...form,customer_id:customerId,employee_id:customer?.employee_id || form.employee_id})
  }

  async function submit(event:FormEvent){
    event.preventDefault()
    if(isTeamLeader && !form.employee_id){setError('Bitte einen Mitarbeiter auswählen.');return}
    if(form.end_at && new Date(form.end_at)<=new Date(form.start_at)){setError('Das Ende muss nach dem Beginn liegen.');return}
    setError('')
    await onSave(form)
  }

  async function remove(){
    if(!onDelete || !window.confirm('Diesen Termin wirklich löschen?'))return
    await onDelete()
  }

  return <Modal title={appointment?'Termin bearbeiten':'Neuer Termin'} onClose={onClose}>
    <form className="form-grid appointment-editor" onSubmit={submit}>
      {isTeamLeader&&<label className="span-2">Mitarbeiter
        <select required value={form.employee_id} onChange={event=>setForm({...form,employee_id:event.target.value,customer_id:''})}>
          <option value="">Mitarbeiter auswählen</option>
          {employees.map(employee=><option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
        </select>
      </label>}
      <label className="span-2">Kunde
        <select value={form.customer_id} onChange={event=>changeCustomer(event.target.value)}>
          <option value="">Ohne Kundenbezug</option>
          {visibleCustomers.map(customer=><option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
        </select>
      </label>
      {selectedCustomer&&<div className="appointment-customer-preview span-2">
        <div><small>Anschrift</small><strong>{selectedCustomer.address||'Nicht hinterlegt'}</strong>{selectedCustomer.address&&<button type="button" className="appointment-preview-directions" onClick={()=>openDirections(selectedCustomer.address)}><MapPinned size={15}/> Wegbeschreibung</button>}</div>
        <div><small>Telefon / Handynummer</small><strong>{selectedCustomer.phone||'Nicht hinterlegt'}</strong></div>
        <div><small>E-Mail-Adresse</small><strong>{selectedCustomer.email||'Nicht hinterlegt'}</strong></div>
      </div>}
      <label>Start<input type="datetime-local" required value={form.start_at} onChange={event=>setForm({...form,start_at:event.target.value})}/></label>
      <label>Ende<input type="datetime-local" value={form.end_at} onChange={event=>setForm({...form,end_at:event.target.value})}/></label>
      <fieldset className="appointment-type-field span-2">
        <legend>Terminart und Farbe</legend>
        <div className="appointment-type-options">
          {appointmentTypeOptions.map(option=><label className={`appointment-type-option${form.appointment_type===option.value?' selected':''}`} style={{'--type-color':option.color} as CSSProperties} key={option.value}>
            <input type="radio" name="appointment_type" value={option.value} checked={form.appointment_type===option.value} onChange={event=>setForm({...form,appointment_type:event.target.value})}/>
            <span className="appointment-type-swatch"/>
            <span>{option.label}</span>
          </label>)}
        </div>
      </fieldset>
      <label>Status
        <select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}>
          {appointmentStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="appointment-calendar-toggle span-2">
        <input type="checkbox" checked={form.add_to_calendar} onChange={event=>setForm({...form,add_to_calendar:event.target.checked})}/>
        <span><strong>Im Handy-Kalender speichern</strong><small>Nach dem Speichern wird eine Kalenderdatei geöffnet.</small></span>
      </label>
      {form.add_to_calendar&&<label className="span-2">Erinnerung
        <select value={form.reminder_minutes} onChange={event=>setForm({...form,reminder_minutes:Number(event.target.value)})}>
          <option value={15}>15 Minuten vorher</option>
          <option value={30}>30 Minuten vorher</option>
          <option value={60}>1 Stunde vorher</option>
          <option value={120}>2 Stunden vorher</option>
          <option value={1440}>1 Tag vorher</option>
          <option value={2880}>2 Tage vorher</option>
          <option value={10080}>1 Woche vorher</option>
        </select>
      </label>}
      <label className="span-2">Geplante Produkte
        <select multiple value={form.product_ids} onChange={event=>setForm({...form,product_ids:Array.from(event.target.selectedOptions).map(option=>option.value)})}>
          {products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </label>
      <label className="span-2">Notizen<textarea rows={4} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
      {error&&<div className="error-box span-2" role="alert">{error}</div>}
      <div className="form-actions appointment-form-actions span-2">
        <div>{appointment&&onDelete&&<button type="button" className="danger-button" onClick={remove} disabled={saving}>Termin löschen</button>}</div>
        <div><button type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="primary" disabled={saving}>{saving?'Wird gespeichert…':'Termin speichern'}</button></div>
      </div>
    </form>
  </Modal>
}
