"""Statische Prüfungen der Migrationen.

Hintergrund: Die Testdatenbank ist SQLite, die Produktivdatenbank ist
PostgreSQL. Fehler, die nur PostgreSQL kennt, fallen in den Tests deshalb
nicht auf - sie zeigen sich erst beim Start des Containers, und dann steht
die Anwendung. Genau das ist einmal passiert: ein Enum-Typ wurde erst
ausdrücklich angelegt und danach von create_table ein zweites Mal, was
PostgreSQL mit "type already exists" abweist. SQLite kennt keine Enum-Typen
und hat den Fehler nie gezeigt.

Diese Prüfungen lesen die Migrationen als Text. Das ersetzt keinen Lauf
gegen eine echte PostgreSQL, fängt aber die Muster ab, die schon einmal
teuer waren.
"""
from __future__ import annotations

import io
import re
import tokenize
from pathlib import Path

import pytest

VERSIONEN = Path(__file__).resolve().parent.parent / "migrations" / "versions"


def _ohne_kommentare(quelltext: str) -> str:
    """Quelltext ohne Kommentare, aber mit unveränderter Zeilenstruktur.

    Sonst schlägt die Prüfung bei einem Kommentar an, der den Fehler nur
    beschreibt - genau das ist beim Beheben passiert.

    Die Kommentare werden an Ort und Stelle durch Leerzeichen ersetzt statt
    die Datei aus Tokens neu zusammenzusetzen. Ein Neuaufbau mit Zeilen-
    umbrüchen zwischen den Tokens zerreißt Ausdrücke wie `sa.Enum(` - die
    Prüfung fand dann nichts mehr und übersprang stillschweigend jede Datei.
    """
    zeilen = quelltext.splitlines(keepends=True)
    for token in tokenize.generate_tokens(io.StringIO(quelltext).readline):
        if token.type != tokenize.COMMENT:
            continue
        zeile, von = token.start[0] - 1, token.start[1]
        bis = token.end[1]
        text = zeilen[zeile]
        zeilen[zeile] = text[:von] + " " * (bis - von) + text[bis:]
    return "".join(zeilen)


def _migrationen() -> list[Path]:
    dateien = sorted(VERSIONEN.glob("*.py"))
    assert dateien, "Keine Migrationen gefunden - stimmt der Pfad noch?"
    return dateien


@pytest.mark.parametrize("pfad", _migrationen(), ids=lambda p: p.stem)
def test_enum_typ_wird_nicht_doppelt_angelegt(pfad: Path):
    """Ein Enum darf nicht ausdrücklich angelegt und zusätzlich in
    create_table verwendet werden.

    create_table() erzeugt den Typ auf PostgreSQL selbst. Beides zusammen
    scheitert mit "type ... already exists" - und damit scheitert der ganze
    Containerstart, weil davor `alembic upgrade head` steht.
    """
    quelltext = _ohne_kommentare(pfad.read_text(encoding="utf-8"))

    # Enum-Namen aus Zuweisungen wie: STATUS = sa.Enum(...)
    enum_namen = set(re.findall(r"^(\w+)\s*=\s*sa\.Enum\(", quelltext, re.MULTILINE))
    if not enum_namen:
        pytest.skip("keine Enum-Typen in dieser Migration")

    # Nur der upgrade()-Teil zählt; im downgrade() ist .drop()/.create()
    # ausdrücklich richtig, um den Typ zu beseitigen.
    upgrade = quelltext.split("def downgrade")[0]

    for name in enum_namen:
        ausdruecklich_angelegt = re.search(rf"\b{name}\.create\(", upgrade) is not None
        in_create_table = re.search(rf"sa\.Column\([^)]*\b{name}\b", upgrade) is not None

        assert not (ausdruecklich_angelegt and in_create_table), (
            f"{pfad.name}: Der Enum-Typ '{name}' wird mit {name}.create(...) angelegt "
            f"und zusätzlich als Spaltentyp in create_table verwendet. Auf PostgreSQL "
            f"legt create_table den Typ selbst an - der Start scheitert dann mit "
            f'"type already exists". Eines von beidem entfernen (siehe '
            f"e4a7c9b2f318_trade_ins.py: nur create_table, kein .create())."
        )


@pytest.mark.parametrize("pfad", _migrationen(), ids=lambda p: p.stem)
def test_keine_sqlite_eigenen_funktionen(pfad: Path):
    """Datenübernahmen dürfen keine Funktionen benutzen, die es nur in
    SQLite gibt.

    Solche Anweisungen laufen in den Tests durch und scheitern erst auf der
    Produktivdatenbank - dort dann beim Start, also mit Ausfall.
    """
    quelltext = _ohne_kommentare(pfad.read_text(encoding="utf-8"))
    # randomblob/hex sind SQLite-eigen; PostgreSQL kennt sie nicht.
    verboten = [
        name for name in ("randomblob(", "hex(")
        if name in quelltext
    ]
    assert not verboten, (
        f"{pfad.name}: benutzt {', '.join(verboten)} - das gibt es nur in SQLite. "
        f"Auf PostgreSQL scheitert die Migration und damit der Containerstart. "
        f"Dialektneutral schreiben (z. B. md5(random()::text) für PostgreSQL) "
        f"oder die Anweisung je Dialekt unterscheiden."
    )
