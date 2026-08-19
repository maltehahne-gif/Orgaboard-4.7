"""Kunden der Gebietslisten dem zustaendigen Mitarbeiter zuordnen.

Anlass ist die Gesamtanalyse der Kundenlisten vom 18.08.2026: neun
Gebietslisten (jede doppelt uebermittelt, bereinigt 1.339 Datensaetze) sollen
dem Mitarbeiter "Joachim Hansen" zugeordnet werden - aber nur dort, wo die
Zuordnung fachlich eindeutig ist.

Grundsatz: im Zweifel nicht anfassen.
--------------------------------------------------------------------
Geaendert wird ausschliesslich `customers.employee_id`. Name, Adresse,
Telefon, E-Mail, Notizen, Sperrvermerke, Verkaeufe, Termine, Angebote,
Verleih, Wiedervorlagen und Historien bleiben unberuehrt; geloescht oder
zusammengefuehrt wird nichts. Ein Lauf ohne `--apply` ist ein reiner
Trockenlauf: er liest, rechnet und berichtet, schreibt aber nichts.

Was OrgaBoard ueber die Herkunft eines Kunden weiss
--------------------------------------------------------------------
Der Auftrag nennt die Reihenfolge Gebietskennung, Importquelle, Ortsteil,
Ort, PLZ, Strasse. Das Datenmodell (models.Customer) fuehrt davon nur Ort,
PLZ, Strasse und ein freies Notizfeld. Eine Gebiets- oder Quellkennung gibt
es als Spalte nicht - sie kann deshalb nur aus einem ausdruecklichen Vermerk
im Notizfeld kommen. Genau so ist die Reihenfolge hier umgesetzt:

  1. ausdruecklicher Gebiets-/Quellvermerk in den Notizen  (staerkste Quelle)
  2. Ort - aber nur bei Orten, die eindeutig zu genau einer Gebietsliste
     gehoeren
  3. PLZ - ausschliesslich als Gegenprobe, nie als alleiniger Beleg

Die Strasse wird bewusst nicht ausgewertet. Ein aehnlich klingender
Strassenname ist kein Beleg, und eine falsche Kundenzuweisung waere teurer
als eine ausgebliebene.

Flensburg
--------------------------------------------------------------------
219 Datensaetze der Analyse tragen den Ort Flensburg. Die zugrundeliegenden
Listen decken davon nur die Stadtteile Muerwik und Engelsby ab. Aus "Ort =
Flensburg" folgt also gerade nicht, dass der Kunde zum Gebiet gehoert.
Flensburger Datensaetze werden deshalb nur mit ausdruecklichem
Stadtteilvermerk zugeordnet - sonst gehen sie als "Zuordnung unklar" in den
Bericht und bleiben unveraendert.

Randorte
--------------------------------------------------------------------
Sterup, Steinberg, Dollerup, Westerholz, Ringsberg, Stangheck, Mittelangeln
und Suederhackstedt kommen in der Ortsverteilung vor, sind aber keine
eigene Gebietsliste. Ob ein solcher Datensatz aus einer der neun Listen
stammt, laesst sich aus den OrgaBoard-Daten allein nicht feststellen. Sie
werden nur mit ausdruecklichem Gebietsvermerk zugeordnet.

Aufruf
--------------------------------------------------------------------
    python -m app.tools.gebietszuordnung                     # Trockenlauf
    python -m app.tools.gebietszuordnung --apply \
        --sicherung vorher.csv                               # Aenderung
"""
from __future__ import annotations

import argparse
import csv
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import Customer, Employee, User


# --------------------------------------------------------------- Gebiete

# Die neun Gebietslisten aus der Analyse vom 18.08.2026 und die Orte, die
# ihnen eindeutig zugeordnet sind. "Eindeutig" heisst hier: der Ort gehoert
# zu genau einer dieser Listen und zu keinem konkurrierenden Bereich.
GEBIETE: dict[str, tuple[str, ...]] = {
    # Die Ortsnamen stehen hier bereits normalisiert (siehe normalisieren()):
    # klein, ohne Umlaute. "Esgrüs" wird dabei zu "esgrus" - genau die
    # Schreibweise, in der der Ort auch in der Ortsverteilung der Analyse
    # auftaucht.
    "Ahneby / Esgrüs / Niesgrau": ("ahneby", "esgrus", "niesgrau"),
    "Steinbergkirche": ("steinbergkirche",),
    "Sörup": ("sorup",),
    "Langballig": ("langballig",),
    "Wees / Munkbrarup": ("wees", "munkbrarup"),
    "Mürwik": (),        # Stadtteil von Flensburg - nie ueber den Ort
    "Engelsby": (),      # Stadtteil von Flensburg - nie ueber den Ort
    "Glücksburg Süd": (),   # Nord/Süd nur mit ausdruecklichem Vermerk
    "Glücksburg Nord": (),
}

# Glücksburg gehoert sicher zum Bereich, die Trennung in Nord und Sued laesst
# sich aus den OrgaBoard-Daten aber nicht ableiten. Der Ort wird deshalb dem
# Bereich als Ganzes zugerechnet, ohne Nord/Sued zu behaupten.
GLUECKSBURG_GEBIET = "Glücksburg (Nord/Süd nicht unterscheidbar)"
GLUECKSBURG_SCHREIBWEISEN = (
    "glucksburg",
    "glucksburg ostsee",
    "glucksburg (ostsee)",
)

# Orte, die aus dem Ort allein eindeutig zum Gebiet gehoeren.
EINDEUTIGE_ORTE: dict[str, str] = {}
for _gebiet, _orte in GEBIETE.items():
    for _ort in _orte:
        EINDEUTIGE_ORTE[_ort] = _gebiet
# "Esgrues" ausgeschrieben kommt in Exporten ebenfalls vor.
EINDEUTIGE_ORTE["esgrues"] = "Ahneby / Esgrüs / Niesgrau"

# Orte der Analyse, die keine eigene Gebietsliste sind. Ohne ausdrueckliche
# Gebietskennung bleibt offen, ob der Datensatz aus einer der neun Listen
# stammt - deshalb keine automatische Zuordnung.
RANDORTE: frozenset[str] = frozenset({
    "sterup",
    "steinberg",
    "dollerup",
    "westerholz",
    "ringsberg",
    "stangheck",
    "mittelangeln",
    "suderhackstedt",
})

# Flensburg: nur ueber den Stadtteil, nie ueber den Ort.
FLENSBURG = "flensburg"
FLENSBURG_STADTTEILE: dict[str, str] = {
    "murwik": "Mürwik",
    "engelsby": "Engelsby",
}

# Die Region liegt vollstaendig im PLZ-Bereich 24xxx. Bewusst nur der
# Praefix statt einer Liste einzelner Postleitzahlen: eine unvollstaendige
# Liste wuerde richtige Datensaetze aussortieren, und der Praefix genuegt,
# um einen gleichnamigen Ort in einer anderen Ecke Deutschlands abzufangen.
PLZ_REGION_PRAEFIX = "24"

# Vermerke, die im Notizfeld als Gebiets- oder Quellkennung gelten.
GEBIETS_STICHWORTE: dict[str, str] = {
    "murwik": "Mürwik",
    "muerwik": "Mürwik",
    "engelsby": "Engelsby",
    "glucksburg nord": "Glücksburg Nord",
    "glucksburg sud": "Glücksburg Süd",
    "glucksburg sued": "Glücksburg Süd",
    "steinbergkirche": "Steinbergkirche",
    "sorup": "Sörup",
    "langballig": "Langballig",
    "wees": "Wees / Munkbrarup",
    "munkbrarup": "Wees / Munkbrarup",
    "ahneby": "Ahneby / Esgrüs / Niesgrau",
    "esgrus": "Ahneby / Esgrüs / Niesgrau",
    "esgrues": "Ahneby / Esgrüs / Niesgrau",
    "niesgrau": "Ahneby / Esgrüs / Niesgrau",
}

MITARBEITER_NAME = "Joachim Hansen"


def normalisieren(wert: str | None) -> str:
    """Kleinschreibung ohne Umlaute, Satzzeichen und Mehrfachleerzeichen.

    "Glücksburg (Ostsee)", "Glücksburg (ostsee)" und "Glucksburg Ostsee"
    meinen denselben Ort. Ohne diese Vereinheitlichung waeren es drei.
    """
    if not wert:
        return ""
    zerlegt = unicodedata.normalize("NFKD", wert)
    ohne_akzente = "".join(z for z in zerlegt if not unicodedata.combining(z))
    ohne_akzente = ohne_akzente.replace("ß", "ss")
    gereinigt = "".join(z if z.isalnum() else " " for z in ohne_akzente.lower())
    return " ".join(gereinigt.split())


# ------------------------------------------------------------- Ergebnis

@dataclass
class Entscheidung:
    """Was mit genau einem Kunden geschieht - und warum."""

    customer_id: str
    gebiet: str | None
    grund: str
    zuordnen: bool
    schon_zugeordnet: bool = False
    fremdzuordnung: bool = False
    ort: str = ""


@dataclass
class Analyse:
    user_id: str | None = None
    employee_id: str | None = None
    kunden_gesamt: int = 0
    entscheidungen: list[Entscheidung] = field(default_factory=list)

    @property
    def kandidaten(self) -> list[Entscheidung]:
        """Alle Kunden, die ueberhaupt in den Gebietsraum fallen."""
        return [e for e in self.entscheidungen if e.gebiet is not None or e.grund.startswith("unklar")]

    @property
    def zu_aendern(self) -> list[Entscheidung]:
        return [e for e in self.entscheidungen if e.zuordnen]

    @property
    def bereits_zugeordnet(self) -> list[Entscheidung]:
        """Alle Kunden, die schon vorher diesem Mitarbeiter gehoerten."""
        return [e for e in self.entscheidungen if e.schon_zugeordnet]

    @property
    def bereits_im_gebiet(self) -> list[Entscheidung]:
        """Davon die, die auch fachlich ins Gebiet fallen.

        Getrennt gezaehlt, weil ein Mitarbeiter auch Kunden ausserhalb
        seines Gebiets betreuen kann. Wuerden die mitgezaehlt, saehe die
        betrachtete Menge groesser aus, als sie ist.
        """
        return [e for e in self.entscheidungen if e.schon_zugeordnet and e.gebiet]

    @property
    def unklar(self) -> list[Entscheidung]:
        return [e for e in self.entscheidungen if not e.zuordnen and not e.schon_zugeordnet]


# ----------------------------------------------------------- Mitarbeiter

class MitarbeiterNichtEindeutig(RuntimeError):
    """Kein oder mehr als ein passendes Konto - dann wird nicht geraten."""


def finde_mitarbeiter(db: Session, name: str = MITARBEITER_NAME) -> tuple[User, Employee]:
    """Konto und Mitarbeiterprofil zum vollstaendigen Namen.

    Es muss genau ein aktives Konto geben. Bei keinem oder mehreren wird
    abgebrochen: eine Zuordnung an den falschen Namensvetter liesse sich
    nachtraeglich kaum noch auseinandersortieren.
    """
    gesucht = normalisieren(name)
    treffer = [
        u for u in db.scalars(select(User).where(User.is_active.is_(True))).all()
        if normalisieren(u.full_name) == gesucht
    ]

    if not treffer:
        raise MitarbeiterNichtEindeutig(
            f"Kein aktives Benutzerkonto mit dem Namen „{name}“ gefunden."
        )
    if len(treffer) > 1:
        ids = ", ".join(sorted(u.id for u in treffer))
        raise MitarbeiterNichtEindeutig(
            f"{len(treffer)} aktive Konten heißen „{name}“ ({ids}). "
            "Es wird nicht geraten - bitte zuerst klären, welches gemeint ist."
        )

    user = treffer[0]
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee is None:
        raise MitarbeiterNichtEindeutig(
            f"Zu „{name}“ gibt es kein Mitarbeiterprofil - ohne employee.id "
            "kann kein Kunde zugeordnet werden."
        )
    return user, employee


# ------------------------------------------------------------ Bewertung

def gebiet_aus_notiz(notizen: str | None) -> str | None:
    """Ausdruecklicher Gebiets- oder Quellvermerk - die staerkste Quelle.

    Nur eindeutige Treffer zaehlen: nennt eine Notiz zwei verschiedene
    Gebiete, ist sie kein Beleg, sondern ein Widerspruch.
    """
    text = normalisieren(notizen)
    if not text:
        return None
    gefunden = {
        gebiet for stichwort, gebiet in GEBIETS_STICHWORTE.items()
        if stichwort in text
    }
    return gefunden.pop() if len(gefunden) == 1 else None


def bewerte(kunde: Customer) -> tuple[str | None, str]:
    """(Gebiet, Begruendung) fuer genau einen Kunden.

    Gebiet ist None, wenn der Kunde nicht sicher ins Gebiet gehoert. Die
    Begruendung geht in den Bericht und faengt bei einem offenen Fall mit
    "unklar" an.
    """
    ort = normalisieren(kunde.city)
    plz = (kunde.postal_code or "").strip()

    # (1) Ausdrueckliche Gebiets-/Quellkennung schlaegt alles andere.
    vermerkt = gebiet_aus_notiz(kunde.notes)
    if vermerkt:
        return vermerkt, "Gebietskennung in den Notizen"

    if not ort:
        return None, "unklar: kein Ort hinterlegt"

    # (2) Flensburg nie ueber den Ort - die Listen decken nur zwei
    #     Stadtteile ab, der Ort deckt die ganze Stadt.
    if ort.startswith(FLENSBURG):
        for stichwort, stadtteil in FLENSBURG_STADTTEILE.items():
            if stichwort in ort:
                return stadtteil, "Stadtteil im Ortsfeld"
        return None, "unklar: Flensburg ohne Stadtteil (Mürwik/Engelsby nicht belegt)"

    # (3) PLZ als Gegenprobe. Eine vorhandene, aber regionsfremde PLZ ist ein
    #     Widerspruch zum Ortsnamen - dann lieber nichts anfassen. Eine
    #     fehlende PLZ ist dagegen kein Hindernis: Luecken in den Daten
    #     duerfen die Zuordnung nicht blockieren.
    if plz and not plz.startswith(PLZ_REGION_PRAEFIX):
        return None, f"unklar: PLZ {plz[:2]}xxx liegt außerhalb der Region"

    if ort in GLUECKSBURG_SCHREIBWEISEN:
        return GLUECKSBURG_GEBIET, "Ort eindeutig im Gebiet"

    if ort in EINDEUTIGE_ORTE:
        return EINDEUTIGE_ORTE[ort], "Ort eindeutig im Gebiet"

    if ort in RANDORTE:
        return None, "unklar: Randort ohne Gebietskennung"

    return None, "außerhalb des Gebiets"


def analysiere(
    db: Session,
    employee_id: str,
    fremdzuordnung_uebernehmen: bool = True,
) -> Analyse:
    """Alles durchrechnen, ohne irgendetwas zu aendern."""
    ergebnis = Analyse(employee_id=employee_id)
    ergebnis.kunden_gesamt = db.scalar(
        select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None))
    ) or 0

    kunden = db.scalars(
        select(Customer).where(Customer.deleted_at.is_(None)).order_by(Customer.id)
    ).all()

    for kunde in kunden:
        gebiet, grund = bewerte(kunde)
        schon = kunde.employee_id == employee_id
        fremd = not schon

        zuordnen = bool(gebiet) and not schon
        if zuordnen and fremd and not fremdzuordnung_uebernehmen:
            zuordnen = False
            grund = "bestehende fremde Zuordnung - manuelle Prüfung"

        ergebnis.entscheidungen.append(Entscheidung(
            customer_id=kunde.id,
            gebiet=gebiet,
            grund=grund if not schon else "bereits Joachim Hansen zugeordnet",
            zuordnen=zuordnen,
            schon_zugeordnet=schon,
            fremdzuordnung=fremd,
            ort=(kunde.city or "").strip(),
        ))

    return ergebnis


# -------------------------------------------------------------- Anwenden

def sicherung_schreiben(db: Session, analyse: Analyse, pfad: str) -> int:
    """Vorherige Zuordnung als CSV festhalten - der Weg zurueck.

    Bewusst nur zwei technische Spalten. Ein Rueckweg braucht die Kunden-ID
    und den vorherigen Mitarbeiter, keine personenbezogenen Daten.
    """
    zeilen = 0
    with open(pfad, "w", newline="", encoding="utf-8") as datei:
        schreiber = csv.writer(datei, delimiter=";")
        schreiber.writerow(["customer_id", "employee_id_vorher", "employee_id_nachher"])
        for eintrag in analyse.zu_aendern:
            kunde = db.get(Customer, eintrag.customer_id)
            if kunde is None:
                continue
            schreiber.writerow([kunde.id, kunde.employee_id, analyse.employee_id])
            zeilen += 1
    return zeilen


def anwenden(db: Session, analyse: Analyse) -> int:
    """Nur employee_id setzen - sonst nichts, alles in einer Transaktion."""
    geaendert = 0
    for eintrag in analyse.zu_aendern:
        kunde = db.get(Customer, eintrag.customer_id)
        if kunde is None or kunde.employee_id == analyse.employee_id:
            continue
        kunde.employee_id = analyse.employee_id
        geaendert += 1
    db.commit()
    return geaendert


# --------------------------------------------------------------- Bericht

def _zaehle(werte) -> list[tuple[str, int]]:
    zaehler: dict[str, int] = {}
    for wert in werte:
        zaehler[wert] = zaehler.get(wert, 0) + 1
    return sorted(zaehler.items(), key=lambda paar: (-paar[1], paar[0]))


def bericht(analyse: Analyse, user: User | None = None) -> str:
    """Ausschliesslich Aggregate und technische IDs.

    Namen, Strassen, Telefonnummern und E-Mail-Adressen kommen hier nicht
    vor - ein Bericht ueber 1.339 Kunden ist sonst ein Datenexport.
    """
    zeilen: list[str] = []
    ausgabe = zeilen.append

    ausgabe("=" * 68)
    ausgabe("GEBIETSZUORDNUNG – ANALYSE")
    ausgabe(f"Stand: {datetime.now(timezone.utc):%d.%m.%Y %H:%M} UTC")
    ausgabe("=" * 68)
    ausgabe("")
    ausgabe(f"Mitarbeiter:        {MITARBEITER_NAME}")
    ausgabe(f"Benutzer-ID:        {user.id if user else '–'}")
    ausgabe(f"Employee-ID:        {analyse.employee_id or '–'}")
    ausgabe("")

    zuordenbar = analyse.zu_aendern
    bereits = analyse.bereits_zugeordnet
    offen = [e for e in analyse.unklar if e.grund.startswith(("unklar", "bestehende"))]
    ausserhalb = [e for e in analyse.entscheidungen
                  if e.grund == "außerhalb des Gebiets"]

    im_gebiet = analyse.bereits_im_gebiet
    ausgabe("MENGEN")
    ausgabe(f"  Kunden gesamt (nicht gelöscht):        {analyse.kunden_gesamt:>6}")
    ausgabe(f"  im Gebietsraum betrachtet:            {len(zuordenbar) + len(im_gebiet) + len(offen):>6}")
    ausgabe(f"  aktuell {MITARBEITER_NAME} zugeordnet:  {len(bereits):>6}")
    ausgabe(f"    davon innerhalb des Gebiets:        {len(im_gebiet):>6}")
    ausgabe(f"  eindeutig zuordenbar (Änderung):      {len(zuordenbar):>6}")
    ausgabe(f"  unklar / nicht verändert:             {len(offen):>6}")
    ausgabe(f"  außerhalb des Gebiets:                {len(ausserhalb):>6}")
    ausgabe("")

    fremd = [e for e in analyse.entscheidungen if e.fremdzuordnung and not e.schon_zugeordnet]
    fremd_uebernommen = [e for e in fremd if e.zuordnen]
    fremd_belassen = [e for e in fremd if not e.zuordnen and e.grund.startswith(("unklar", "bestehende"))]
    ausgabe("BESTEHENDE FREMDE ZUORDNUNG")
    ausgabe(f"  vorher anderem Mitarbeiter zugeordnet: {len(fremd):>6}")
    ausgabe(f"  davon eindeutig übernommen:            {len(fremd_uebernommen):>6}")
    ausgabe(f"  davon nicht verändert:                 {len(fremd_belassen):>6}")
    ausgabe("")

    ausgabe("ZUORDNUNG NACH GEBIET (nur die Änderungen)")
    for gebiet, anzahl in _zaehle(e.gebiet for e in zuordenbar if e.gebiet):
        ausgabe(f"  {gebiet:<45} {anzahl:>6}")
    if not zuordenbar:
        ausgabe("  (keine)")
    ausgabe("")

    ausgabe("ZUORDNUNG NACH ORT (nur die Änderungen)")
    for ort, anzahl in _zaehle(e.ort or "(ohne Ort)" for e in zuordenbar):
        ausgabe(f"  {ort:<45} {anzahl:>6}")
    if not zuordenbar:
        ausgabe("  (keine)")
    ausgabe("")

    ausgabe("UNKLARE FÄLLE NACH GRUND")
    for grund, anzahl in _zaehle(e.grund for e in offen):
        ausgabe(f"  {grund:<45} {anzahl:>6}")
    if not offen:
        ausgabe("  (keine)")
    ausgabe("")

    ausgabe("HINWEIS")
    ausgabe("  Geändert wird ausschließlich customers.employee_id.")
    ausgabe("  Adresse, Telefon, E-Mail, Notizen, EWE/BNW, Sperrvermerke,")
    ausgabe("  Verkäufe, Termine, Angebote, Verleih und Historien bleiben")
    ausgabe("  unberührt. Es wird nichts gelöscht und nichts zusammengeführt.")

    return "\n".join(zeilen)


# ------------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Kunden der Gebietslisten einem Mitarbeiter zuordnen.",
    )
    parser.add_argument(
        "--name", default=MITARBEITER_NAME,
        help="Vollständiger Name des Mitarbeiters (Standard: Joachim Hansen)",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Änderung wirklich schreiben. Ohne diese Angabe nur Trockenlauf.",
    )
    parser.add_argument(
        "--sicherung", default=None,
        help="CSV-Datei für die vorherige Zuordnung. Für --apply erforderlich.",
    )
    parser.add_argument(
        "--fremdzuordnung-behalten", action="store_true",
        help=(
            "Kunden, die bereits einem anderen Mitarbeiter gehören, gar nicht "
            "übernehmen - auch nicht bei eindeutiger Gebietslage."
        ),
    )
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        try:
            user, employee = finde_mitarbeiter(db, args.name)
        except MitarbeiterNichtEindeutig as fehler:
            print(f"Abbruch: {fehler}", file=sys.stderr)
            return 2

        analyse = analysiere(
            db,
            employee.id,
            fremdzuordnung_uebernehmen=not args.fremdzuordnung_behalten,
        )
        analyse.user_id = user.id
        print(bericht(analyse, user))
        print()

        if not args.apply:
            print("TROCKENLAUF – es wurde nichts geändert.")
            print("Zum Schreiben: --apply --sicherung <datei.csv>")
            print()
            print("Vorher sichern (siehe docs/DEPLOY.md):")
            print("  docker compose exec db pg_dump -U orgaboard orgaboard "
                  "> backup-$(date +%F).sql")
            return 0

        if not args.sicherung:
            print(
                "Abbruch: --apply verlangt --sicherung <datei.csv>. Ohne "
                "festgehaltene Ausgangslage gäbe es keinen Weg zurück.",
                file=sys.stderr,
            )
            return 2

        vorher = db.scalar(
            select(func.count()).select_from(Customer)
        ) or 0

        gesichert = sicherung_schreiben(db, analyse, args.sicherung)
        geaendert = anwenden(db, analyse)

        nachher = db.scalar(select(func.count()).select_from(Customer)) or 0

        print(f"Sicherung geschrieben: {gesichert} Zeilen → {args.sicherung}")
        print(f"Zuordnung geändert:    {geaendert}")
        print(f"Kunden vorher/nachher: {vorher} / {nachher}")
        if vorher != nachher:
            print(
                "WARNUNG: Die Kundenzahl hat sich verändert - das darf dieser "
                "Lauf nicht bewirken. Bitte prüfen.",
                file=sys.stderr,
            )
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
