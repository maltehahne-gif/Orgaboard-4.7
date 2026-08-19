import {FormEvent,useEffect,useMemo,useState} from 'react'
import {AlertTriangle,Clock,Plus} from 'lucide-react'
import {api,formatDateTime} from '../lib/api'
import type {Customer,Product,Rental} from '../types'
import {Modal} from '../components/Modal'
import {RentalDevices} from '../components/RentalDevices'
import {LoadError} from '../components/LoadError'
import {useToast} from '../components/Toast'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'
import {jetztLokal,zeiteingabeZuIso} from '../lib/datum'

type RentalEmployee={id:string;display_name:string}

const leeresFormular=()=>({product_id:'',customer_id:'',employee_id:'',serial_number:'',issued_at:jetztLokal(),due_at:'',status:'rented',notes:''})
export function RentalsPage(){const {me}=useAuth();const isTeamLeader=darfVerwalten(me?.role);const [rows,setRows]=useState<Rental[]>([]);const [customers,setCustomers]=useState<Customer[]>([]);const [products,setProducts]=useState<Product[]>([]);const [employees,setEmployees]=useState<RentalEmployee[]>([]);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [statusBusyId,setStatusBusyId]=useState<string|null>(null);const [form,setForm]=useState(leeresFormular());const [summary,setSummary]=useState<{active:number;overdue:number;due_soon:number;reminder_days:number}|null>(null);const [ladefehler,setLadefehler]=useState<string|null>(null);const toast=useToast();

useEffect(()=>{if(!isTeamLeader){setEmployees([]);return}api<RentalEmployee[]>('/team/employees').then(setEmployees).catch(()=>setEmployees([]))},[isTeamLeader]);

const [rentalSearch,setRentalSearch]=useState('');
const [ansicht,setAnsicht]=useState<'vorgaenge'|'geraete'>('vorgaenge');
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

const load=()=>Promise.all([api<Rental[]>('/rentals'),api<Customer[]>('/customers'),api<Product[]>('/products'),api<{active:number;overdue:number;due_soon:number;reminder_days:number}>('/rentals/summary')]).then(([r,c,p,s])=>{setRows(r);setCustomers(c);setProducts(p);setSummary(s);setLadefehler(null)}).catch(err=>setLadefehler(err instanceof Error?err.message:'Die Verleihdaten sind gerade nicht erreichbar.'));useEffect(()=>{load()},[]);

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

async function save(e:FormEvent){e.preventDefault();if(busy)return;if(isTeamLeader&&!form.employee_id){toast('Bitte einen Mitarbeiter auswählen.','error');return}setBusy(true);try{await api('/rentals',{method:'POST',body:JSON.stringify({...form,employee_id:isTeamLeader?form.employee_id:null,serial_number:form.serial_number||null,notes:form.notes||null,issued_at:zeiteingabeZuIso(form.issued_at),due_at:form.due_at?zeiteingabeZuIso(form.due_at):null,returned_at:null})});setOpen(false);load();toast('Verleih gespeichert')}catch(err){toast(err instanceof Error?err.message:'Fehler','error')}finally{setBusy(false)}}/* statusBusyId sperrt genau das eine Gerät, dessen Status gerade gesetzt
     wird. Ohne die Sperre lösen zwei schnelle Änderungen zwei Anfragen aus,
     und welche zuletzt ankommt, entscheidet über den gespeicherten Status -
     bei "zurückgegeben" ist das der Unterschied zwischen abgeschlossen und
     weiter verliehen. */
  async function changeStatus(id:string,status:string){
    if(statusBusyId===id)return
    setStatusBusyId(id)
    try{
      await api(`/rentals/${id}/status`,{method:'PATCH',body:JSON.stringify({status,returned_at:status==='returned'?new Date().toISOString():null})})
      load()
      toast('Verleihstatus aktualisiert')
    }catch(err){
      toast(err instanceof Error?err.message:'Verleihstatus konnte nicht geändert werden','error')
      // Zurück auf den Stand des Servers - sonst zeigt die Auswahl einen
      // Status an, der nie gespeichert wurde.
      load()
    }finally{
      setStatusBusyId(null)
    }
  }
  return <div className="page"><div className="page-head"><div><h1>Verleihgeräte</h1><p>Ausgabe, Fälligkeit und Rückgabe im Blick.</p></div><button className="primary" onClick={()=>{setForm(leeresFormular());setOpen(true)}}><Plus size={18}/> Gerät ausgeben</button></div>{ladefehler&&<LoadError meldung={ladefehler} onRetry={load}/>}{summary&&(summary.overdue>0||summary.due_soon>0)&&
  <div className={summary.overdue>0?'rental-warning overdue':'rental-warning'}>
    <AlertTriangle size={17}/>
    <div>
      <strong>
        {summary.overdue>0
          ? `${summary.overdue} Gerät${summary.overdue===1?'':'e'} überfällig`
          : `${summary.due_soon} Rückgabe${summary.due_soon===1?'':'n'} in den nächsten ${summary.reminder_days} Tagen`}
      </strong>
      {summary.overdue>0&&summary.due_soon>0&&
        <span>Zusätzlich {summary.due_soon} in den nächsten {summary.reminder_days} Tagen fällig.</span>
      }
    </div>
  </div>
}<div className="rental-tabs">
<button
type="button"
className={ansicht==='vorgaenge'?'plain-button is-active':'plain-button'}
onClick={()=>setAnsicht('vorgaenge')}
>
Vorgänge
</button>
<button
type="button"
className={ansicht==='geraete'?'plain-button is-active':'plain-button'}
onClick={()=>setAnsicht('geraete')}
>
Geräte
</button>
</div>

{ansicht==='geraete'?<RentalDevices/>:<>

<section className="rental-filter-panel card">

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

<div className="cards-list">{filteredRentals.map(r=><div className={r.is_overdue?'card rental-card is-overdue':r.due_soon?'card rental-card is-due-soon':'card rental-card'} key={r.id}><div><strong>{r.product_name||'Gerät'}</strong>
{r.is_overdue&&<span className="rental-flag overdue"><AlertTriangle size={13}/> {r.days_overdue} {r.days_overdue===1?'Tag':'Tage'} überfällig</span>}
{!r.is_overdue&&r.due_soon&&<span className="rental-flag soon"><Clock size={13}/> {r.days_until_due===0?'heute fällig':`in ${r.days_until_due} ${r.days_until_due===1?'Tag':'Tagen'}`}</span>}
<p>{r.customer_name} · Seriennummer {r.serial_number||'–'}</p></div><div className="right">
<span
className={`rental-auto-state ${computedRentalState(r)}`}
>
{computedRentalState(r)==='returned'
?'🟢 Zurückgegeben'
:computedRentalState(r)==='overdue'
?'🔴 Überfällig'
:'🟡 Aktiv'}
</span>
<select aria-label={`Status von ${r.product_name} bei ${r.customer_name}`} value={r.status} disabled={statusBusyId===r.id} onChange={e=>changeStatus(r.id,e.target.value)}><option value="rented">verliehen</option><option value="due">Rückgabe fällig</option><option value="returned">zurückgegeben</option></select><small>Rückgabe: {formatDateTime(r.due_at)}</small></div></div>)}</div>

</>}

{open&&<Modal title="Verleihgerät ausgeben" onClose={()=>setOpen(false)} closeDisabled={busy}><form className="form-grid" onSubmit={save}>{isTeamLeader&&<label>Mitarbeiter<select required value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})}><option value="">Mitarbeiter auswählen</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.display_name}</option>)}</select></label>}<label>Produkt<select required value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})}><option value="">Bitte wählen</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Kunde<select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}><option value="">Bitte wählen</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label><label>Seriennummer<input value={form.serial_number} onChange={e=>setForm({...form,serial_number:e.target.value})}/></label><label>Status
{/* Ein neuer Verleih beginnt sinnvollerweise nicht bereits als
    "zurückgegeben" - dafür gibt es den Statuswechsel an einem
    bestehenden Vorgang. */}
<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="rented">verliehen</option><option value="due">Rückgabe fällig</option></select></label><label>Ausgabe<input type="datetime-local" value={form.issued_at} onChange={e=>setForm({...form,issued_at:e.target.value})}/></label><label>Geplante Rückgabe<input type="datetime-local" value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})}/></label><label className="span-2">Notizen<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="form-actions span-2"><button type="button" onClick={()=>setOpen(false)} disabled={busy}>Abbrechen</button><button className="primary" disabled={busy}>{busy?'Speichern…':'Speichern'}</button></div></form></Modal>}</div>}
