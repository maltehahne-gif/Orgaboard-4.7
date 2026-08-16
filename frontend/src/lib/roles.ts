import type {Role} from '../types'

/* Spiegelt die Rangfolge aus backend/app/core/permissions.py.
   Zwei Listen, die dasselbe meinen, laufen auseinander - deshalb steht hier
   nur die Rangfolge, nicht die Rechtetabelle. Was ein Benutzer im Einzelnen
   darf, beantwortet der Server; die Oberflaeche blendet nur aus, was sie
   ohnehin nicht anzeigen kann. Verlassen darf man sich darauf nicht: die
   eigentliche Pruefung passiert im Backend. */

const RANG: Record<Role, number> = {
  EMPLOYEE: 0,
  TEAM_LEADER: 10,
  REGIONAL_LEAD: 20,
  SYSTEM_ADMIN: 100,
}

export const ROLLE_BEZEICHNUNG: Record<Role, string> = {
  EMPLOYEE: 'Mitarbeiter',
  TEAM_LEADER: 'Teamleiter',
  REGIONAL_LEAD: 'Regionalleiter',
  SYSTEM_ADMIN: 'Systemadministrator',
}

function rang(rolle: Role | undefined | null): number {
  return rolle ? (RANG[rolle] ?? 0) : -1
}

/** Ob die Rolle mindestens so weit reicht wie die verlangte. */
export function mindestens(rolle: Role | undefined | null, verlangt: Role): boolean {
  return rang(rolle) >= RANG[verlangt]
}

/** Darf über die eigenen Daten hinausschauen und verwalten. */
export function darfVerwalten(rolle: Role | undefined | null): boolean {
  return mindestens(rolle, 'TEAM_LEADER')
}

/** Betreiber – darf die Plattform selbst konfigurieren. */
export function istSystemAdmin(rolle: Role | undefined | null): boolean {
  return rolle === 'SYSTEM_ADMIN'
}

export function rolleBezeichnung(rolle: Role | undefined | null): string {
  return rolle ? (ROLLE_BEZEICHNUNG[rolle] ?? rolle) : '–'
}

/** Welche Rollen diese Rolle vergeben darf.
 *
 *  Spiegelt erlaubte_zielrollen() aus backend/app/core/benutzerscope.py:
 *  niemand vergibt die eigene Stufe. Ein Teamleiter kommt damit auf genau
 *  eine Auswahl (Mitarbeiter), und ernennen kann ihn nur die Stufe darüber.
 *
 *  Wieder nur ein Abbild. Ablehnen tut der Server – hier wird eine Auswahl
 *  gar nicht erst angeboten, die er ohnehin zurückweisen würde.
 */
export function zielrollen(rolle: Role | undefined | null): Role[] {
  if (istSystemAdmin(rolle)) return ['EMPLOYEE', 'TEAM_LEADER', 'REGIONAL_LEAD', 'SYSTEM_ADMIN']
  if (!darfVerwalten(rolle)) return []
  const eigener = rang(rolle)
  return (['EMPLOYEE', 'TEAM_LEADER', 'REGIONAL_LEAD'] as Role[]).filter(r => RANG[r] < eigener)
}

/** Ob diese Rolle die genannte Zielrolle vergeben darf.
 *
 *  Bewusst mit Zielrolle statt als bloßes „darf Rollen vergeben“: ein
 *  Teamleiter darf die Rolle Mitarbeiter vergeben und wäre damit unter der
 *  gröberen Frage berechtigt – die Schaltfläche, um die es geht, macht aber
 *  jemanden zum Teamleiter. Genau diese Verwechslung soll der Parameter
 *  verhindern.
 */
export function darfRolleVergeben(
  rolle: Role | undefined | null,
  ziel: Role,
): boolean {
  return zielrollen(rolle).includes(ziel)
}

/** Darf Konten endgültig löschen. Nur der Betreiber, serverseitig erzwungen. */
export function darfKontenLoeschen(rolle: Role | undefined | null): boolean {
  return istSystemAdmin(rolle)
}
