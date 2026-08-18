import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  Pencil,
  RotateCcw,
  Trash2
} from 'lucide-react'

import type {CSSProperties} from 'react'
import type {Appointment} from '../types'

import {
  appointmentTypeOption,
  appointmentTypeOptions,
  downloadCalendarFile,
  openDirections
} from '../lib/appointments'


type Props={
  weekStart:Date
  appointments:Appointment[]
  onShiftWeek:(days:number)=>void
  onToday:()=>void
  onCreate:(day:Date)=>void
  onEdit:(appointment:Appointment)=>void
  onToggleCompleted:(appointment:Appointment)=>void
  onDelete:(appointment:Appointment)=>void
  /** Termin-ID, fuer die gerade ein Status-/Loeschaufruf laeuft - verhindert Doppel-Klicks. */
  busyAppointmentId?:string|null
}


const timeFormatter=
new Intl.DateTimeFormat('de-DE',{
 hour:'2-digit',
 minute:'2-digit'
})


export function AppointmentWeek({
 weekStart,
 appointments,
 onShiftWeek,
 onToday,
 onCreate,
 onEdit,
 onToggleCompleted,
 onDelete,
 busyAppointmentId
}:Props){

 const rows=[...appointments]
 .sort((a,b)=>
 new Date(a.start_at).getTime()
 -
 new Date(b.start_at).getTime()
 )


 return (

<section className="apple-taskline">


<header className="apple-task-header">

<div>
<h2>Termine</h2>
<p>
Planen, bestätigen, verschieben und sauber dokumentieren.
</p>
</div>


<div className="apple-calendar-controls">

<button aria-label="Vorherige Woche" title="Vorherige Woche" onClick={()=>onShiftWeek(-7)}>
<ChevronLeft/>
</button>

<button onClick={onToday}>
Heute
</button>

<button aria-label="Nächste Woche" title="Nächste Woche" onClick={()=>onShiftWeek(7)}>
<ChevronRight/>
</button>

</div>

</header>


<div className="apple-timeline">


{rows.length===0 &&

<div className="empty-task">
Keine Termine
</div>

}



{rows.map((appointment,index)=>{

const type=
appointmentTypeOption(
appointment.appointment_type
)


return (

<div
className="apple-time-row"
key={appointment.id}
>


<div className="apple-time">

<strong>
{timeFormatter.format(
new Date(appointment.start_at)
)}
</strong>

<span>
{
appointment.end_at
?
timeFormatter.format(
new Date(appointment.end_at)
)
:''
}
</span>

</div>



<article
className={`apple-task-card status-${appointment.status}`}
style={{
'--task-color':type.color
} as CSSProperties}
>


<div className="task-dot"/>


<div className="task-main"
onClick={()=>onEdit(appointment)}
>


<h3>
{appointment.customer_name || 'Termin'}
</h3>


<p>
{appointment.address || 'Kein Ort hinterlegt'}
</p>


<div className="task-tags">

<span>
{type.label}
</span>


{appointment.notes &&
<span>
Notiz
</span>
}

</div>


</div>



<div className="task-actions">


{appointment.address&&

<button
aria-label={`Route zu ${appointment.customer_name} anzeigen`}
title="Route anzeigen"
onClick={()=>openDirections(appointment.address!)}
>
<MapPinned size={15}/>
</button>

}


<button
aria-label={`Termin mit ${appointment.customer_name} in den Kalender übernehmen`}
title="In den Kalender übernehmen"
onClick={()=>downloadCalendarFile(appointment)}
>
<CalendarPlus size={15}/>
</button>


<button
aria-label={`Termin mit ${appointment.customer_name} bearbeiten`}
title="Bearbeiten"
onClick={()=>onEdit(appointment)}
>
<Pencil size={15}/>
</button>


<button
aria-label={appointment.status==='completed'
?`Termin mit ${appointment.customer_name} wieder öffnen`
:`Termin mit ${appointment.customer_name} als erledigt markieren`}
title={appointment.status==='completed'?'Wieder öffnen':'Als erledigt markieren'}
disabled={busyAppointmentId===appointment.id}
onClick={()=>onToggleCompleted(appointment)}
>
{
appointment.status==='completed'
?
<RotateCcw size={15}/>
:
<Check size={15}/>
}
</button>


<button
aria-label={`Termin mit ${appointment.customer_name} löschen`}
title="Löschen"
disabled={busyAppointmentId===appointment.id}
onClick={()=>onDelete(appointment)}
>
<Trash2 size={15}/>
</button>


</div>


</article>


</div>

)

})}


</div>



<footer className="apple-task-footer">


<div className="apple-legend">

{appointmentTypeOptions.map(option=>

<span key={option.value}>
<i style={{background:option.color}}/>
{option.label}
</span>

)}

</div>


<button
onClick={()=>onCreate(new Date())}
>
<CalendarPlus size={16}/>
Neuen Termin planen
</button>


</footer>


</section>

)

}
