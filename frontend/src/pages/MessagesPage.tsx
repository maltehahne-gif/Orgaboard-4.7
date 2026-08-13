import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Download,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Palette,
  Paperclip,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  api,
  formatDateTime,
  money,
} from '../lib/api'
import {connectRealtime} from '../lib/realtime'
import {useAuth} from '../lib/auth'
import {useToast} from '../components/Toast'

type Attachment={
  id:string
  kind:'image'|'file'|'audio'|'buntewoche'|string
  file_name:string|null
  content_type:string|null
  size_bytes:number|null
  content_url:string|null
  download_url:string|null
  metadata:Record<string,any>
}

type Msg={
  id:string
  sender_user_id:string
  sender_name:string
  recipient_user_id:string|null
  recipient_name:string
  body:string
  created_at:string
  read_at:string|null
  is_read:boolean
  attachments:Attachment[]
}

type U={
  id:string
  full_name:string
  role:string
}

type Unread={
  total:number
  team:number
  by_user:Record<string,number>
}

type AudioDraft={
  blob:Blob
  url:string
  mime:string
}

const emptyUnread:Unread={
  total:0,
  team:0,
  by_user:{},
}

function formatBytes(value:number|null){
  if(!value)return ''

  if(value<1024){
    return `${value} B`
  }

  if(value<1024*1024){
    return `${Math.round(value/1024)} KB`
  }

  return `${(value/1024/1024).toFixed(1)} MB`
}

function clock(seconds:number){
  const m=Math.floor(seconds/60)
  const s=seconds%60
  return `${m}:${String(s).padStart(2,'0')}`
}

export function MessagesPage(){
  const {me}=useAuth()
  const toast=useToast()

  const [rows,setRows]=useState<Msg[]>([])
  const [users,setUsers]=useState<U[]>([])
  const [selected,setSelected]=useState<string>('team')
  const [body,setBody]=useState('')
  const [search,setSearch]=useState('')
  const [unread,setUnread]=useState<Unread>(emptyUnread)
  const [loading,setLoading]=useState(true)
  const [sending,setSending]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [attachOpen,setAttachOpen]=useState(false)

  const [recording,setRecording]=useState(false)
  const [recordSeconds,setRecordSeconds]=useState(0)
  const [audioDraft,setAudioDraft]=useState<AudioDraft|null>(null)

  const imageInput=useRef<HTMLInputElement|null>(null)
  const fileInput=useRef<HTMLInputElement|null>(null)
  const recorderRef=useRef<MediaRecorder|null>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const chunksRef=useRef<Blob[]>([])

  const selectedUser=useMemo(
    ()=>users.find(user=>user.id===selected),
    [selected,users],
  )

  const filteredUsers=useMemo(()=>{
    const query=search.trim().toLowerCase()

    return users
      .filter(user=>user.id!==me?.id)
      .filter(user=>
        !query
        || user.full_name.toLowerCase().includes(query)
      )
      .sort(
        (a,b)=>a.full_name.localeCompare(
          b.full_name,
          'de',
        )
      )
  },[me?.id,search,users])

  const isTeam=selected==='team'

  function conversationQuery(){
    return isTeam
      ? '?team=true'
      : `?recipient_user_id=${encodeURIComponent(selected)}`
  }

  function readPayload(){
    return isTeam
      ? {team:true}
      : {recipient_user_id:selected}
  }

  async function loadUnread(){
    try{
      setUnread(
        await api<Unread>('/messages/unread')
      )
    }catch{
      // Badge darf den Chat nicht blockieren.
    }
  }

  async function loadConversation(markRead=true){
    try{
      setLoading(true)

      const data=await api<Msg[]>(
        `/messages${conversationQuery()}`
      )

      setRows([...data].reverse())

      if(markRead){
        await api('/messages/read',{
          method:'PATCH',
          body:JSON.stringify(readPayload()),
        })

        await loadUnread()
      }
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Nachrichten konnten nicht geladen werden.',
        'error',
      )
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    api<U[]>('/directory/users')
      .then(setUsers)
      .catch(()=>{
        toast(
          'Mitarbeiter konnten nicht geladen werden.',
          'error',
        )
      })

    void loadUnread()
  },[])

  useEffect(()=>{
    void loadConversation(true)
    setAttachOpen(false)
  },[selected])

  useEffect(()=>{
    return connectRealtime(event=>{
      const type=String(event.type||'')

      if(
        type==='message.new'
        || type==='message.cleared'
      ){
        void loadConversation(true)
        void loadUnread()
      }
    })
  },[selected])

  useEffect(()=>{
    if(!recording)return

    const timer=window.setInterval(()=>{
      setRecordSeconds(value=>{
        if(value>=299){
          window.setTimeout(
            ()=>stopRecording(),
            0,
          )
          return 300
        }

        return value+1
      })
    },1000)

    return ()=>window.clearInterval(timer)
  },[recording])

  useEffect(()=>{
    return ()=>{
      streamRef.current?.getTracks()
        .forEach(track=>track.stop())

      if(audioDraft){
        URL.revokeObjectURL(audioDraft.url)
      }
    }
  },[audioDraft])

  async function send(event:FormEvent){
    event.preventDefault()

    const clean=body.trim()

    if(!clean)return

    setSending(true)

    try{
      await api('/messages',{
        method:'POST',
        body:JSON.stringify({
          recipient_user_id:isTeam?null:selected,
          body:clean,
        }),
      })

      setBody('')
      await loadConversation(true)
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Nachricht konnte nicht gesendet werden.',
        'error',
      )
    }finally{
      setSending(false)
    }
  }

  async function uploadFiles(
    files:File[],
    kind:'image'|'file'|'audio',
  ){
    if(!files.length)return

    if(files.length>5){
      toast(
        'Du kannst maximal 5 Dateien gleichzeitig senden.',
        'error',
      )
      return
    }

    setUploading(true)
    setAttachOpen(false)

    try{
      const form=new FormData()

      if(!isTeam){
        form.append(
          'recipient_user_id',
          selected,
        )
      }

      if(body.trim()){
        form.append(
          'body',
          body.trim(),
        )
      }

      form.append('kind',kind)

      files.forEach(file=>{
        form.append('files',file)
      })

      await api('/messages/with-files',{
        method:'POST',
        body:form,
      })

      setBody('')
      await loadConversation(true)

      toast(
        kind==='image'
          ? files.length===1
            ? 'Bild gesendet'
            : `${files.length} Bilder gesendet`
          : kind==='audio'
            ? 'Sprachnachricht gesendet'
            : 'Datei gesendet'
      )
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Anhang konnte nicht gesendet werden.',
        'error',
      )
    }finally{
      setUploading(false)
    }
  }

  async function shareBunteWoche(){
    setAttachOpen(false)

    try{
      await api('/messages/share-buntewoche',{
        method:'POST',
        body:JSON.stringify({
          recipient_user_id:isTeam?null:selected,
          employee_id:me?.employee?.id||null,
        }),
      })

      await loadConversation(true)

      toast('Bunte Woche wurde geteilt.')
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Bunte Woche konnte nicht geteilt werden.',
        'error',
      )
    }
  }

  async function startRecording(){
    setAttachOpen(false)

    if(
      !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder==='undefined'
    ){
      toast(
        'Sprachnachrichten werden von diesem Browser nicht unterstützt.',
        'error',
      )
      return
    }

    try{
      discardAudio()

      const stream=await navigator.mediaDevices
        .getUserMedia({audio:true})

      streamRef.current=stream
      chunksRef.current=[]

      const preferred=[
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
      ].find(type=>
        MediaRecorder.isTypeSupported(type)
      )

      const recorder=preferred
        ? new MediaRecorder(
          stream,
          {mimeType:preferred},
        )
        : new MediaRecorder(stream)

      recorderRef.current=recorder

      recorder.ondataavailable=event=>{
        if(event.data.size>0){
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop=()=>{
        const mime=(
          recorder.mimeType
          || chunksRef.current[0]?.type
          || 'audio/webm'
        )

        const blob=new Blob(
          chunksRef.current,
          {type:mime},
        )

        const url=URL.createObjectURL(blob)

        setAudioDraft({
          blob,
          url,
          mime,
        })

        stream.getTracks()
          .forEach(track=>track.stop())

        streamRef.current=null
        recorderRef.current=null
        setRecording(false)
      }

      recorder.start(250)
      setRecordSeconds(0)
      setRecording(true)
    }catch{
      toast(
        'Mikrofon konnte nicht geöffnet werden. Bitte Mikrofon-Zugriff erlauben.',
        'error',
      )
    }
  }

  function stopRecording(){
    const recorder=recorderRef.current

    if(
      recorder
      && recorder.state!=='inactive'
    ){
      recorder.stop()
    }
  }

  function discardAudio(){
    if(audioDraft){
      URL.revokeObjectURL(audioDraft.url)
    }

    setAudioDraft(null)
    setRecordSeconds(0)
  }

  async function sendAudio(){
    if(!audioDraft)return

    const extension=audioDraft.mime.includes('mp4')
      ? 'm4a'
      : 'webm'

    const file=new File(
      [audioDraft.blob],
      `Sprachnachricht-${Date.now()}.${extension}`,
      {type:audioDraft.mime},
    )

    await uploadFiles(
      [file],
      'audio',
    )

    discardAudio()
  }

  async function clearChat(){
    const label=isTeam
      ? 'Team-Chat'
      : `privaten Chat mit ${selectedUser?.full_name||'dieser Person'}`

    if(!window.confirm(
      `${label} wirklich für dich leeren?\n\n`
      +'Die Nachrichten werden nur bei dir ausgeblendet. '
      +'Andere Gesprächsteilnehmer behalten ihre Nachrichten.'
    ))return

    try{
      const query=isTeam
        ? '?team=true'
        : `?recipient_user_id=${encodeURIComponent(selected)}`

      await api(`/messages/clear${query}`,{
        method:'DELETE',
      })

      setRows([])
      await loadUnread()

      toast('Chat wurde für dich geleert.')
    }catch(error){
      toast(
        error instanceof Error
          ? error.message
          : 'Chat konnte nicht geleert werden.',
        'error',
      )
    }
  }

  function renderAttachment(
    attachment:Attachment,
  ){
    if(
      attachment.kind==='image'
      && attachment.content_url
    ){
      return <div
        className="chat-attachment-image"
        key={attachment.id}
      >
        <a
          href={attachment.content_url}
          target="_blank"
          rel="noreferrer"
        >
          <img
            src={attachment.content_url}
            alt={attachment.file_name||'Chat-Bild'}
            loading="lazy"
          />
        </a>

        {attachment.download_url&&
          <a
            className="chat-attachment-download"
            href={attachment.download_url}
            title="Bild speichern"
          >
            <Download size={15}/>
          </a>
        }
      </div>
    }

    if(
      attachment.kind==='audio'
      && attachment.content_url
    ){
      return <div
        className="chat-audio-card"
        key={attachment.id}
      >
        <div>
          <Mic size={18}/>
          <strong>Sprachnachricht</strong>
        </div>

        <audio
          controls
          preload="metadata"
          src={attachment.content_url}
        />
      </div>
    }

    if(attachment.kind==='buntewoche'){
      const meta=attachment.metadata||{}
      const appointments=Array.isArray(
        meta.appointments
      )
        ? meta.appointments
        : []

      return <div
        className="chat-bunte-card"
        key={attachment.id}
      >
        <div className="chat-bunte-head">
          <span>
            <Palette size={18}/>
          </span>

          <div>
            <small>BUNTE WOCHE</small>
            <strong>
              KW {meta.calendar_week||'–'}
            </strong>
          </div>
        </div>

        <p>
          {meta.employee_name||''}
          {' · '}
          {meta.week_start||''}
          {' – '}
          {meta.week_end||''}
        </p>

        <div className="chat-bunte-stats">
          <span>
            <strong>
              {money(
                Number(
                  meta.week_revenue_cents||0
                )
              )}
            </strong>
            Wochenumsatz
          </span>

          <span>
            <strong>
              {meta.week_units||0}
              {' / '}
              {meta.units_target||0}
            </strong>
            Einheiten
          </span>
        </div>

        {!!appointments.length&&
          <div className="chat-bunte-appointments">
            {appointments
              .slice(0,4)
              .map((appointment:any,index:number)=>
                <div key={`${attachment.id}-${index}`}>
                  <strong>
                    {new Date(
                      appointment.start_at
                    ).toLocaleString(
                      'de-DE',
                      {
                        weekday:'short',
                        hour:'2-digit',
                        minute:'2-digit',
                      }
                    )}
                  </strong>
                  <span>
                    {appointment.label}
                  </span>
                </div>
              )
            }

            {appointments.length>4&&
              <small>
                + {appointments.length-4}
                {' '}weitere Termine
              </small>
            }
          </div>
        }
      </div>
    }

    if(attachment.content_url){
      return <div
        className="chat-file-card"
        key={attachment.id}
      >
        <span className="chat-file-icon">
          <FileText size={20}/>
        </span>

        <div>
          <strong>
            {attachment.file_name||'Datei'}
          </strong>
          <small>
            {formatBytes(
              attachment.size_bytes
            )}
          </small>
        </div>

        <a
          href={attachment.content_url}
          target="_blank"
          rel="noreferrer"
        >
          Öffnen
        </a>

        {attachment.download_url&&
          <a
            href={attachment.download_url}
            title="Datei speichern"
          >
            <Download size={17}/>
          </a>
        }
      </div>
    }

    return null
  }

  const title=isTeam
    ? 'Team-Chat'
    : selectedUser?.full_name||'Privater Chat'

  const subtitle=isTeam
    ? 'Alle Mitarbeiter können diese Nachrichten sehen.'
    : 'Nur du und diese Person können diesen Chat sehen.'

  return <div className="page">
    <div className="page-head">
      <div>
        <h1>Nachrichten</h1>
        <p>
          Team-Chat und private Unterhaltungen an einem Ort.
        </p>
      </div>
    </div>

    <div className="chat-v2">
      <aside className="card chat-v2-sidebar">
        <div className="chat-v2-sidebar-head">
          <div>
            <small>Unterhaltungen</small>
            <strong>Chats</strong>
          </div>

          {unread.total>0&&
            <span className="chat-v2-total-badge">
              {unread.total}
            </span>
          }
        </div>

        <button
          type="button"
          className={
            isTeam
              ? 'chat-v2-conversation active'
              : 'chat-v2-conversation'
          }
          onClick={()=>setSelected('team')}
        >
          <span className="chat-v2-avatar team">
            <Users size={20}/>
          </span>

          <span className="chat-v2-conversation-text">
            <strong>Team-Chat</strong>
            <small>
              Nachrichten an das gesamte Team
            </small>
          </span>

          {unread.team>0&&
            <span className="chat-v2-unread">
              {unread.team}
            </span>
          }
        </button>

        <div className="chat-v2-private-label">
          <span>Private Nachrichten</span>
        </div>

        <label className="chat-v2-search">
          <Search size={16}/>
          <input
            value={search}
            onChange={event=>
              setSearch(event.target.value)
            }
            placeholder="Mitarbeiter suchen …"
          />
        </label>

        <div className="chat-v2-user-list">
          {filteredUsers.map(user=>{
            const count=unread.by_user[user.id]||0

            return <button
              type="button"
              key={user.id}
              className={
                selected===user.id
                  ? 'chat-v2-conversation active'
                  : 'chat-v2-conversation'
              }
              onClick={()=>setSelected(user.id)}
            >
              <span className="chat-v2-avatar">
                {user.full_name
                  .split(' ')
                  .map(part=>part[0])
                  .slice(0,2)
                  .join('')
                  .toUpperCase()}
              </span>

              <span className="chat-v2-conversation-text">
                <strong>
                  {user.full_name}
                </strong>
                <small>
                  {user.role==='TEAM_LEADER'
                    ? 'Teamleiter'
                    : 'Privater Chat'}
                </small>
              </span>

              {count>0&&
                <span className="chat-v2-unread">
                  {count}
                </span>
              }
            </button>
          })}
        </div>
      </aside>

      <section className="card chat-v2-panel">
        <header className="chat-v2-header">
          <div className="chat-v2-header-person">
            <span className={
              isTeam
                ? 'chat-v2-avatar team'
                : 'chat-v2-avatar'
            }>
              {isTeam
                ? <Users size={20}/>
                : <UserRound size={20}/>
              }
            </span>

            <div>
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            className="chat-v2-delete"
            onClick={clearChat}
            title="Diesen Chat für mich leeren"
          >
            <Trash2 size={17}/>
            <span>Chat leeren</span>
          </button>
        </header>

        <div className="chat-v2-feed">
          {loading&&
            <div className="chat-v2-empty">
              Nachrichten werden geladen …
            </div>
          }

          {!loading&&!rows.length&&
            <div className="chat-v2-empty">
              <MessageCircle size={36}/>
              <strong>
                Noch keine Nachrichten
              </strong>
              <span>
                {isTeam
                  ? 'Schreibe die erste Nachricht an das Team.'
                  : `Starte einen privaten Chat mit ${selectedUser?.full_name||'dieser Person'}.`}
              </span>
            </div>
          }

          {!loading&&rows.map(message=>{
            const mine=(
              message.sender_user_id===me?.id
            )

            const images=(
              message.attachments||[]
            ).filter(
              attachment=>
                attachment.kind==='image'
            )

            const others=(
              message.attachments||[]
            ).filter(
              attachment=>
                attachment.kind!=='image'
            )

            return <article
              key={message.id}
              className={
                mine
                  ? 'chat-v2-message mine'
                  : 'chat-v2-message'
              }
            >
              {!mine&&isTeam&&
                <strong className="chat-v2-sender">
                  {message.sender_name}
                </strong>
              }

              <div className="chat-v2-bubble">
                {images.length>0&&
                  <div className={
                    `chat-image-grid count-${Math.min(
                      images.length,
                      5
                    )}`
                  }>
                    {images.map(renderAttachment)}
                  </div>
                }

                {others.map(renderAttachment)}

                {!!message.body&&
                  <p>{message.body}</p>
                }

                <small>
                  {formatDateTime(
                    message.created_at
                  )}
                </small>
              </div>
            </article>
          })}
        </div>

        <div className="chat-compose-area">
          {recording&&
            <div className="chat-recording">
              <span className="chat-recording-dot"/>
              <strong>
                Aufnahme läuft
              </strong>
              <span>
                {clock(recordSeconds)}
              </span>

              <button
                type="button"
                onClick={stopRecording}
              >
                <Square size={15}/>
                Stopp
              </button>
            </div>
          }

          {audioDraft&&!recording&&
            <div className="chat-audio-draft">
              <audio
                controls
                src={audioDraft.url}
              />

              <button
                type="button"
                className="primary"
                onClick={sendAudio}
                disabled={uploading}
              >
                <Send size={16}/>
                Senden
              </button>

              <button
                type="button"
                onClick={discardAudio}
                title="Verwerfen"
              >
                <X size={17}/>
              </button>
            </div>
          }

          <form
            className="chat-v2-compose"
            onSubmit={send}
          >
            <div className="chat-attach-wrap">
              <button
                type="button"
                className={
                  attachOpen
                    ? 'chat-plus active'
                    : 'chat-plus'
                }
                onClick={()=>
                  setAttachOpen(value=>!value)
                }
                title="Anhängen"
              >
                <Plus size={22}/>
              </button>

              {attachOpen&&
                <div className="chat-attach-menu">
                  <button
                    type="button"
                    onClick={()=>
                      imageInput.current?.click()
                    }
                  >
                    <span className="image">
                      <ImageIcon size={19}/>
                    </span>
                    <div>
                      <strong>Bilder</strong>
                      <small>
                        Bis zu 5 gleichzeitig
                      </small>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={()=>
                      fileInput.current?.click()
                    }
                  >
                    <span className="file">
                      <Paperclip size={19}/>
                    </span>
                    <div>
                      <strong>Dateien</strong>
                      <small>
                        PDF, Dokumente usw.
                      </small>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={shareBunteWoche}
                  >
                    <span className="bunte">
                      <Palette size={19}/>
                    </span>
                    <div>
                      <strong>
                        Bunte Woche
                      </strong>
                      <small>
                        Aktuelle Woche teilen
                      </small>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={startRecording}
                  >
                    <span className="audio">
                      <Mic size={19}/>
                    </span>
                    <div>
                      <strong>
                        Sprachnachricht
                      </strong>
                      <small>
                        Direkt aufnehmen
                      </small>
                    </div>
                  </button>
                </div>
              }
            </div>

            <input
              ref={imageInput}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              hidden
              onChange={event=>{
                const files=Array.from(
                  event.target.files||[]
                )

                event.currentTarget.value=''

                void uploadFiles(
                  files,
                  'image',
                )
              }}
            />

            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={event=>{
                const files=Array.from(
                  event.target.files||[]
                )

                event.currentTarget.value=''

                void uploadFiles(
                  files,
                  'file',
                )
              }}
            />

            <textarea
              required={!audioDraft}
              rows={2}
              value={body}
              onChange={event=>
                setBody(event.target.value)
              }
              placeholder={
                uploading
                  ? 'Anhang wird gesendet …'
                  : isTeam
                    ? 'Nachricht an das Team …'
                    : `Private Nachricht an ${selectedUser?.full_name||''} …`
              }
              disabled={uploading}
              onKeyDown={event=>{
                if(
                  event.key==='Enter'
                  && !event.shiftKey
                  && body.trim()
                ){
                  event.preventDefault()
                  event.currentTarget.form
                    ?.requestSubmit()
                }
              }}
            />

            <button
              className="primary chat-v2-send"
              disabled={
                sending
                || uploading
                || !body.trim()
              }
              title="Nachricht senden"
            >
              <Send size={18}/>
              <span>
                {sending
                  ? 'Wird gesendet …'
                  : uploading
                    ? 'Upload …'
                    : 'Senden'}
              </span>
            </button>
          </form>
        </div>
      </section>
    </div>
  </div>
}
