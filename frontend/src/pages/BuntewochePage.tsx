import {useCallback,useEffect,useMemo,useState} from 'react'
import {Download,ChevronLeft,ChevronRight} from 'lucide-react'
import {api,downloadFile,money} from '../lib/api'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {LoadError} from '../components/LoadError'
import {useToast} from '../components/Toast'
import {ausIso, montagIso} from '../lib/datum'

type BW={employee:{id:string;name:string};week_start:string;week_end:string;calendar_week:number;appointments:{id:string;day_index:number;hour:number;start_at:string;end_at:string|null;label:string;appointment_type:string;status:string}[];days:{date:string;area_target_cents:number|null;area_actual_cents:number;total_target_cents:number|null;total_actual_cents:number;k70_cents:number;units:number}[];week_revenue_cents:number;week_units:number;monthly_units_target:number;slots:{label:string;hour:number}[];legend:Record<string,string>}
type Emp={id:string;display_name:string}
const names=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']
export function BuntewochePage(){const {me}=useAuth();const [week,setWeek]=useState(montagIso());const [employee,setEmployee]=useState(me?.employee?.id||'');const [employees,setEmployees]=useState<Emp[]>([]);const [data,setData]=useState<BW|null>(null);const [fehler,setFehler]=useState<string|null>(null);const [pdfBusy,setPdfBusy]=useState(false);const toast=useToast();useEffect(()=>{if(darfVerwalten(me?.role))api<any[]>('/team/employees').then(r=>{const es=r.map(x=>({id:x.id,display_name:x.display_name}));setEmployees(es);if(!employee&&es[0])setEmployee(es[0].id)}).catch(err=>setFehler(err instanceof Error?err.message:'Die Mitarbeiterliste ist gerade nicht erreichbar.'))},[me?.role]);const laden=useCallback(()=>{if(!employee)return;setFehler(null);api<BW>(`/buntewoche?week_start=${week}&employee_id=${employee}`).then(setData).catch(err=>{setData(null);setFehler(err instanceof Error?err.message:'Die Buntewoche ist gerade nicht erreichbar.')})},[week,employee]);useEffect(()=>{laden()},[laden]);/* Je Zelle eine Liste, nicht ein einzelner Termin: 10:00 und 10:30
     fallen in dieselbe Stunde, und mit einem einzelnen Wert überschrieb der
     zweite den ersten - er verschwand kommentarlos aus der Woche.
     Termine außerhalb der Standardzeiten (vor der ersten, nach der letzten
     Zeile) bekommen eine eigene Randzeile, statt gar keine zu finden. */
  const {randFrueh,randSpaet,cells}=useMemo(()=>{
    const m=new Map<string,BW['appointments']>()
    const stunden=(data?.slots||[]).map(s=>s.hour)
    const erste=stunden.length?Math.min(...stunden):0
    const letzte=stunden.length?Math.max(...stunden):23
    let frueh=false
    let spaet=false

    const sortiert=[...(data?.appointments||[])].sort((a,b)=>a.start_at.localeCompare(b.start_at))
    for(const a of sortiert){
      let schluessel:string
      if(a.hour<erste){schluessel=`${a.day_index}-frueh`;frueh=true}
      else if(a.hour>letzte){schluessel=`${a.day_index}-spaet`;spaet=true}
      else schluessel=`${a.day_index}-${a.hour}`
      m.set(schluessel,[...(m.get(schluessel)||[]),a])
    }
    return {randFrueh:frueh,randSpaet:spaet,cells:m}
  },[data]);function shift(days:number){const d=ausIso(week);d.setDate(d.getDate()+days);setWeek(montagIso(d))}/* Über downloadFile statt eigenem fetch: dort steckt die Basis-URL aus der
     Konfiguration (ein fest eingetragenes /api/v1 lief bei abweichender
     VITE_API_BASE ins Leere), und die Fehlermeldung des Servers kommt als
     lesbarer Satz zurück statt nur als Statuscode. pdfBusy verhindert
     zusätzlich, dass ein zweiter Klick eine zweite Erzeugung anstößt. */
  async function pdf(){
    if(!data||pdfBusy)return
    setPdfBusy(true)
    try{
      await downloadFile(
        `/buntewoche/pdf?week_start=${week}&employee_id=${employee}`,
        `Buntewoche-KW${data.calendar_week}.pdf`,
      )
    }catch(err){
      toast(err instanceof Error?err.message:'Der PDF-Export ist gerade nicht erreichbar.','error')
    }finally{
      setPdfBusy(false)
    }
  }function zeile(label:string,schluessel:string){
    return <tr key={schluessel}><th>{label}</th>{names.map((_,day)=>{
      const termine=cells.get(`${day}-${schluessel}`)||[]
      const erster=termine[0]
      return <td key={day} className={erster?`appt-cell ${erster.appointment_type}`:''}>
        {termine.map(a=><span key={a.id} className="bunte-termin">
          <strong>{new Date(a.start_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</strong>
          <span>{a.label}</span>
        </span>)}
      </td>
    })}</tr>
  }

  if(fehler)return <div className="page"><div className="page-head"><div><h1>Buntewoche</h1><p>Digitale Wochenübersicht nach der bereitgestellten Tabellenvorlage.</p></div></div><LoadError meldung={fehler} onRetry={laden}/></div>;if(!data)return <div className="loading">Buntewoche wird geladen…</div>;return <div className="page"><div className="page-head"><div><h1>Buntewoche</h1><p>Digitale Wochenübersicht nach der bereitgestellten Tabellenvorlage.</p></div><button className="primary" onClick={pdf} disabled={pdfBusy}><Download size={18}/> {pdfBusy?'PDF wird erstellt…':'PDF exportieren'}</button></div><div className="week-toolbar"><button onClick={()=>shift(-7)}><ChevronLeft/></button><strong>KW {data.calendar_week} · {ausIso(data.week_start).toLocaleDateString('de-DE')} – {ausIso(data.week_end).toLocaleDateString('de-DE')}</strong><button onClick={()=>shift(7)}><ChevronRight/></button>{darfVerwalten(me?.role)&&<select value={employee} onChange={e=>setEmployee(e.target.value)}>{employees.map(e=><option key={e.id} value={e.id}>{e.display_name}</option>)}</select>}</div><div className="bunte-scroll"><table className="bunte"><thead><tr><th className="time-col">Uhrzeit</th>{names.map((n,i)=><th key={n}>{n}<small>{ausIso(data.days[i].date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</small></th>)}</tr></thead><tbody>{randFrueh&&zeile('vor der ersten Zeit','frueh')}{data.slots.map(slot=>zeile(slot.label,String(slot.hour)))}{randSpaet&&zeile('nach der letzten Zeit','spaet')}</tbody></table><table className="bunte metrics"><tbody><tr><th>Festgebietsumsatz Soll</th>{data.days.map(d=><td key={d.date}>{money(d.area_target_cents)}</td>)}</tr><tr><th>Festgebietsumsatz Ist</th>{data.days.map(d=><td key={d.date}>{money(d.area_actual_cents)}</td>)}</tr><tr><th>Gesamtumsatz Soll</th>{data.days.map(d=><td key={d.date}>{money(d.total_target_cents)}</td>)}</tr><tr><th>Gesamtumsatz Ist</th>{data.days.map(d=><td key={d.date}>{money(d.total_actual_cents)}</td>)}</tr><tr><th>K70 Umsätze pro Tag</th>{data.days.map(d=><td key={d.date}>{money(d.k70_cents)}</td>)}</tr><tr><th>Einheiten pro Tag</th>{data.days.map(d=><td key={d.date}>{d.units}</td>)}</tr></tbody></table></div><div className="bunte-summary card"><strong>Woche: {money(data.week_revenue_cents)}</strong><span>{data.week_units} Einheiten diese Woche · Monatsziel: {data.monthly_units_target} Einheiten</span></div><div className="legend"><span><i className="promotion"/>Termin Promotion / Messe</span><span><i className="recommendation"/>Termin Empfehlung</span><span><i className="premium_checkin"/>Premium Check-in</span><span><i className="customer"/>Termin Kundendaten</span><span><i className="team"/>Team</span><span><i className="telephone"/>Telefonie</span></div></div>}
