import {FormEvent,useEffect,useState} from 'react'
import {Pencil,Plus,Search,Trash2} from 'lucide-react'
import {api} from '../lib/api'
import type {Customer} from '../types'
import {Modal} from '../components/Modal'
import {useToast} from '../components/Toast'

const blank={first_name:'',last_name:'',street:'',house_number:'',postal_code:'',city:'',phone:'',email:'',notes:''}
export function CustomersPage(){
  const [rows,setRows]=useState<Customer[]>([]);const [q,setQ]=useState('');const [open,setOpen]=useState(false);const [editId,setEditId]=useState<string|null>(null);const [form,setForm]=useState(blank);const toast=useToast();
  const load=()=>api<Customer[]>(`/customers${q?`?q=${encodeURIComponent(q)}`:''}`).then(setRows)
  useEffect(()=>{const t=setTimeout(load,180);return()=>clearTimeout(t)},[q])
  function create(){setEditId(null);setForm(blank);setOpen(true)}
  function edit(c:Customer){setEditId(c.id);setForm({first_name:c.first_name,last_name:c.last_name,street:c.street,house_number:c.house_number,postal_code:c.postal_code,city:c.city,phone:c.phone||'',email:c.email||'',notes:c.notes||''});setOpen(true)}
  async function removeCustomer(c:Customer){
    if(!window.confirm(`Kunde ${c.full_name} wirklich löschen?

Der Kunde verschwindet aus der Kundenliste.
Bereits vorhandene Verkäufe und historische Daten bleiben erhalten.`)) return;

    try{
      await api(`/customers/${c.id}`,{method:'DELETE'});
      toast('Kunde wurde gelöscht');
      load();
    }catch(err){
      toast(err instanceof Error?err.message:'Kunde konnte nicht gelöscht werden','error');
    }
  }

  async function save(e:FormEvent){e.preventDefault();try{await api(editId?`/customers/${editId}`:'/customers',{method:editId?'PUT':'POST',body:JSON.stringify({...form,email:form.email||null,phone:form.phone||null})});setOpen(false);setForm(blank);setEditId(null);load();toast(editId?'Kunde aktualisiert':'Kunde gespeichert')}catch(err){toast(err instanceof Error?err.message:'Fehler','error')}}
  return <div className="page"><div className="page-head"><div><h1>Kunden</h1><p>Eigene Kundendaten; Teamleiter sehen den Teamumfang.</p></div><button className="primary" onClick={create}><Plus size={18}/> Kunde anlegen</button></div><div className="toolbar"><div className="search-field"><Search size={17}/><input placeholder="Kunde suchen…" value={q} onChange={e=>setQ(e.target.value)}/></div></div><div className="table-card"><table><thead><tr><th>Name</th><th>Adresse</th><th>Telefon</th><th>E-Mail</th><th/></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.full_name}</strong></td><td>{c.address||'–'}</td><td>{c.phone||'–'}</td><td>{c.email||'–'}</td><td>
<button className="icon-button" onClick={()=>edit(c)} title="Bearbeiten"><Pencil size={16}/></button>
<button className="icon-button delete-icon" onClick={()=>removeCustomer(c)} title="Kunde löschen"><Trash2 size={16}/></button>
</td></tr>)}</tbody></table>{!rows.length&&<div className="empty">Keine Kunden gefunden.</div>}</div>{open&&<Modal title={editId?'Kunde bearbeiten':'Neuen Kunden anlegen'} onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={save}><label>Vorname<input required value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></label><label>Nachname<input required value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></label><label>Straße<input value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label><label>Hausnummer<input value={form.house_number} onChange={e=>setForm({...form,house_number:e.target.value})}/></label><label>PLZ<input value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value})}/></label><label>Ort<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>Telefon<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>E-Mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="span-2">Notizen<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="form-actions span-2"><button type="button" onClick={()=>setOpen(false)}>Abbrechen</button><button className="primary">Speichern</button></div></form></Modal>}</div>
}
