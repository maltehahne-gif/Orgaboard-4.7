import {FormEvent,useEffect,useRef,useState} from 'react'
import {Bot,CheckCircle2,Mic,Send,ShieldCheck,Volume2} from 'lucide-react'
import {api} from '../lib/api'
import {useToast} from '../components/Toast'
import {DayBriefing} from '../components/DayBriefing'
import {AssistantPriorities} from '../components/AssistantPriorities'
import {useAuth} from '../lib/auth'
import {darfVerwalten} from '../lib/roles'

/* Die Schnellfragen laufen bewusst über den Chat und nicht direkt auf die
   Auswertungs-Endpunkte: im Chat kommt die Begründung mit, und eine
   Rückfrage lässt sich anschließen. */
const SCHNELLFRAGEN: Array<[string,string]> = [
  ['Was muss ich heute tun?','Was muss ich heute tun? Nenne mir die Prioritäten mit Begründung.'],
  ['Nächsten Termin vorbereiten','Bereite mich auf meinen nächsten Termin vor.'],
  ['Wen nachfassen?','Wen sollte ich heute nachfassen und warum?'],
  ['Wie läuft mein Monat?','Wie läuft mein Monat? Wo liegt der größte Hebel?'],
  ['Schaffe ich mein Ziel?','Schaffe ich mein Monatsziel? Wie viel fehlt pro Arbeitstag?'],
  ['Verkäufe analysieren','Analysiere meine Verkäufe: Trichter und Produkte.'],
  ['Nachbetreuung','Bei welchen Kunden wäre eine Nachbetreuung fällig?'],
]

const TEAM_SCHNELLFRAGEN: Array<[string,string]> = [
  ['Wie läuft mein Team?','Wie läuft mein Team? Nenne die Kennzahlen je Mitarbeiter.'],
  ['Wer braucht Unterstützung?','Wer im Team liegt unter Ziel und woran liegt es?'],
]

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
  const {me}=useAuth()
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
      <div className="quick-prompts">
        {SCHNELLFRAGEN.map(([beschriftung,frage])=>
          <button key={beschriftung} onClick={()=>setInput(frage)}>{beschriftung}</button>)}
        {darfVerwalten(me?.role)&&TEAM_SCHNELLFRAGEN.map(([beschriftung,frage])=>
          <button key={beschriftung} onClick={()=>setInput(frage)}>{beschriftung}</button>)}
      </div>
      <form className="chat-input" onSubmit={submit}><button type="button" className={listening?'mic active':'mic'} onClick={listen} aria-label={listening?'Spracheingabe stoppen':'Spracheingabe starten'} title={listening?'Spracheingabe stoppen':'Spracheingabe starten'}><Mic size={20}/></button><input maxLength={4000} value={input} onChange={e=>setInput(e.target.value)} placeholder="Frage etwas oder gib eine Aktion in natürlicher Sprache ein…"/><button className="send" disabled={busy} aria-label="Nachricht senden" title="Nachricht senden"><Send size={19}/></button></form>
      <small className="ai-disclaimer">Die KI kann Fehler machen. Geschäftsdaten werden nur über serverseitig geprüfte Tools gelesen oder geändert.</small>
    </section>
    <aside className="card ai-info">
      <div className={`ai-connection ${status.enabled?'online':''}`}>{status.enabled?<CheckCircle2/>:<ShieldCheck/>}<div><strong>{status.enabled?'OpenAI ist aktiv':'Sicherer lokaler Modus'}</strong><small>{status.enabled?(status.model||'OpenAI'):'API-Schlüssel noch nicht hinterlegt'}</small></div></div>
      <AssistantPriorities/>
      <DayBriefing/>
      <h2>Was kann ich?</h2>
      <ul>
        <li>Tagesbriefing und Prioritäten mit Begründung</li>
        <li>Vorbereitung auf den nächsten Termin</li>
        <li>Wen du heute nachfassen solltest</li>
        <li>Monatslauf, Abschlussquote und größter Hebel</li>
        <li>Zielprognose auf Arbeitstage gerechnet</li>
        <li>Verkaufstrichter und Produktanalyse</li>
        <li>Kundenhistorie, Verleih und verifizierte Preise</li>
        <li>Änderungen erst nach deiner Bestätigung</li>
      </ul>
      <div className="info-box">{status.enabled?'Anfragen laufen über OpenAI. Der geheime Schlüssel liegt ausschließlich auf dem Server.':'OpenAI ist technisch vorbereitet. Zur Aktivierung fehlt nur noch dein persönlicher API-Schlüssel.'}</div>
    </aside>
  </div>
}
