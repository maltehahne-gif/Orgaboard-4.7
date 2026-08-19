import {FormEvent, useEffect, useState} from 'react'
import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {useToast} from '../components/Toast'
import {APP_VERSION, CHANGELOG} from '../lib/changelog'
import {NotificationSettings} from '../components/NotificationSettings'
import {LoadError} from '../components/LoadError'

type P = {
  id: string
  display_name: string
  position: string
  monthly_units_target: number
  weekly_revenue_target_cents: number | null
  daily_area_target_cents: number | null
  daily_total_target_cents: number | null
}

/* Gespeichert wird in Cent, eingegeben wird in Euro.

   Cent in der Datenbank, weil Geldbetraege als Fliesskommazahl auf Dauer
   Rundungsfehler ansammeln. Euro im Formular, weil niemand sein Wochenziel
   als "1000000" eintippt. Die Umrechnung gehoert genau hierhin - die API
   bleibt unveraendert bei Cent, wie ueberall sonst im System auch.

   Die Felder halten waehrend der Eingabe Text, keine Zahl. Wer "4000," tippt,
   haette sonst nach dem Komma ein leeres Feld: aus "4000," wird keine Zahl,
   und der umgerechnete Wert wuerde die Eingabe sofort ueberschreiben. */

export function inEuro(cent: number | null | undefined): string {
  return cent === null || cent === undefined ? '' : String(cent / 100)
}

export function inCent(eingabe: string): number | null {
  const roh = eingabe.trim().replace(',', '.')
  if (roh === '') return null
  const euro = Number(roh)
  if (!Number.isFinite(euro) || euro < 0) return null
  // Runden, weil 4000.5 * 100 in JavaScript nicht exakt 400050 ergibt.
  return Math.round(euro * 100)
}

type Zielfelder = {einheiten: string; woche: string; gebiet: string; gesamt: string}

/* Anschrift und Telefonnummer des Kundenberaters. Sie stehen oben links auf
   jeder Rechnung, die er ausstellt - deshalb pflegt sie jeder selbst. Fest
   im Code hinterlegt waere sie fuer genau einen Berater richtig. */
type Kontaktdaten = {
  full_name: string
  phone: string | null
  street: string | null
  house_number: string | null
  postal_code: string | null
  city: string | null
}

const LEERE_KONTAKTDATEN: Kontaktdaten = {
  full_name: '', phone: '', street: '', house_number: '', postal_code: '', city: '',
}

function ausProfil(p: P): Zielfelder {
  return {
    einheiten: String(p.monthly_units_target),
    woche: inEuro(p.weekly_revenue_target_cents),
    gebiet: inEuro(p.daily_area_target_cents),
    gesamt: inEuro(p.daily_total_target_cents),
  }
}

export function ProfilePage() {
  const {me, refresh} = useAuth()
  const [p, setP] = useState<P | null>(null)
  const [ziele, setZiele] = useState<Zielfelder | null>(null)
  const [pw, setPw] = useState({current_password: '', new_password: ''})
  const [kontakt, setKontakt] = useState<Kontaktdaten | null>(null)
  const [kontaktBusy, setKontaktBusy] = useState(false)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [zieleBusy, setZieleBusy] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const toast = useToast()

  const load = () => {
    api<P>('/profile').then(daten => {
      setP(daten)
      setZiele(ausProfil(daten))
      setLadefehler(null)
    }).catch(err => {
      setLadefehler(err instanceof Error ? err.message : 'Profil konnte nicht geladen werden')
    })
  }

  useEffect(load, [])

  useEffect(() => {
    api<Kontaktdaten>('/profile/kontaktdaten')
      .then(daten => setKontakt({...LEERE_KONTAKTDATEN, ...daten}))
      .catch(() => setKontakt(LEERE_KONTAKTDATEN))
  }, [])

  async function kontaktdatenSpeichern(e: FormEvent) {
    e.preventDefault()
    if (!kontakt || kontaktBusy) return
    setKontaktBusy(true)
    try {
      const gespeichert = await api<Kontaktdaten>('/profile/kontaktdaten', {
        method: 'PUT',
        body: JSON.stringify({
          phone: kontakt.phone,
          street: kontakt.street,
          house_number: kontakt.house_number,
          postal_code: kontakt.postal_code,
          city: kontakt.city,
        }),
      })
      setKontakt({...LEERE_KONTAKTDATEN, ...gespeichert})
      await refresh()
      toast('Kontaktdaten gespeichert')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Kontaktdaten konnten nicht gespeichert werden', 'error')
    } finally {
      setKontaktBusy(false)
    }
  }

  async function targets(e: FormEvent) {
    e.preventDefault()
    if (!p || !ziele || zieleBusy) return

    const einheiten = Number(ziele.einheiten)
    if (!Number.isInteger(einheiten) || einheiten < 1) {
      toast('Das Monatsziel muss eine ganze Zahl ab 1 sein', 'error')
      return
    }

    const daten: P = {
      ...p,
      monthly_units_target: einheiten,
      weekly_revenue_target_cents: inCent(ziele.woche),
      daily_area_target_cents: inCent(ziele.gebiet),
      daily_total_target_cents: inCent(ziele.gesamt),
    }

    setZieleBusy(true)
    try {
      await api('/profile', {method: 'PUT', body: JSON.stringify(daten)})
      setP(daten)
      // Zurueckschreiben, damit eine Eingabe wie "2.500,00" als "2500"
      // dasteht - so sieht man, was tatsaechlich gespeichert wurde.
      setZiele(ausProfil(daten))
      toast('Ziele gespeichert')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setZieleBusy(false)
    }
  }

  async function password(e: FormEvent) {
    e.preventDefault()
    if (pwBusy) return
    setPwBusy(true)
    try {
      await api('/auth/change-password', {method: 'POST', body: JSON.stringify(pw)})
      setPw({current_password: '', new_password: ''})
      await refresh()
      toast('Passwort geändert')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setPwBusy(false)
    }
  }

  if (!p && ladefehler) {
    return (
      <div className="page">
        <LoadError meldung={ladefehler} onRetry={load} />
      </div>
    )
  }
  if (!p || !ziele) return <div className="loading">Profil wird geladen…</div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Profil</h1>
          <p>{p.display_name} · {p.position}</p>
        </div>
      </div>

      <div className="two-col">
        <form className="card form-grid" onSubmit={targets}>
          <h2 className="span-2">Zielvorgaben</h2>

          <label>
            Monatsziel Einheiten
            <input
              type="number"
              min="1"
              value={ziele.einheiten}
              onChange={e => setZiele({...ziele, einheiten: e.target.value})}
            />
          </label>

          <label>
            Wochenumsatzziel (€)
            <input
              inputMode="decimal"
              placeholder="z. B. 10000"
              value={ziele.woche}
              onChange={e => setZiele({...ziele, woche: e.target.value})}
            />
          </label>

          <label>
            Festgebiet Soll / Tag (€)
            <input
              inputMode="decimal"
              placeholder="z. B. 2500"
              value={ziele.gebiet}
              onChange={e => setZiele({...ziele, gebiet: e.target.value})}
            />
          </label>

          <label>
            Gesamtumsatz Soll / Tag (€)
            <input
              inputMode="decimal"
              placeholder="z. B. 4000"
              value={ziele.gesamt}
              onChange={e => setZiele({...ziele, gesamt: e.target.value})}
            />
          </label>

          <p className="span-2 muted profil-hinweis">
            Beträge in Euro eintragen. <strong>10000</strong> bedeutet 10.000 €.
            Ein leeres Feld heißt „kein Ziel gesetzt" – das ist etwas anderes als 0 €.
          </p>

          <div className="form-actions span-2">
            <button className="primary" disabled={zieleBusy}>{zieleBusy ? 'Speichert…' : 'Ziele speichern'}</button>
          </div>
        </form>

        <form className="card form-grid" onSubmit={kontaktdatenSpeichern}>
          <h2 className="span-2">Kontaktdaten für Rechnungen</h2>

          <p className="span-2 muted profil-hinweis">
            Diese Angaben stehen oben links auf jeder Rechnung, die du erstellst.
          </p>

          <label>
            Straße
            <input
              value={kontakt?.street || ''}
              onChange={e => setKontakt({...(kontakt || LEERE_KONTAKTDATEN), street: e.target.value})}
            />
          </label>

          <label>
            Hausnummer
            <input
              value={kontakt?.house_number || ''}
              onChange={e => setKontakt({...(kontakt || LEERE_KONTAKTDATEN), house_number: e.target.value})}
            />
          </label>

          <label>
            PLZ
            <input
              value={kontakt?.postal_code || ''}
              onChange={e => setKontakt({...(kontakt || LEERE_KONTAKTDATEN), postal_code: e.target.value})}
            />
          </label>

          <label>
            Ort
            <input
              value={kontakt?.city || ''}
              onChange={e => setKontakt({...(kontakt || LEERE_KONTAKTDATEN), city: e.target.value})}
            />
          </label>

          <label className="span-2">
            Telefon / Mobil
            <input
              value={kontakt?.phone || ''}
              onChange={e => setKontakt({...(kontakt || LEERE_KONTAKTDATEN), phone: e.target.value})}
            />
          </label>

          <div className="form-actions span-2">
            <button className="primary" disabled={kontaktBusy || !kontakt}>
              {kontaktBusy ? 'Speichert…' : 'Kontaktdaten speichern'}
            </button>
          </div>
        </form>

        <form className="card form-grid" onSubmit={password}>
          <h2 className="span-2">Passwort ändern</h2>

          {me?.must_change_password && (
            <div className="warning-box span-2">
              Das Seed-Passwort muss beim ersten Login geändert werden.
            </div>
          )}

          <label className="span-2">
            Aktuelles Passwort
            <input
              type="password"
              required
              value={pw.current_password}
              onChange={e => setPw({...pw, current_password: e.target.value})}
            />
          </label>

          <label className="span-2">
            Neues Passwort
            <input
              type="password"
              minLength={12}
              required
              value={pw.new_password}
              onChange={e => setPw({...pw, new_password: e.target.value})}
            />
          </label>

          <div className="form-actions span-2">
            <button className="primary" disabled={pwBusy}>{pwBusy ? 'Ändert…' : 'Passwort ändern'}</button>
          </div>
        </form>
      </div>

      <NotificationSettings />

      <section className="card changelog-card">
        <h2>Was ist neu · OrgaBoard v{APP_VERSION}</h2>
        {CHANGELOG.map(entry => (
          <div className="changelog-entry" key={entry.version}>
            <h3>v{entry.version} <small>{entry.date}</small></h3>
            <ul>
              {entry.notes.map(note => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}
