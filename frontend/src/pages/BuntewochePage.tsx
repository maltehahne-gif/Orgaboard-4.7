import {useCallback,useEffect,useMemo,useState} from 'react'
import {Download,ChevronLeft,ChevronRight} from 'lucide-react'
import {useNavigate} from 'react-router-dom'
import {api,money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {LoadError} from '../components/LoadError'
import {useToast} from '../components/Toast'
import {ausIso, montagIso} from '../lib/datum'
import {appointmentTypeOption, appointmentTypeOptions} from '../lib/appointments'

type BWAppointment = {
  id:string
  day_index:number
  hour:number
  start_at:string
  end_at:string|null
  label:string
  customer_id:string|null
  customer_name:string|null
  start_minutes:number
  end_minutes:number
  duration_minutes:number
  time_label:string
  appointment_type:string
  status:string
}

type BW = {
  employee:{id:string;name:string}
  week_start:string
  week_end:string
  calendar_week:number
  appointments:BWAppointment[]
  days:{date:string;area_target_cents:number|null;area_actual_cents:number;total_target_cents:number|null;total_actual_cents:number;k70_cents:number;units:number}[]
  week_revenue_cents:number
  week_units:number
  monthly_units_target:number
  slots:{label:string;hour:number}[]
  grid:{start_minutes:number;end_minutes:number;step_minutes:number}
  legend:Record<string,string>
}

type Emp={id:string;display_name:string}

const names=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']

/** Wie das Backend, falls eine ältere Antwort ohne Raster ankommt. */
const FALLBACK_GRID={start_minutes:6*60,end_minutes:22*60,step_minutes:15}

function zeitLabel(minuten:number){
  return `${String(Math.floor(minuten/60)).padStart(2,'0')}:${String(minuten%60).padStart(2,'0')}`
}

/**
 * Ein Terminblock im Wochenraster: in welcher Zeile er beginnt und über wie
 * viele Zeilen er sich zieht.
 */
type Block={appointment:BWAppointment;row:number;span:number}

/**
 * Verteilt die Termine eines Tages auf das Zeilenraster.
 *
 * Ein Termin belegt so viele Zeilen, wie er Minuten dauert - eine
 * Viertelstunde eine Zeile, vier Stunden sechzehn. Überschneiden sich zwei
 * Termine, rückt der zweite auf die nächste freie Zeile und endet spätestens
 * dort, wo der nächste beginnt: sichtbar bleiben beide, und die Tabelle
 * behält ihre Zeilenzahl.
 */
export function blockLayout(
  appointments:BWAppointment[],
  grid:{start_minutes:number;end_minutes:number;step_minutes:number},
){
  const rows=Math.max(Math.ceil((grid.end_minutes-grid.start_minutes)/grid.step_minutes),1)
  const belegt:boolean[]=new Array(rows).fill(false)
  const blocks:Block[]=[]

  const sortiert=[...appointments].sort((a,b)=>a.start_minutes-b.start_minutes)
  for(const appointment of sortiert){
    const beginn=Math.floor((appointment.start_minutes-grid.start_minutes)/grid.step_minutes)
    const ende=Math.ceil((appointment.end_minutes-grid.start_minutes)/grid.step_minutes)
    let row=Math.min(Math.max(beginn,0),rows-1)
    while(row<rows&&belegt[row])row++
    if(row>=rows)continue

    let span=1
    while(row+span<rows&&row+span<Math.max(ende,row+1)&&!belegt[row+span])span++
    for(let i=row;i<row+span;i++)belegt[i]=true
    blocks.push({appointment,row,span})
  }
  return {rows,blocks}
}

export function BuntewochePage(){
  const {me}=useAuth()
  const navigate=useNavigate()
  const toast=useToast()
  const [week,setWeek]=useState(montagIso())
  const [employee,setEmployee]=useState(me?.employee?.id||'')
  const [employees,setEmployees]=useState<Emp[]>([])
  const [data,setData]=useState<BW|null>(null)
  const [fehler,setFehler]=useState<string|null>(null)
  const istFuehrung=darfVerwalten(me?.role)

  useEffect(()=>{
    if(!istFuehrung)return
    api<Emp[]>('/team/employees')
      .then(r=>{
        const es=r.map(x=>({id:x.id,display_name:x.display_name}))
        setEmployees(es)
        setEmployee(current=>current||es[0]?.id||'')
      })
      .catch(err=>setFehler(err instanceof Error?err.message:'Die Mitarbeiterliste ist gerade nicht erreichbar.'))
  },[istFuehrung])

  const laden=useCallback(()=>{
    if(!employee)return
    setFehler(null)
    api<BW>(`/buntewoche?week_start=${week}&employee_id=${employee}`)
      .then(setData)
      .catch(err=>{
        setData(null)
        setFehler(err instanceof Error?err.message:'Die Buntewoche ist gerade nicht erreichbar.')
      })
  },[week,employee])

  useEffect(()=>{laden()},[laden])

  const grid=data?.grid||FALLBACK_GRID
  const zeilenProStunde=Math.max(Math.round(60/grid.step_minutes),1)

  // Ein Layout je Wochentag. Ohne das Auswendiglernen würde jede Zeile des
  // Rasters die Terminliste erneut durchlaufen - bei 64 Zeilen und sieben
  // Tagen 448-mal pro Darstellung.
  const layouts=useMemo(()=>{
    const proTag=names.map((_,index)=>(data?.appointments||[]).filter(a=>a.day_index===index))
    return proTag.map(termine=>blockLayout(termine,grid))
  },[data?.appointments,grid])

  const zeilen=Math.max(...layouts.map(l=>l.rows),1)

  // Zeile -> Block, je Tag. Die Tabelle wird zeilenweise gerendert, das
  // Layout entsteht aber terminweise.
  const blockJeZeile=useMemo(()=>layouts.map(layout=>{
    const map=new Map<number,Block>()
    layout.blocks.forEach(block=>map.set(block.row,block))
    return map
  }),[layouts])

  const belegteZeilen=useMemo(()=>layouts.map(layout=>{
    const belegt=new Set<number>()
    layout.blocks.forEach(block=>{
      for(let i=block.row;i<block.row+block.span;i++)belegt.add(i)
    })
    return belegt
  }),[layouts])

  function shift(days:number){
    const d=ausIso(week)
    d.setDate(d.getDate()+days)
    setWeek(montagIso(d))
  }

  /**
   * Öffnet den Termin in der vorhandenen Terminansicht. Bewusst kein
   * eigenes Fenster hier: die Maske unter /termine kann Termine bereits
   * anzeigen, ändern und löschen - eine zweite davon liefe früher oder
   * später auseinander.
   */
  function termineOeffnen(appointment:BWAppointment){
    navigate('/termine',{state:{openAppointmentId:appointment.id}})
  }

  async function pdf(){
    if(!data)return
    const url=`/api/v1/buntewoche/pdf?week_start=${week}&employee_id=${employee}`
    let res:Response
    try{res=await fetch(url,{credentials:'include'})}
    catch{toast('Der PDF-Export ist gerade nicht erreichbar.','error');return}
    if(!res.ok){toast(`PDF-Export fehlgeschlagen (Fehler ${res.status}).`,'error');return}
    const blob=await res.blob()
    const a=document.createElement('a')
    a.href=URL.createObjectURL(blob)
    a.download=`Buntewoche-KW${data.calendar_week}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if(fehler)return <div className="page">
    <div className="page-head"><div><h1>Buntewoche</h1><p>Digitale Wochenübersicht nach der bereitgestellten Tabellenvorlage.</p></div></div>
    <LoadError meldung={fehler} onRetry={laden}/>
  </div>

  if(!data)return <div className="loading">Buntewoche wird geladen…</div>

  return <div className="page">
    <div className="page-head">
      <div><h1>Buntewoche</h1><p>Digitale Wochenübersicht nach der bereitgestellten Tabellenvorlage.</p></div>
      <button className="primary" onClick={pdf}><Download size={18}/> PDF exportieren</button>
    </div>

    <div className="week-toolbar">
      <button onClick={()=>shift(-7)} aria-label="Vorherige Woche"><ChevronLeft/></button>
      <strong>KW {data.calendar_week} · {ausIso(data.week_start).toLocaleDateString('de-DE')} – {ausIso(data.week_end).toLocaleDateString('de-DE')}</strong>
      <button onClick={()=>shift(7)} aria-label="Nächste Woche"><ChevronRight/></button>
      {istFuehrung&&<select aria-label="Mitarbeiter" value={employee} onChange={e=>setEmployee(e.target.value)}>
        {employees.map(e=><option key={e.id} value={e.id}>{e.display_name}</option>)}
      </select>}
    </div>

    <div className="bunte-scroll">
      <table className="bunte bunte-woche">
        <thead>
          <tr>
            <th className="time-col">Uhrzeit</th>
            {names.map((n,i)=><th key={n}>{n}<small>{ausIso(data.days[i].date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</small></th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({length:zeilen},(_,zeile)=>{
            const minute=grid.start_minutes+zeile*grid.step_minutes
            const volleStunde=zeile%zeilenProStunde===0
            return <tr key={zeile} className={volleStunde?'bunte-hour-start':undefined}>
              {volleStunde&&<th className="time-col" rowSpan={Math.min(zeilenProStunde,zeilen-zeile)} scope="row">{zeitLabel(minute)}</th>}
              {names.map((tag,tagIndex)=>{
                const block=blockJeZeile[tagIndex].get(zeile)
                if(block){
                  const {appointment}=block
                  const option=appointmentTypeOption(appointment.appointment_type)
                  const kurz=appointment.duration_minutes<45
                  return <td key={tag} className="bunte-block-cell" rowSpan={block.span}>
                    <button
                      type="button"
                      className={`bunte-appt${kurz?' is-short':''}`}
                      style={{background:option.color}}
                      onClick={()=>termineOeffnen(appointment)}
                      title={`${appointment.label} · ${appointment.time_label} · ${option.label}`}
                    >
                      <strong>{appointment.customer_name||appointment.label}</strong>
                      <span className="bunte-appt-time">{zeitLabel(appointment.start_minutes)}</span>
                      <span className="bunte-appt-range">{appointment.time_label}</span>
                    </button>
                  </td>
                }
                if(belegteZeilen[tagIndex].has(zeile))return null
                return <td key={tag} className="bunte-free"/>
              })}
            </tr>
          })}
        </tbody>
      </table>

      <table className="bunte metrics">
        <tbody>
          <tr><th>Festgebietsumsatz Soll</th>{data.days.map(d=><td key={d.date}>{money(d.area_target_cents)}</td>)}</tr>
          <tr><th>Festgebietsumsatz Ist</th>{data.days.map(d=><td key={d.date}>{money(d.area_actual_cents)}</td>)}</tr>
          <tr><th>Gesamtumsatz Soll</th>{data.days.map(d=><td key={d.date}>{money(d.total_target_cents)}</td>)}</tr>
          <tr><th>Gesamtumsatz Ist</th>{data.days.map(d=><td key={d.date}>{money(d.total_actual_cents)}</td>)}</tr>
          <tr><th>K70 Umsätze pro Tag</th>{data.days.map(d=><td key={d.date}>{money(d.k70_cents)}</td>)}</tr>
          <tr><th>Einheiten pro Tag</th>{data.days.map(d=><td key={d.date}>{d.units}</td>)}</tr>
        </tbody>
      </table>
    </div>

    <div className="bunte-summary card">
      <strong>Woche: {money(data.week_revenue_cents)}</strong>
      <span>{data.week_units} Einheiten diese Woche · Monatsziel: {data.monthly_units_target} Einheiten</span>
    </div>

    <div className="legend">
      {appointmentTypeOptions.map(option=><span key={option.value}><i style={{background:option.color}}/>{option.label}</span>)}
    </div>
  </div>
}
