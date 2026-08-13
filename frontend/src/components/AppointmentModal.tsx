import {FormEvent,useEffect,useMemo,useState} from 'react'
import type {Appointment,Customer,Product} from '../types'
import {Modal} from './Modal'
import {appointmentDraft,appointmentStatuses,appointmentTypes,newAppointmentDraft,type AppointmentDraft} from '../lib/appointments'

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

  return <Modal title={appointment?'Termin bearbeiten':'Termin anlegen'} onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
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
      <label>Start<input type="datetime-local" required value={form.start_at} onChange={event=>setForm({...form,start_at:event.target.value})}/></label>
      <label>Ende<input type="datetime-local" value={form.end_at} onChange={event=>setForm({...form,end_at:event.target.value})}/></label>
      <label>Terminart
        <select value={form.appointment_type} onChange={event=>setForm({...form,appointment_type:event.target.value})}>
          {appointmentTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Status
        <select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}>
          {appointmentStatuses.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
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
