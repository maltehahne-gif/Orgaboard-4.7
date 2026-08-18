import {FormEvent,useEffect,useRef,useState} from 'react'
import {Mail,Phone,Pencil,Plus,Search,Trash2,Upload} from 'lucide-react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {api} from '../lib/api'
import type {Customer} from '../types'
import {Modal} from '../components/Modal'
import {LoadError} from '../components/LoadError'
import {useToast} from '../components/Toast'

const blank={first_name:'',last_name:'',street:'',house_number:'',postal_code:'',city:'',phone:'',email:'',notes:''}
export function CustomersPage(){
  const [rows,setRows]=useState<Customer[]>([]);const [q,setQ]=useState('');const [open,setOpen]=useState(false);const [editId,setEditId]=useState<string|null>(null);const [form,setForm]=useState(blank);const [busy,setBusy]=useState(false);const [removeBusyId,setRemoveBusyId]=useState<string|null>(null);const [ladefehler,setLadefehler]=useState<string|null>(null);const toast=useToast();
  const location=useLocation();const navigate=useNavigate();
  const load=()=>api<Customer[]>(`/customers${q?`?q=${encodeURIComponent(q)}`:''}`).then(rows=>{setRows(rows);setLadefehler(null)}).catch(err=>setLadefehler(err instanceof Error?err.message:'Kunden konnten nicht geladen werden'))
  useEffect(()=>{const t=setTimeout(load,180);return()=>clearTimeout(t)},[q])
  function create(){setEditId(null);setForm(blank);setOpen(true)}

  const fileRef=useRef<HTMLInputElement|null>(null)
  const [importing,setImporting]=useState(false)

  /* CSV einlesen und an den Server geben. Das Zerlegen passiert dort, damit
     dieselben Pflichtfelder und Rechte gelten wie beim Anlegen von Hand. */
  async function importCsv(event:React.ChangeEvent<HTMLInputElement>){
    const datei=event.target.files?.[0]
    // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden kann.
    event.target.value=''
    if(!datei)return

    setImporting(true)
    try{
      const text=await datei.text()
      const ergebnis=await api<{created:number;skipped:number;notes:string[]}>(
        '/customers/import',
        {method:'POST',body:JSON.stringify({csv:text})},
      )
      load()
      toast(
        ergebnis.skipped
          ?`${ergebnis.created} Kunden angelegt, ${ergebnis.skipped} übersprungen`
          :`${ergebnis.created} Kunden angelegt`,
      )
      if(ergebnis.notes.length)console.info('CSV-Import übersprungen:',ergebnis.notes)
    }catch(err){
      toast(err instanceof Error?err.message:'Import fehlgeschlagen','error')
    }finally{
      setImporting(false)
    }
  }
  useEffect(()=>{
    if((location.state as any)?.openCreate){
      create()
      navigate(location.pathname,{replace:true,state:null})
    }
  },[location.state])
  function edit(c:Customer){setEditId(c.id);setForm({first_name:c.first_name,last_name:c.last_name,street:c.street,house_number:c.house_number,postal_code:c.postal_code,city:c.city,phone:c.phone||'',email:c.email||'',notes:c.notes||''});setOpen(true)}
  async function removeCustomer(c:Customer){
    if(removeBusyId===c.id)return
    if(!window.confirm(`Kunde ${c.full_name} wirklich löschen?

Der Kunde verschwindet aus der Kundenliste.
Bereits vorhandene Verkäufe und historische Daten bleiben erhalten.`)) return;

    setRemoveBusyId(c.id)
    try{
      await api(`/customers/${c.id}`,{method:'DELETE'});
      toast('Kunde wurde gelöscht');
      load();
    }catch(err){
      toast(err instanceof Error?err.message:'Kunde konnte nicht gelöscht werden','error');
    }finally{
      setRemoveBusyId(null)
    }
  }

  async function save(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);try{await api(editId?`/customers/${editId}`:'/customers',{method:editId?'PUT':'POST',body:JSON.stringify({...form,email:form.email||null,phone:form.phone||null})});setOpen(false);setForm(blank);setEditId(null);load();toast(editId?'Kunde aktualisiert':'Kunde gespeichert')}catch(err){toast(err instanceof Error?err.message:'Fehler','error')}finally{setBusy(false)}}
  return <div className="page"><div className="page-head"><div><h1>Kunden</h1><p>Eigene Kundendaten; Teamleiter sehen den Teamumfang.</p></div><div className="page-head-actions"><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv}/><button type="button" onClick={()=>fileRef.current?.click()} disabled={importing} title="Kunden aus einer CSV-Datei anlegen"><Upload size={17}/> {importing?'Import läuft…':'CSV importieren'}</button><button className="primary" onClick={create}><Plus size={18}/> Kunde anlegen</button></div></div><div className="toolbar"><div className="search-field"><Search size={17}/><input placeholder="Kunde suchen…" value={q} onChange={e=>setQ(e.target.value)}/></div></div><div className="table-card"><table><thead><tr><th>Name</th><th>Adresse</th><th>Telefon</th><th>E-Mail</th><th/></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><Link className="customer-name-link" to={`/kunden/${c.id}`} title="Kundenakte öffnen"><strong>{c.full_name}</strong></Link></td><td>{c.address||'–'}</td><td>{c.phone?<a className="customer-contact-link" href={`tel:${c.phone.replace(/[^0-9+*#;,]/g,'')}`} title={`${c.phone} anrufen`}><Phone size={15}/><span>{c.phone}</span></a>:'–'}</td><td>{c.email?<a className="customer-contact-link" href={`mailto:${c.email}`} title={`E-Mail an ${c.email}`}><Mail size={15}/><span>{c.email}</span></a>:'–'}</td><td>
<button className="icon-button" onClick={()=>edit(c)} title="Bearbeiten"><Pencil size={16}/></button>
<button className="icon-button delete-icon" disabled={removeBusyId===c.id} onClick={()=>removeCustomer(c)} title="Kunde löschen"><Trash2 size={16}/></button>
</td></tr>)}</tbody></table>{!rows.length&&!ladefehler&&<div className="empty">Keine Kunden gefunden.</div>}{ladefehler&&<LoadError meldung={ladefehler} onRetry={load}/>}</div>{open&&<Modal title={editId?'Kunde bearbeiten':'Neuen Kunden anlegen'} onClose={()=>setOpen(false)} closeDisabled={busy}><form className="form-grid" onSubmit={save}><label>Vorname<input required value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></label><label>Nachname<input required value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></label><label>Straße<input value={form.street} onChange={e=>setForm({...form,street:e.target.value})}/></label><label>Hausnummer<input value={form.house_number} onChange={e=>setForm({...form,house_number:e.target.value})}/></label><label>PLZ<input value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value})}/></label><label>Ort<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label>Telefon<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>E-Mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label className="span-2">Notizen<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="form-actions span-2"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Abbrechen</button><button className="primary" disabled={busy}>{busy?'Speichert…':'Speichern'}</button></div></form></Modal>}</div>
}
