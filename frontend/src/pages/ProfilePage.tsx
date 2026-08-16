import {FormEvent, useEffect, useState} from 'react'
import {api} from '../lib/api'
import {useAuth} from '../lib/auth'
import {useToast} from '../components/Toast'
import {APP_VERSION, CHANGELOG} from '../lib/changelog'
import {NotificationSettings} from '../components/NotificationSettings'

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
  const toast = useToast()

  useEffect(() => {
    api<P>('/profile').then(daten => {
      setP(daten)
      setZiele(ausProfil(daten))
    })
  }, [])

  async function targets(e: FormEvent) {
    e.preventDefault()
    if (!p || !ziele) return

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

    try {
      await api('/profile', {method: 'PUT', body: JSON.stringify(daten)})
      setP(daten)
      // Zurueckschreiben, damit eine Eingabe wie "2.500,00" als "2500"
      // dasteht - so sieht man, was tatsaechlich gespeichert wurde.
      setZiele(ausProfil(daten))
      toast('Ziele gespeichert')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    }
  }

  async function password(e: FormEvent) {
    e.preventDefault()
    try {
      await api('/auth/change-password', {method: 'POST', body: JSON.stringify(pw)})
      setPw({current_password: '', new_password: ''})
      await refresh()
      toast('Passwort geändert')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler', 'error')
    }
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
            <button className="primary">Ziele speichern</button>
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
            <button className="primary">Passwort ändern</button>
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
