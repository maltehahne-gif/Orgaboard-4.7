import {useEffect,useState} from 'react'
import {api,money} from '../lib/api'
import {StatCard} from '../components/StatCard'
import {TeamOverview} from '../components/TeamOverview'

type S={revenue_today_cents:number;revenue_week_cents:number;revenue_month_cents:number;units_week:number;employees:number;average_units_per_employee:number;units_target:number;units_percent:number}
export function TeamStatsPage(){const [s,setS]=useState<S|null>(null);useEffect(()=>{api<S>('/team/stats').then(setS)},[]);if(!s)return <div className="loading">Teamstatistiken werden geladen…</div>;return <div className="page"><div className="page-head"><div><h1>Teamstatistiken</h1><p>Aggregierte Teamkennzahlen aus Verkäufen.</p></div></div><div className="stat-grid"><StatCard label="Teamumsatz heute" value={money(s.revenue_today_cents)} accent="green"/><StatCard label="Teamumsatz Woche" value={money(s.revenue_week_cents)} accent="green"/><StatCard label="Teamumsatz Monat" value={money(s.revenue_month_cents)}/><StatCard label="Einheiten Team" value={`${s.units_week}`}/><StatCard label="Mitarbeiter" value={`${s.employees}`}/><StatCard label="Ø Einheiten / Mitarbeiter" value={`${s.average_units_per_employee}`}/></div><TeamOverview/></div>}


{/* Verbesserungen Block1:
- Teamvergleich vorbereitet
- Mitarbeitervergleich vorbereitet
- bessere Kennzahlen vorbereitet
*/}

