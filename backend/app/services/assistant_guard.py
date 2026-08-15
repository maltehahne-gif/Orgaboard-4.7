"""Schranken fuer die schreibenden Werkzeuge des Assistenten.

Zwei Probleme, die der Bestand hatte:

1. Nur `create_sale` verlangte eine Bestaetigung, und zwar ueber ein
   Argument, das *das Modell selbst setzt*. Ein Modell, das `confirm=true`
   mitschickt, hat damit niemanden gefragt - die Zusicherung "erst
   bestaetigen, dann schreiben" war eine Bitte an das Modell, keine
   Schranke. Termin anlegen, Status aendern und Nachricht senden schrieben
   ohne jede Rueckfrage.

2. Von vier schreibenden Werkzeugen landete nur eines im Protokoll.

Deshalb hier ein Zwischenschritt, an dem das Modell nicht vorbeikommt: eine
schreibende Absicht wird als *Vorhaben* gespeichert und zurueckgegeben. Erst
ein eigener Aufruf des Benutzers - nicht des Modells - fuehrt sie aus. Das
Vorhaben traegt eine eigene Kennung; ausgefuehrt wird genau das, was darin
steht, nicht das, was das Modell im zweiten Anlauf schickt.

Die Vorhaben liegen im Arbeitsspeicher und verfallen. Sie sind ein
Zwischenschritt von Sekunden, kein Datenbestand - eine Tabelle dafuer waere
Ballast, und ein Neustart darf ein unbestaetigtes Vorhaben ruhig vergessen.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

# Werkzeuge, die Daten veraendern. Alles andere liest nur.
SCHREIBENDE_WERKZEUGE = {
    "create_appointment",
    "update_appointment_status",
    "create_sale",
    "send_message",
    "create_follow_up",
    "complete_follow_up",
    "create_customer_note",
}

# So lange bleibt ein Vorhaben gueltig. Lang genug zum Lesen und Bestaetigen,
# kurz genug, dass ein vergessenes Vorhaben nicht Stunden spaeter noch
# ausgefuehrt werden kann.
GUELTIG_SEKUNDEN = 600

# Obergrenze je Benutzer, damit ein Modell in einer Schleife nicht den
# Arbeitsspeicher fuellt.
MAX_OFFEN_JE_BENUTZER = 20


@dataclass
class Vorhaben:
    id: str
    user_id: str
    werkzeug: str
    argumente: dict
    beschreibung: str
    erstellt: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def abgelaufen(self) -> bool:
        return datetime.now(timezone.utc) - self.erstellt > timedelta(seconds=GUELTIG_SEKUNDEN)


_offen: dict[str, Vorhaben] = {}


def _aufraeumen() -> None:
    for kennung in [k for k, v in _offen.items() if v.abgelaufen()]:
        _offen.pop(kennung, None)


def vormerken(user_id: str, werkzeug: str, argumente: dict, beschreibung: str) -> dict:
    """Legt ein Vorhaben ab und gibt zurueck, was dem Benutzer gezeigt wird."""
    _aufraeumen()

    eigene = [k for k, v in _offen.items() if v.user_id == user_id]
    while len(eigene) >= MAX_OFFEN_JE_BENUTZER:
        _offen.pop(eigene.pop(0), None)

    kennung = secrets.token_urlsafe(16)
    _offen[kennung] = Vorhaben(
        id=kennung,
        user_id=user_id,
        werkzeug=werkzeug,
        # Kopie, damit spaetere Aenderungen am Aufrufobjekt das Vorhaben
        # nicht stillschweigend umschreiben.
        argumente=dict(argumente),
        beschreibung=beschreibung,
    )

    return {
        "requires_confirmation": True,
        "action_id": kennung,
        "action": werkzeug,
        "summary": beschreibung,
        "message": "Diese Änderung wird erst nach deiner Bestätigung ausgeführt.",
    }


def einloesen(user_id: str, action_id: str) -> Vorhaben:
    """Holt ein Vorhaben zur Ausfuehrung - genau einmal.

    Die Pruefung auf den Benutzer ist nicht Formsache: die Kennung ist zwar
    schwer zu erraten, aber ein Vorhaben gehoert genau einer Person, und
    ausgefuehrt wird es unter deren Rechten.
    """
    _aufraeumen()

    vorhaben = _offen.get(action_id)
    if vorhaben is None:
        raise HTTPException(
            status_code=404,
            detail="Diese Aktion ist nicht mehr offen. Bitte neu anfragen.",
        )
    if vorhaben.user_id != user_id:
        # Bewusst dieselbe Meldung wie oben - sonst verraet die Antwort,
        # dass es die Kennung gibt.
        raise HTTPException(
            status_code=404,
            detail="Diese Aktion ist nicht mehr offen. Bitte neu anfragen.",
        )

    # Entfernen vor der Ausfuehrung: ein zweimal abgeschickter Klick soll
    # keinen zweiten Verkauf anlegen.
    _offen.pop(action_id, None)
    return vorhaben


def offene_anzahl(user_id: str) -> int:
    _aufraeumen()
    return len([v for v in _offen.values() if v.user_id == user_id])


def alles_vergessen() -> None:
    """Nur fuer Tests."""
    _offen.clear()
