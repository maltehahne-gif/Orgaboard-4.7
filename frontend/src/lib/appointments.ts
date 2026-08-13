import type {Appointment} from '../types'

export type AppointmentDraft = {
  customer_id:string
  employee_id:string
  start_at:string
  end_at:string
  appointment_type:string
  status:string
  notes:string
  product_ids:string[]
}

export const appointmentStatuses = [
  ['planned','geplant'],
  ['confirmed','bestätigt'],
  ['completed','durchgeführt'],
  ['rescheduled','verschoben'],
  ['cancelled','abgesagt'],
] as const

export const appointmentTypes = [
  ['customer','Kundentermin'],
  ['promotion','Promotion / Messe'],
  ['recommendation','Empfehlung'],
  ['premium_checkin','Premium Check-in'],
  ['team','Team'],
  ['telephone','Telefonie'],
  ['other','Sonstiges'],
] as const

export function toDateTimeLocal(value:Date|string) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0,16)
}

export function startOfWorkWeek(value = new Date()) {
  const date = new Date(value)
  date.setHours(0,0,0,0)
  const day = date.getDay()
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  return date
}

export function addDays(value:Date, days:number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

export function dateKey(value:Date|string) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2,'0')
  const day = String(date.getDate()).padStart(2,'0')
  return `${year}-${month}-${day}`
}

export function newAppointmentDraft(day = new Date(), employeeId = ''):AppointmentDraft {
  const start = new Date(day)
  start.setHours(9,0,0,0)
  const end = new Date(start)
  end.setHours(10,0,0,0)
  return {
    customer_id:'',
    employee_id:employeeId,
    start_at:toDateTimeLocal(start),
    end_at:toDateTimeLocal(end),
    appointment_type:'customer',
    status:'planned',
    notes:'',
    product_ids:[],
  }
}

export function appointmentDraft(appointment:Appointment):AppointmentDraft {
  return {
    customer_id:appointment.customer_id || '',
    employee_id:appointment.employee_id,
    start_at:toDateTimeLocal(appointment.start_at),
    end_at:appointment.end_at ? toDateTimeLocal(appointment.end_at) : '',
    appointment_type:appointment.appointment_type,
    status:appointment.status,
    notes:appointment.notes || '',
    product_ids:appointment.products.map(product => product.id),
  }
}

export function appointmentPayload(form:AppointmentDraft) {
  return {
    ...form,
    customer_id:form.customer_id || null,
    employee_id:form.employee_id || null,
    start_at:new Date(form.start_at).toISOString(),
    end_at:form.end_at ? new Date(form.end_at).toISOString() : null,
    notes:form.notes.trim() || null,
  }
}

function escapeCalendarText(value:string) {
  return value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')
}

function calendarDate(value:string) {
  return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
}

export function downloadCalendarFile(appointment:Appointment) {
  const fallbackEnd = new Date(new Date(appointment.start_at).getTime() + 60 * 60_000).toISOString()
  const title = appointment.customer_name ? `Termin mit ${appointment.customer_name}` : 'Termin'
  const description = [appointment.notes, appointment.products.length ? `Produkte: ${appointment.products.map(p => p.name).join(', ')}` : ''].filter(Boolean).join('\n')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OrgaBoard//Termine//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@orgaboard`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(appointment.start_at)}`,
    `DTEND:${calendarDate(appointment.end_at || fallbackEnd)}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `LOCATION:${escapeCalendarText(appointment.address || '')}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}))
  const link = document.createElement('a')
  link.href = url
  link.download = `Termin-${dateKey(appointment.start_at)}.ics`
  link.click()
  URL.revokeObjectURL(url)
}
