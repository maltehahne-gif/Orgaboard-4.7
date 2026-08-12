import {
  FormEvent,
  useEffect,
  useState,
} from 'react'

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
              Willkommen zurück
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
            <label>
              E-Mail

              <input
                type="email"
                value={email}
                onChange={event=>
                  setEmail(
                    event.target.value
                  )
                }
                autoComplete="username"
                required
              />
            </label>


            <label>
              Passwort

              <input
                type="password"
                value={password}
                onChange={event=>
                  setPassword(
                    event.target.value
                  )
                }
                autoComplete="current-password"
                required
              />
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
          </>
        )}


        {mode==='forgot' && (
          <>
            <label>
              E-Mail-Adresse

              <input
                type="email"
                value={email}
                onChange={event=>
                  setEmail(
                    event.target.value
                  )
                }
                autoComplete="email"
                required
              />
            </label>


            <div className="login-reset-info">
              Der Link ist aus Sicherheitsgründen
              nur 20 Minuten gültig.
            </div>
          </>
        )}


        {mode==='reset' && (
          <>
            <label>
              Neues Passwort

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
            </label>


            <label>
              Passwort wiederholen

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

          {busy
            ? 'Bitte warten…'

            : mode==='login'
              ? 'Anmelden'

              : mode==='forgot'
                ? 'Reset-Link senden'

                : 'Neues Passwort speichern'
          }

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


        {mode==='login' && (
          <small>
            Die Entwicklungszugänge werden durch
            das Seed-Skript angelegt.
            Produktivpasswörter sind nicht
            im Repository enthalten.
          </small>
        )}

      </form>

    </div>
  )
}
