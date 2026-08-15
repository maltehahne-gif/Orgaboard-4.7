import {useCallback,useEffect,useState} from 'react'
import {api,formatDateTime,money} from '../lib/api'
import {Modal} from '../components/Modal'
import {LoadError} from '../components/LoadError'

type E={id:string;display_name:string;position:string;revenue_today_cents:number;revenue_week_cents:number;revenue_month_cents:number;units_week:number;units_target:number;units_missing:number;units_percent:number;appointments_week:number;sales_week:number;presentations_week:number;active_rentals:number}
type Detail={dashboard:any;sales:any[];appointments:any[];rentals:any[]}

export function TeamPage(){
  const [rows,setRows]=useState<E[]>([])
  const [fehler,setFehler]=useState<string|null>(null)
  const [geladen,setGeladen]=useState(false)
  const [selected,setSelected]=useState<E|null>(null)
  const [detail,setDetail]=useState<Detail|null>(null)
  const [detailFehler,setDetailFehler]=useState<string|null>(null)

  const laden=useCallback(()=>{
    setFehler(null)
    setGeladen(false)
    api<E[]>('/team/employees')
      .then(daten=>{setRows(daten);setGeladen(true)})
      .catch(err=>{setFehler(err instanceof Error?err.message:'Die Mitarbeiterübersicht ist gerade nicht erreichbar.');setGeladen(true)})
  },[])

  useEffect(()=>{laden()},[laden])

  const detailsLaden=useCallback(async(e:E)=>{
    setDetail(null)
    setDetailFehler(null)
    try{
      const [dashboard,sales,appointments,rentals]=await Promise.all([
        api(`/dashboard?employee_id=${e.id}`),
        api<any[]>(`/sales?employee_id=${e.id}`),
        api<any[]>(`/appointments?employee_id=${e.id}`),
        api<any[]>(`/rentals?employee_id=${e.id}`),
      ])
      setDetail({dashboard,sales,appointments,rentals})
    }catch(err){
      // Ohne diese Meldung bliebe das Fenster für immer bei "wird geladen".
      setDetailFehler(err instanceof Error?err.message:'Die Details konnten nicht geladen werden.')
    }
  },[])

  function open(e:E){setSelected(e);detailsLaden(e)}

  return <div className="page">
    <div className="page-head"><div><h1>Mitarbeiterübersicht</h1><p>Teamleistung je Mitarbeiter. Eine Zeile öffnet die Detailansicht.</p></div></div>
    {fehler&&<LoadError meldung={fehler} onRetry={laden}/>}
    <div className="table-card wide"><table><thead><tr><th>Mitarbeiter</th><th>Wochenumsatz</th><th>Monat</th><th>Einheiten</th><th>Ziel</th><th>Termine</th><th>Verkäufe</th><th>Vorstellungen</th><th>Verleih</th></tr></thead><tbody>{rows.map(e=><tr className="clickable" key={e.id} onClick={()=>open(e)}><td><strong>{e.display_name}</strong><small>{e.position}</small></td><td>{money(e.revenue_week_cents)}</td><td>{money(e.revenue_month_cents)}</td><td>{e.units_week}</td><td><div className="mini-progress"><span style={{width:`${Math.min(e.units_percent,100)}%`}}/></div>{e.units_percent}%</td><td>{e.appointments_week}</td><td>{e.sales_week}</td><td>{e.presentations_week}</td><td>{e.active_rentals}</td></tr>)}</tbody></table></div>
    {!geladen&&!fehler&&<div className="loading">Mitarbeiter werden geladen…</div>}
    {geladen&&!fehler&&!rows.length&&<div className="empty card">Diesem Team sind noch keine Mitarbeiter zugeordnet.</div>}
    {selected&&<Modal title={`Mitarbeiter · ${selected.display_name}`} onClose={()=>{setSelected(null);setDetail(null);setDetailFehler(null)}}>
      {detailFehler
        ?<LoadError meldung={detailFehler} onRetry={()=>detailsLaden(selected)}/>
        :detail?<div className="team-detail"><div className="stat-grid"><div className="stat-card green"><small>Woche</small><strong>{money(selected.revenue_week_cents)}</strong></div><div className="stat-card"><small>Einheiten</small><strong>{selected.units_week}</strong></div><div className="stat-card"><small>Termine</small><strong>{selected.appointments_week}</strong></div><div className="stat-card"><small>Verleih</small><strong>{selected.active_rentals}</strong></div></div><h3>Nächster Termin</h3><p>{detail.dashboard.next_appointment?`${detail.dashboard.next_appointment.customer_name} · ${formatDateTime(detail.dashboard.next_appointment.start_at)}`:'Kein kommender Termin'}</p><h3>Letzte Verkäufe</h3>{detail.sales.slice(0,5).map(s=><div className="list-row" key={s.id}><span>{s.customer_name}<small>{formatDateTime(s.sold_at)}</small></span><strong>{money(s.total_cents)}</strong></div>)}<h3>Aktive Verleihgeräte</h3>{detail.rentals.filter(r=>r.status!=='returned').slice(0,5).map(r=><div className="list-row" key={r.id}><span>{r.product_name} · {r.customer_name}</span><small>{formatDateTime(r.due_at)}</small></div>)}</div>
        :<div className="loading">Details werden geladen…</div>}
    </Modal>}
  </div>
}
