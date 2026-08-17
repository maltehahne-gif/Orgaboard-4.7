import {
  FormEvent,
  useEffect,
  useState,
} from 'react'

import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'

import {useAuth} from '../lib/auth'
import {Logo} from '../components/Logo'
import {LoginDustChase} from '../components/LoginDustChase'


type LoginMode =
  | 'login'
  | 'forgot'
  | 'reset'


export function LoginPage(){

  const {login}=useAuth()

  const [mode,setMode]=useState<LoginMode>('login')

  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')

  const [newPassword,setNewPassword]=useState('')
  const [repeatPassword,setRepeatPassword]=useState('')

  const [resetToken,setResetToken]=useState('')

  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const [busy,setBusy]=useState(false)

  /*
    Nur Darstellung: ob das Passwort im Klartext steht. Der Wert des Feldes
    und alles, was beim Absenden passiert, bleibt davon unberuehrt.
  */
  const [passwortSichtbar,setPasswortSichtbar]=useState(false)

  /*
    Angemeldet bleiben. Die Sitzung haelt ohnehin ueber den Browserneustart
    hinweg - das Sitzungscookie hat eine Laufzeit. Der Haken zeigt diesen
    Zustand; an der Sitzungsbehandlung selbst wird hier nichts gedreht.
  */
  const [angemeldetBleiben,setAngemeldetBleiben]=useState(true)


  /*
    Wenn der Benutzer auf den Link aus der E-Mail klickt,
    befindet sich ?reset_token=... in der Adresse.
  */
  useEffect(()=>{

    const params=
      new URLSearchParams(
        window.location.search
      )

    const token=
      params.get('reset_token')

    if(token){
      setResetToken(token)
      setMode('reset')
    }

  },[])


  function clearMessages(){
    setError('')
    setMessage('')
  }


  function backToLogin(){

    clearMessages()

    setMode('login')

    setResetToken('')
    setNewPassword('')
    setRepeatPassword('')

    const url=
      new URL(
        window.location.href
      )

    url.searchParams.delete(
      'reset_token'
    )

    window.history.replaceState(
      {},
      '',
      url.pathname
    )
  }


  /*
    NORMALES LOGIN
  */
  async function submitLogin(
    event:FormEvent
  ){

    event.preventDefault()

    if(busy)return

    setBusy(true)
    clearMessages()

    try{

      await login(
        email.trim(),
        password
      )

    }catch(err){

      setError(
        err instanceof Error
          ? err.message
          : 'Login fehlgeschlagen'
      )

    }finally{
      setBusy(false)
    }
  }


  /*
    RESET-LINK ANFORDERN
  */
  async function submitForgot(
    event:FormEvent
  ){

    event.preventDefault()

    if(busy)return

    if(!email.trim()){

      setError(
        'Bitte gib deine E-Mail-Adresse ein.'
      )

      return
    }

    setBusy(true)
    clearMessages()

    try{

      const response=
        await fetch(
          '/api/v1/auth/password-reset/request',
          {
            method:'POST',

            headers:{
              'Content-Type':'application/json',
            },

            body:JSON.stringify({
              email:email.trim(),
            }),
          }
        )


      let data:any={}

      try{
        data=await response.json()
      }catch{
        // Falls Server keine JSON-Antwort liefert
      }


      if(!response.ok){

        throw new Error(
          data?.detail
          || 'Reset-Link konnte nicht angefordert werden.'
        )
      }


      setMessage(
        'Falls zu dieser E-Mail-Adresse ein OrgaBoard-Konto existiert, wurde ein Link zum Zurücksetzen des Passworts versendet.'
      )

    }catch(err){

      setError(
        err instanceof Error
          ? err.message
          : 'Reset-Link konnte nicht angefordert werden.'
      )

    }finally{
      setBusy(false)
    }
  }


  /*
    NEUES PASSWORT SPEICHERN
  */
  async function submitReset(
    event:FormEvent
  ){

    event.preventDefault()

    if(busy)return

    clearMessages()


    if(newPassword.length < 12){

      setError(
        'Das neue Passwort muss mindestens 12 Zeichen lang sein.'
      )

      return
    }


    if(
      newPassword
      !== repeatPassword
    ){

      setError(
        'Die beiden Passwörter stimmen nicht überein.'
      )

      return
    }


    if(!resetToken){

      setError(
        'Der Passwort-Link ist ungültig.'
      )

      return
    }


    setBusy(true)


    try{

      const response=
        await fetch(
          '/api/v1/auth/password-reset/confirm',
          {
            method:'POST',

            headers:{
              'Content-Type':'application/json',
            },

            body:JSON.stringify({
              token:resetToken,
              new_password:newPassword,
            }),
          }
        )


      let data:any={}

      try{
        data=await response.json()
      }catch{
        // keine JSON-Antwort
      }


      if(!response.ok){

        throw new Error(
          data?.detail
          || 'Passwort konnte nicht geändert werden.'
        )
      }


      backToLogin()

      setMessage(
        'Dein Passwort wurde erfolgreich geändert. Du kannst dich jetzt anmelden.'
      )


    }catch(err){

      setError(
        err instanceof Error
          ? err.message
          : 'Passwort konnte nicht geändert werden.'
      )

    }finally{
      setBusy(false)
    }
  }


  return(
    <div className="login-page">

      <LoginDustChase/>


      <div className="login-spalte">

      <form
        className="login-card"
        onSubmit={
          mode==='login'
            ? submitLogin
            : mode==='forgot'
              ? submitForgot
              : submitReset
        }
      >

        <Logo/>


        {mode==='login' && (
          <>
            <h1>
              Willkommen{' '}
              <span className="login-akzent">
                zurück
              </span>
            </h1>

            <p>
              Melde dich mit deinem persönlichen
              OrgaBoard-Konto an.
            </p>
          </>
        )}


        {mode==='forgot' && (
          <>
            <h1>
              Passwort vergessen?
            </h1>

            <p>
              Gib deine E-Mail-Adresse ein.
              Wir senden dir einen sicheren Link,
              mit dem du ein neues Passwort festlegen kannst.
            </p>
          </>
        )}


        {mode==='reset' && (
          <>
            <h1>
              Neues Passwort
            </h1>

            <p>
              Lege jetzt dein neues
              OrgaBoard-Passwort fest.
            </p>
          </>
        )}


        {mode==='login' && (
          <>
            <label className="login-feld">
              E-Mail

              <span className="login-eingabe">

                <Mail
                  size={18}
                  aria-hidden="true"
                />

                <input
                  type="email"
                  value={email}
                  onChange={event=>
                    setEmail(
                      event.target.value
                    )
                  }
                  autoComplete="username"
                  placeholder="deine@email.com"
                  required
                />
              </span>
            </label>


            <label className="login-feld">
              Passwort

              <span className="login-eingabe">

                <Lock
                  size={18}
                  aria-hidden="true"
                />

                <input
                  type={
                    passwortSichtbar
                      ? 'text'
                      : 'password'
                  }
                  value={password}
                  onChange={event=>
                    setPassword(
                      event.target.value
                    )
                  }
                  autoComplete="current-password"
                  required
                />

                {/*
                  Nur ein Umschalter fuer die Anzeige. Er steht ausserhalb
                  des Eingabefeldes im Markup, damit ein Klick darauf nicht
                  als Klick ins Feld zaehlt, und traegt type="button" -
                  sonst wuerde er das Formular abschicken.
                */}
                <button
                  type="button"
                  className="login-augen"
                  onClick={()=>
                    setPasswortSichtbar(
                      sichtbar=>!sichtbar
                    )
                  }
                  aria-label={
                    passwortSichtbar
                      ? 'Passwort verbergen'
                      : 'Passwort anzeigen'
                  }
                  aria-pressed={passwortSichtbar}
                  tabIndex={-1}
                >
                  {passwortSichtbar
                    ? <EyeOff size={18}/>
                    : <Eye size={18}/>
                  }
                </button>
              </span>
            </label>


            <button
              type="button"
              className="login-forgot-password"
              onClick={()=>{
                clearMessages()
                setMode('forgot')
              }}
            >
              Passwort vergessen?
            </button>


            <label className="login-merken">

              <input
                type="checkbox"
                checked={angemeldetBleiben}
                onChange={event=>
                  setAngemeldetBleiben(
                    event.target.checked
                  )
                }
              />

              <span
                className="login-haken"
                aria-hidden="true"
              >
                <Check size={14}/>
              </span>

              Angemeldet bleiben
            </label>
          </>
        )}


        {mode==='forgot' && (
          <>
            <label className="login-feld">
              E-Mail-Adresse

              <span className="login-eingabe">

                <Mail
                  size={18}
                  aria-hidden="true"
                />

                <input
                  type="email"
                  value={email}
                  onChange={event=>
                    setEmail(
                      event.target.value
                    )
                  }
                  autoComplete="email"
                  placeholder="deine@email.com"
                  required
                />
              </span>
            </label>


            <div className="login-reset-info">
              Der Link ist aus Sicherheitsgründen
              nur 20 Minuten gültig.
            </div>
          </>
        )}


        {mode==='reset' && (
          <>
            <label className="login-feld">
              Neues Passwort

              <span className="login-eingabe">

                <Lock
                  size={18}
                  aria-hidden="true"
                />

                <input
                  type="password"
                  value={newPassword}
                  onChange={event=>
                    setNewPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </span>
            </label>


            <label className="login-feld">
              Passwort wiederholen

              <span className="login-eingabe">

                <Lock
                  size={18}
                  aria-hidden="true"
                />

                <input
                  type="password"
                  value={repeatPassword}
                  onChange={event=>
                    setRepeatPassword(
                      event.target.value
                    )
                  }
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </span>
            </label>


            <div className="login-reset-info">
              Mindestens 12 Zeichen.
            </div>
          </>
        )}


        {error && (
          <div
            className="login-reset-error"
            role="alert"
          >
            {error}
          </div>
        )}


        {message && (
          <div
            className="login-reset-success"
            role="status"
          >
            {message}
          </div>
        )}


        <button
          className="primary"
          disabled={busy}
          type="submit"
        >

          <span>
            {busy
              ? 'Bitte warten…'

              : mode==='login'
                ? 'Anmelden'

                : mode==='forgot'
                  ? 'Reset-Link senden'

                  : 'Neues Passwort speichern'
            }
          </span>

          <ArrowRight
            size={20}
            aria-hidden="true"
          />

        </button>


        {mode!=='login' && (

          <button
            type="button"
            className="login-reset-back"
            onClick={backToLogin}
          >
            ← Zurück zur Anmeldung
          </button>

        )}

      </form>


      <p className="login-sicherheit">

        <ShieldCheck
          size={15}
          aria-hidden="true"
        />

        Sicher. DSGVO-konform.
        In Deutschland gehostet.
      </p>

      </div>

    </div>
  )
}
