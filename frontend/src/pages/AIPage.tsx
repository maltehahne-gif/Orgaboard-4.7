import {FormEvent,useEffect,useRef,useState} from 'react'
import {Bot,CheckCircle2,Mic,Send,ShieldCheck,Volume2} from 'lucide-react'
import {api} from '../lib/api'
import {useToast} from '../components/Toast'

type ChatMessage={role:'user'|'assistant';content:string}
type AssistantStatus={enabled:boolean;provider:'openai'|'local-safe';model:string|null}

declare global { interface Window { webkitSpeechRecognition?: any; SpeechRecognition?: any } }

export function AIPage(){
  const [messages,setMessages]=useState<ChatMessage[]>([{role:'assistant',content:'Hallo! Ich bin dein OrgaBoard-Assistent. Ich nutze nur Daten, auf die dein Konto zugreifen darf, und erfinde keine Preise oder Geschäftsdaten.'}])
  const [status,setStatus]=useState<AssistantStatus>({enabled:false,provider:'local-safe',model:null})
  const [input,setInput]=useState('')
  const [conversationId,setConversationId]=useState<string|null>(null)
  const [busy,setBusy]=useState(false)
  const [listening,setListening]=useState(false)
  const toast=useToast()
  const endRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{api<AssistantStatus>('/assistant/status').then(setStatus).catch(()=>undefined)},[])
  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[messages])

  async function submit(e?:FormEvent){
    e?.preventDefault()
    const text=input.trim()
    if(!text||busy)return
    setInput('')
    setMessages(m=>[...m,{role:'user',content:text}])
    setBusy(true)
    try{
      const res=await api<{conversation_id:string;answer:string;provider:string}>('/assistant/chat',{method:'POST',body:JSON.stringify({message:text,conversation_id:conversationId})})
      setConversationId(res.conversation_id)
      setMessages(m=>[...m,{role:'assistant',content:res.answer}])
      setStatus(s=>({...s,enabled:res.provider==='openai',provider:res.provider==='openai'?'openai':'local-safe'}))
      speak(res.answer)
    }catch(err){
      toast(err instanceof Error?err.message:'KI-Anfrage fehlgeschlagen','error')
    }finally{
      setBusy(false)
    }
  }

  function speak(text:string){
    if(!('speechSynthesis' in window))return
    window.speechSynthesis.cancel()
    const u=new SpeechSynthesisUtterance(text)
    u.lang='de-DE'
    window.speechSynthesis.speak(u)
  }

  function listen(){
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition
    if(!Recognition){toast('Spracherkennung wird in diesem Browser nicht unterstützt. Nutze Chrome/Edge/Safari.','error');return}
    const rec=new Recognition()
    rec.lang='de-DE'
    rec.interimResults=false
    rec.maxAlternatives=1
    rec.onstart=()=>setListening(true)
    rec.onend=()=>setListening(false)
    rec.onerror=()=>setListening(false)
    rec.onresult=(ev:any)=>setInput(ev.results?.[0]?.[0]?.transcript||'')
    rec.start()
  }

  return <div className="ai-layout">
    <section className="chat-panel card">
      <div className="ai-head">
        <div className="assistant-orb"><Bot/></div>
        <div className="ai-head-copy">
          <h1>OrgaBoard KI Assistent <span className={status.enabled?'ai-provider-badge online':'ai-provider-badge'}>{status.enabled?'OPENAI':'LOKAL'}</span></h1>
          <p>{status.enabled?'Echte OpenAI-Verbindung mit sicheren OrgaBoard-Werkzeugen':'Sicherer OrgaBoard-Ersatzmodus'}</p>
        </div>
      </div>
      <div className="chat-scroll">
        {messages.map((m,i)=><div key={i} className={`bubble ${m.role}`}>{m.content}{m.role==='assistant'&&<button className="speak" onClick={()=>speak(m.content)} title="Vorlesen"><Volume2 size={14}/></button>}</div>)}
        {busy&&<div className="bubble assistant">Ich prüfe die verfügbaren Daten…</div>}
        <div ref={endRef}/>
      </div>
      <div className="quick-prompts"><button onClick={()=>setInput('Wann ist mein nächster Termin?')}>Nächster Termin</button><button onClick={()=>setInput('Wie viele Einheiten fehlen mir noch?')}>Einheiten-Ziel</button><button onClick={()=>setInput('Welche Geräte habe ich im Verleih?')}>Verleih</button></div>
      <form className="chat-input" onSubmit={submit}><button type="button" className={listening?'mic active':'mic'} onClick={listen}><Mic size={20}/></button><input maxLength={4000} value={input} onChange={e=>setInput(e.target.value)} placeholder="Frage etwas oder gib eine Aktion in natürlicher Sprache ein…"/><button className="send" disabled={busy}><Send size={19}/></button></form>
      <small className="ai-disclaimer">Die KI kann Fehler machen. Geschäftsdaten werden nur über serverseitig geprüfte Tools gelesen oder geändert.</small>
    </section>
    <aside className="card ai-info">
      <div className={`ai-connection ${status.enabled?'online':''}`}>{status.enabled?<CheckCircle2/>:<ShieldCheck/>}<div><strong>{status.enabled?'OpenAI ist aktiv':'Sicherer lokaler Modus'}</strong><small>{status.enabled?(status.model||'OpenAI'):'API-Schlüssel noch nicht hinterlegt'}</small></div></div>
      <h2>Was kann ich?</h2>
      <ul><li>Termine und nächste Kundentermine</li><li>Wochenumsatz und Einheiten</li><li>Verleihgeräte und Rückgaben</li><li>Verifizierte Produktinformationen und Preise</li><li>Kundenhistorie und Produktvorstellungen</li><li>Aktionen mit serverseitiger Rechteprüfung</li></ul>
      <div className="info-box">{status.enabled?'Anfragen laufen über OpenAI. Der geheime Schlüssel liegt ausschließlich auf dem Server.':'OpenAI ist technisch vorbereitet. Zur Aktivierung fehlt nur noch dein persönlicher API-Schlüssel.'}</div>
    </aside>
  </div>
}
