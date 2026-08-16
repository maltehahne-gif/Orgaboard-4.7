"""Rollen, Rechte und Sichtbarkeit an einer Stelle.

Vorher stand in 21 Abfragen sinngemaess "wenn Teamleiter, dann alles". Mit
zwei weiteren Stufen waere daraus in jeder einzelnen davon eine
Aufzaehlung geworden - und die eine vergessene Stelle faellt niemandem auf,
weil zu wenig zu sehen wie ein leerer Datenbestand aussieht und zu viel zu
sehen gar nicht auffaellt.

Deshalb hier zwei Begriffe, auf die sich alles zurueckfuehren laesst:

*Rang*  - eine hoehere Rolle darf alles, was eine niedrigere darf.
*Recht* - ein einzelnes Duerfen, das die Rolle vorgibt und der Betreiber
          je Benutzer abweichend setzen kann.

Der Systemadministrator ist bewusst nicht Teil der Rechtetabelle: er darf
alles, ohne Ausnahme und ohne Eintrag. Ein Betreiber, der sich selbst ein
Recht entziehen kann, sperrt sich irgendwann aus seiner eigenen Anlage aus.

Zwei Dinge stehen bewusst *nicht* allein in dieser Tabelle:

*Rollenvergabe* - ein Haken bei "Teamleiter ernennen" reicht nicht. Zusaetzlich
gilt immer die Rangregel aus benutzerscope.erlaubte_zielrollen(): niemand
vergibt die eigene Stufe. Sonst waere die Regel "ein Teamleiter macht keinen
zweiten Teamleiter" nur einen versehentlichen Haken weit entfernt.

*Konten endgueltig loeschen* - gar kein Recht, sondern fest an den
Systemadministrator gebunden (benutzerscope.pruefe_loeschrecht). Was sich
zuteilen laesst, laesst sich auch versehentlich zuteilen, und Loeschen ist
die einzige Aktion ohne Rueckweg.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Permission, Role, User, UserPermission

# Was eine Rolle ohne weiteres Zutun darf. Der Systemadministrator fehlt
# absichtlich - fuer ihn gibt es keine Liste, siehe hat_recht().
ROLLEN_RECHTE: dict[Role, set[Permission]] = {
    Role.EMPLOYEE: {
        Permission.KUNDEN_SEHEN,
        Permission.KUNDEN_BEARBEITEN,
        Permission.TERMINE_SEHEN,
        Permission.TERMINE_ERSTELLEN,
        Permission.TERMINE_BEARBEITEN,
        Permission.VERKAEUFE_SEHEN,
        Permission.VERKAEUFE_ERSTELLEN,
        Permission.CHAT_NUTZEN,
        Permission.DASHBOARD_SEHEN,
    },
    Role.TEAM_LEADER: {
        Permission.KUNDEN_SEHEN,
        Permission.KUNDEN_BEARBEITEN,
        Permission.KUNDEN_LOESCHEN,
        Permission.TERMINE_SEHEN,
        Permission.TERMINE_ERSTELLEN,
        Permission.TERMINE_BEARBEITEN,
        Permission.TERMINE_LOESCHEN,
        Permission.VERKAEUFE_SEHEN,
        Permission.VERKAEUFE_ERSTELLEN,
        Permission.VERKAEUFE_LOESCHEN,
        Permission.PRODUKTE_VERWALTEN,
        Permission.CHAT_NUTZEN,
        Permission.DASHBOARD_SEHEN,
        Permission.STATISTIK_SEHEN,
        Permission.EXPORT,
        # Der Teamleiter besetzt sein Team - mehr nicht. Die beiden
        # Rollenrechte fehlen hier absichtlich: eine Fuehrungsrolle darf er
        # weder vergeben noch entziehen.
        Permission.TEAM_MITGLIED_HINZUFUEGEN,
        Permission.TEAM_MITGLIED_ENTFERNEN,
    },
    Role.REGIONAL_LEAD: {
        Permission.KUNDEN_SEHEN,
        Permission.KUNDEN_BEARBEITEN,
        Permission.KUNDEN_LOESCHEN,
        Permission.TERMINE_SEHEN,
        Permission.TERMINE_ERSTELLEN,
        Permission.TERMINE_BEARBEITEN,
        Permission.TERMINE_LOESCHEN,
        Permission.VERKAEUFE_SEHEN,
        Permission.VERKAEUFE_ERSTELLEN,
        Permission.VERKAEUFE_LOESCHEN,
        Permission.PRODUKTE_VERWALTEN,
        Permission.CHAT_NUTZEN,
        Permission.DASHBOARD_SEHEN,
        Permission.STATISTIK_SEHEN,
        Permission.EXPORT,
        # Die Organisationsleitung setzt Teamleiter ein und ab - das ist
        # ihre eigentliche Aufgabe in dieser Struktur.
        Permission.TEAM_MITGLIED_HINZUFUEGEN,
        Permission.TEAM_MITGLIED_ENTFERNEN,
        Permission.ROLLE_TEAMLEITER_VERGEBEN,
        Permission.ROLLE_TEAMLEITER_ENTZIEHEN,
    },
}

RECHTE_BEZEICHNUNG: dict[Permission, str] = {
    Permission.KUNDEN_SEHEN: "Kunden sehen",
    Permission.KUNDEN_BEARBEITEN: "Kunden bearbeiten",
    Permission.KUNDEN_LOESCHEN: "Kunden löschen",
    Permission.TERMINE_SEHEN: "Termine sehen",
    Permission.TERMINE_ERSTELLEN: "Termine erstellen",
    Permission.TERMINE_BEARBEITEN: "Termine bearbeiten",
    Permission.TERMINE_LOESCHEN: "Termine löschen",
    Permission.VERKAEUFE_SEHEN: "Verkäufe sehen",
    Permission.VERKAEUFE_ERSTELLEN: "Verkäufe erstellen",
    Permission.VERKAEUFE_LOESCHEN: "Verkäufe löschen",
    Permission.PRODUKTE_VERWALTEN: "Produkte verwalten",
    Permission.CHAT_NUTZEN: "Chat benutzen",
    Permission.DASHBOARD_SEHEN: "Dashboard sehen",
    Permission.STATISTIK_SEHEN: "Statistiken sehen",
    Permission.EXPORT: "Export durchführen",
    Permission.TEAM_MITGLIED_HINZUFUEGEN: "Mitarbeiter ins Team aufnehmen",
    Permission.TEAM_MITGLIED_ENTFERNEN: "Mitarbeiter aus dem Team nehmen",
    Permission.ROLLE_TEAMLEITER_VERGEBEN: "Teamleiter ernennen",
    Permission.ROLLE_TEAMLEITER_ENTZIEHEN: "Teamleiter absetzen",
}


# --------------------------------------------------------------- Rollenrang

def ist_systemadmin(user: User) -> bool:
    return user.role == Role.SYSTEM_ADMIN


def mindestens(user: User, rolle: Role) -> bool:
    """Ob der Benutzer diese Stufe erreicht oder uebertrifft."""
    return user.role.mindestens(rolle)


def sieht_fremde_daten(user: User) -> bool:
    """Ob der Benutzer ueber die eigenen Daten hinausschauen darf.

    Genau die Frage, die vorher als "role == TEAM_LEADER" in den Abfragen
    stand. Als eigener Begriff laesst sie sich an einer Stelle beantworten.
    """
    return user.role.mindestens(Role.TEAM_LEADER)


def require_role(user: User, rolle: Role) -> User:
    if not user.role.mindestens(rolle):
        raise HTTPException(status_code=403, detail="Dafür fehlt die Berechtigung")
    return user


def require_system_admin(user: User) -> User:
    if not ist_systemadmin(user):
        raise HTTPException(status_code=403, detail="Nur für Systemadministratoren")
    return user


# ------------------------------------------------------------- Einzelrechte

def rollenrechte(rolle: Role) -> set[Permission]:
    """Was diese Rolle ohne Abweichung darf."""
    if rolle == Role.SYSTEM_ADMIN:
        return set(Permission)
    return set(ROLLEN_RECHTE.get(rolle, set()))


def abweichungen(db: Session, user_id: str) -> dict[Permission, bool]:
    """Ausdrueckliche Abweichungen vom Rollenstandard."""
    rows = db.scalars(select(UserPermission).where(UserPermission.user_id == user_id)).all()
    return {r.permission: r.allowed for r in rows}


def hat_recht(db: Session, user: User, recht: Permission) -> bool:
    """Ob dieser Benutzer dieses Recht hat.

    Der Systemadministrator wird vor der Tabelle abgefangen: ihm laesst sich
    nichts entziehen. Sonst koennte ein unbedachter Haken den Betreiber aus
    seiner eigenen Anlage aussperren - und niemand waere mehr da, ihn wieder
    hereinzulassen.
    """
    if ist_systemadmin(user):
        return True

    besonders = abweichungen(db, user.id)
    if recht in besonders:
        return besonders[recht]
    return recht in rollenrechte(user.role)


def require_permission(db: Session, user: User, recht: Permission) -> None:
    if not hat_recht(db, user, recht):
        raise HTTPException(
            status_code=403,
            detail=f"Fehlende Berechtigung: {RECHTE_BEZEICHNUNG.get(recht, recht.value)}",
        )


def rechte_uebersicht(db: Session, user: User) -> list[dict]:
    """Alle Rechte mit ihrem Zustand - fuer die Verwaltungsmaske."""
    standard = rollenrechte(user.role)
    besonders = abweichungen(db, user.id)
    admin = ist_systemadmin(user)

    return [
        {
            "permission": recht.value,
            "label": RECHTE_BEZEICHNUNG.get(recht, recht.value),
            "from_role": admin or recht in standard,
            "override": besonders.get(recht),
            "effective": True if admin else besonders.get(recht, recht in standard),
            # Beim Systemadministrator ist der Haken nicht verhandelbar.
            "locked": admin,
        }
        for recht in Permission
    ]
