import {useCallback,useEffect,useState} from 'react'
import {api,formatDateTime,money} from '../lib/api'
import {LoadError} from '../components/LoadError'

type Row={customer_id:string;name:string;address:string;phone:string|null;email:string|null;purchased_products:{name:string;quantity:number;unit_price_cents:number;sold_at:string}[]}

export function HistoryPage(){
  const [rows,setRows]=useState<Row[]>([])
  const [fehler,setFehler]=useState<string|null>(null)
  const [geladen,setGeladen]=useState(false)

  const laden=useCallback(()=>{
    setFehler(null)
    setGeladen(false)
    api<Row[]>('/history')
      .then(daten=>{setRows(daten);setGeladen(true)})
      .catch(err=>{setFehler(err instanceof Error?err.message:'Der Verlauf ist gerade nicht erreichbar.');setGeladen(true)})
  },[])

  useEffect(()=>{laden()},[laden])

  return <div className="page">
    <div className="page-head"><div><h1>Verlauf</h1><p>Kundendaten und relevante Verkaufsinformationen.</p></div></div>
    {fehler&&<LoadError meldung={fehler} onRetry={laden}/>}
    <div className="history-grid">{rows.map(r=><section className="card" key={r.customer_id}><h2>{r.name}</h2><p>{r.address||'Keine Adresse hinterlegt'}</p><small>{r.phone||'–'} · {r.email||'–'}</small><div className="divider"/><strong>Gekauft</strong>{r.purchased_products.length?r.purchased_products.map((p,i)=><div className="list-row" key={i}><span>{p.quantity}× {p.name}<small>{formatDateTime(p.sold_at)}</small></span><strong>{money(p.unit_price_cents*p.quantity)}</strong></div>):<p>Keine Verkäufe hinterlegt.</p>}</section>)}</div>
    {!geladen&&!fehler&&<div className="loading">Verlauf wird geladen…</div>}
    {geladen&&!fehler&&!rows.length&&<div className="empty card">Noch keine relevante Kundenhistorie vorhanden.</div>}
  </div>
}
