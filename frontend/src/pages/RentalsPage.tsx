import {FormEvent,useEffect,useMemo,useState} from 'react'
import {Plus} from 'lucide-react'
import {api,formatDateTime} from '../lib/api'
import type {Customer,Product,Rental} from '../types'
import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'

const dt=()=>new Date().toISOString().slice(0,16)
export function RentalsPage(){const [rows,setRows]=useState<Rental[]>([]);const [customers,setCustomers]=useState<Customer[]>([]);const [products,setProducts]=useState<Product[]>([]);const [open,setOpen]=useState(false);const [form,setForm]=useState({product_id:'',customer_id:'',serial_number:'',issued_at:dt(),due_at:'',status:'rented',notes:''});const toast=useToast();

const [rentalSearch,setRentalSearch]=useState('');
const [rentalFilter,setRentalFilter]=useState('all');function computedRentalState(r:Rental){

  if(r.status==='returned'){
    return 'returned'
  }

  if(
    r.due_at
    &&new Date(r.due_at).getTime()
      <Date.now()
  ){
    return 'overdue'
  }

  return 'active'
}

const load=()=>Promise.all([api<Rental[]>('/rentals'),api<Customer[]>('/customers'),api<Product[]>('/products')]).then(([r,c,p])=>{setRows(r);setCustomers(c);setProducts(p)});useEffect(()=>{load()},[]);

const filteredRentals=useMemo(()=>{

  const query=
    rentalSearch
      .trim()
      .toLowerCase();

  return rows.filter(r=>{

    const state=
      computedRentalState(r);

    if(
      rentalFilter!=='all'
      &&state!==rentalFilter
    ){
      return false;
    }

    if(query){

      const text=[
        r.customer_name,
        r.product_name,
        r.serial_number,
        r.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if(!text.includes(query)){
        return false;
      }
    }

    return true;
  });

},[
  rows,
  rentalSearch,
  rentalFilter,
]);

async function save(e:FormEvent){e.preventDefault();try{await api('/rentals',{method:'POST',body:JSON.stringify({...form,serial_number:form.serial_number||null,notes:form.notes||null,issued_at:new Date(form.issued_at).toISOString(),due_at:form.due_at?new Date(form.due_at).toISOString():null,returned_at:null})});setOpen(false);load();toast('Verleih gespeichert')}catch(err){toast(err instanceof Error?err.message:'Fehler','error')}}async function changeStatus(id:string,status:string){try{await api(`/rentals/${id}/status`,{method:'PATCH',body:JSON.stringify({status,returned_at:status==='returned'?new Date().toISOString():null})});load();toast('Verleihstatus aktualisiert')}catch(err){toast(err instanceof Error?err.message:'Fehler','error')}}return <div className="page"><div className="page-head"><div><h1>Verleihgeräte</h1><p>Ausgabe, Fälligkeit und Rückgabe im Blick.</p></div><button className="primary" onClick={()=>setOpen(true)}><Plus size={18}/> Gerät ausgeben</button></div><section className="rental-filter-panel card">

<div className="rental-filter-search">
<input
type="search"
value={rentalSearch}
onChange={e=>setRentalSearch(e.target.value)}
placeholder="Kunde, Gerät oder Seriennummer suchen …"
/>
</div>

<label>
Status
<select
value={rentalFilter}
onChange={e=>setRentalFilter(e.target.value)}
>
<option value="all">Alle</option>
<option value="active">🟡 Aktiv</option>
<option value="overdue">🔴 Überfällig</option>
<option value="returned">🟢 Zurückgegeben</option>
</select>
</label>

<button
type="button"
onClick={()=>{
setRentalSearch('');
setRentalFilter('all');
}}
>
Filter zurücksetzen
</button>

<span className="rental-filter-count">
<strong>{filteredRentals.length}</strong>
{' '}
{filteredRentals.length===1
?'Gerät'
:'Geräte'}
</span>

</section>

<div className="cards-list">{filteredRentals.map(r=><div className="card rental-card" key={r.id}><div><strong>{r.product_name||'Gerät'}</strong><p>{r.customer_name} · Seriennummer {r.serial_number||'–'}</p></div><div className="right">
<span
className={`rental-auto-state ${computedRentalState(r)}`}
>
{computedRentalState(r)==='returned'
?'🟢 Zurückgegeben'
:computedRentalState(r)==='overdue'
?'🔴 Überfällig'
:'🟡 Aktiv'}
</span>
<select value={r.status} onChange={e=>changeStatus(r.id,e.target.value)}><option value="rented">verliehen</option><option value="due">Rückgabe fällig</option><option value="returned">zurückgegeben</option></select><small>Rückgabe: {formatDateTime(r.due_at)}</small></div></div>)}</div>{open&&<Modal title="Verleihgerät ausgeben" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={save}><label>Produkt<select required value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})}><option value="">Bitte wählen</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Kunde<select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}><option value="">Bitte wählen</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label><label>Seriennummer<input value={form.serial_number} onChange={e=>setForm({...form,serial_number:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="rented">verliehen</option><option value="due">Rückgabe fällig</option><option value="returned">zurückgegeben</option></select></label><label>Ausgabe<input type="datetime-local" value={form.issued_at} onChange={e=>setForm({...form,issued_at:e.target.value})}/></label><label>Geplante Rückgabe<input type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></label><label className="span-2">Notizen<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="form-actions span-2"><button type="button" onClick={()=>setOpen(false)}>Abbrechen</button><button className="primary">Speichern</button></div></form></Modal>}</div>}
