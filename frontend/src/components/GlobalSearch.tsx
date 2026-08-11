import {Search, X} from 'lucide-react'
import {useEffect,useState} from 'react'
import {api} from '../lib/api'

type Result={kind:string;id:string;title:string;subtitle:string}
export function GlobalSearch(){const [q,setQ]=useState('');const [results,setResults]=useState<Result[]>([]);useEffect(()=>{const t=setTimeout(()=>{if(q.trim().length<2){setResults([]);return}api<Result[]>(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(()=>setResults([]))},250);return()=>clearTimeout(t)},[q]);return <div className="global-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Kunden, Produkte, Termine, Verkäufe suchen…"/>{q&&<button className="icon-button" onClick={()=>setQ('')}><X size={15}/></button>}{results.length>0&&<div className="search-popover">{results.map(r=><div key={`${r.kind}-${r.id}`} className="search-result"><span className="badge">{r.kind}</span><div><strong>{r.title}</strong><small>{r.subtitle}</small></div></div>)}</div>}</div>}
