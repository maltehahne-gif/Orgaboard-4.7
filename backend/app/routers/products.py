import csv
import io
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field, HttpUrl
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.permissions import sieht_fremde_daten
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import require_team_leader
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import local_today
from app.models import Product, ProductPrice, User
from app.services.product_data import upsert_verified_product
from app.services.serializers import current_price, product_out

router = APIRouter(prefix="/products", tags=["products"])


# Ein Geraetepreis bewegt sich im vierstelligen Bereich. Die Obergrenze von
# 100.000 Euro faengt eine verrutschte Null ab, bevor der Preis in Angebote,
# Verkaufsvorschlaege und Auswertungen einflieszt.
MAX_PREIS_CENT = 10_000_000


class PricePayload(BaseModel):
    amount_cents: int = Field(ge=0, le=MAX_PREIS_CENT)
    currency: str = "EUR"
    source_url: str
    verified: bool = False
    valid_from: date | None = None
    valid_to: date | None = None


class ImagePayload(BaseModel):
    url: str
    source_url: str
    alt_text: str | None = None
    usage_note: str | None = None
    verified: bool = False


class ProductImport(BaseModel):
    name: str
    category: str = ""
    description: str | None = None
    functions: list[str] = []
    technical: dict = {}
    variants: list = []
    accessories: list = []
    official_url: str | None = None
    source_url: str
    source_kind: str = "manual_verified"
    source_updated_at: datetime | None = None
    verified: bool = False
    price: PricePayload | None = None
    image: ImagePayload | None = None


@router.get("")
def list_products(q: str | None = Query(default=None), include_unverified: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.name)
    if not include_unverified or not sieht_fremde_daten(user):
        stmt = stmt.where(Product.verified.is_(True))
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q}%"))
    return [product_out(db, p) for p in db.scalars(stmt).all()]


@router.get("/archived")
def list_archived(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Archivierte Produkte. Nur für Teamleiter."""
    require_team_leader(user)
    rows = db.scalars(
        select(Product).where(Product.active.is_(False)).order_by(Product.category, Product.name)
    ).all()
    return [product_out(db, p) for p in rows]


def _preis_out(p: ProductPrice) -> dict:
    return {
        "id": p.id,
        "amount_cents": p.amount_cents,
        "currency": p.currency,
        "valid_from": p.valid_from,
        "valid_to": p.valid_to,
        "source_url": p.source_url,
        "verified": p.verified,
        "fetched_at": p.fetched_at,
    }


def _preisverlauf(db: Session, product_id: str) -> list[ProductPrice]:
    """Alle Preise eines Produkts, neuester Gueltigkeitsbeginn zuerst."""
    return list(db.scalars(
        select(ProductPrice)
        .where(ProductPrice.product_id == product_id)
        .order_by(ProductPrice.valid_from.desc().nullslast(), ProductPrice.fetched_at.desc())
    ).all())


@router.get("/prices/overview")
def price_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Alle Produkte mit ihrem gueltigen Preis - die zentrale Uebersicht.

    Bisher liess sich ein Preis nur beim Produktimport mitgeben. Wer wissen
    wollte, wo ueberhaupt ein Preis fehlt, musste jedes Produkt einzeln
    oeffnen. Teamleiter sehen auch unbestaetigte Produkte, sonst faellt
    genau die Luecke nicht auf, die geschlossen werden soll.
    """
    teamleiter = sieht_fremde_daten(user)
    stmt = select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.name)
    if not teamleiter:
        stmt = stmt.where(Product.verified.is_(True))

    zeilen = []
    for p in db.scalars(stmt).all():
        gueltig = current_price(db, p.id)
        alle = _preisverlauf(db, p.id)
        zeilen.append({
            "product_id": p.id,
            "name": p.name,
            "category": p.category,
            "verified": p.verified,
            "price": _preis_out(gueltig) if gueltig else None,
            # Unbestaetigte Preise zaehlen nicht als Preis, sind aber ein
            # Hinweis darauf, dass jemand schon etwas eingetragen hat.
            "unverified_count": len([x for x in alle if not x.verified]),
            "history_count": len(alle),
        })

    return {
        "products": zeilen,
        "without_price": len([z for z in zeilen if z["price"] is None]),
    }


class PriceIn(BaseModel):
    amount_cents: int = Field(ge=0, le=MAX_PREIS_CENT)
    currency: str = "EUR"
    source_url: str
    verified: bool = True
    valid_from: date | None = None
    valid_to: date | None = None


@router.get("/{product_id}/prices")
def list_prices(product_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Preisverlauf eines Produkts."""
    p = db.get(Product, product_id)
    if not p or (not p.verified and not sieht_fremde_daten(user)):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return [_preis_out(x) for x in _preisverlauf(db, product_id)]


def _preis_anlegen(db: Session, product_id: str, daten: PriceIn) -> ProductPrice:
    """Legt einen Preis an und haelt die Zeitachse lueckenlos und ueberschneidungsfrei.

    Zwei Preise, die gleichzeitig gelten, waeren ein stiller Fehler: welcher
    zaehlt, haengt dann an der Sortierung statt an einer Entscheidung.
    Deshalb drei Regeln beim Einfuegen:

    1. Gleicher Starttag = Korrektur. Der aeltere Eintrag verschwindet,
       statt als Preis stehen zu bleiben, der nie einen Tag lang galt.
    2. Der bisher offene Preis endet am Tag vor dem neuen.
    3. Wird ein Preis nachtraeglich vor einen bestehenden gesetzt, endet er
       dort, wo der naechste beginnt.

    Unbestaetigte Preise bleiben aussen vor - sie gehoeren nicht zur
    gueltigen Zeitachse und sollen sie auch nicht veraendern.
    """
    beginn = daten.valid_from or local_today()

    if not daten.verified:
        preis = ProductPrice(
            product_id=product_id,
            amount_cents=daten.amount_cents,
            currency=daten.currency.upper()[:3],
            valid_from=beginn,
            valid_to=daten.valid_to,
            source_url=daten.source_url,
            verified=False,
        )
        db.add(preis)
        return preis

    bestehende = [x for x in _preisverlauf(db, product_id) if x.verified]

    # (1) Korrektur am selben Tag
    for alt in bestehende:
        if alt.valid_from == beginn:
            db.delete(alt)
    bestehende = [x for x in bestehende if x.valid_from != beginn]

    # (2) den davor gueltigen Preis abschliessen
    for alt in bestehende:
        if alt.valid_to is None and (alt.valid_from is None or alt.valid_from < beginn):
            alt.valid_to = beginn - timedelta(days=1)

    # (3) einen nachtraeglich eingeschobenen Preis vor dem naechsten beenden
    ende = daten.valid_to
    spaetere = [x.valid_from for x in bestehende if x.valid_from and x.valid_from > beginn]
    if spaetere:
        grenze = min(spaetere) - timedelta(days=1)
        ende = grenze if ende is None else min(ende, grenze)

    preis = ProductPrice(
        product_id=product_id,
        amount_cents=daten.amount_cents,
        currency=daten.currency.upper()[:3],
        valid_from=beginn,
        valid_to=ende,
        source_url=daten.source_url,
        verified=True,
    )
    db.add(preis)
    return preis


@router.post("/{product_id}/prices", dependencies=[Depends(require_csrf)])
def create_price(
    product_id: str,
    data: PriceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Neuen Preis setzen. Nur Teamleiter."""
    require_team_leader(user)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    if data.amount_cents < 0:
        raise HTTPException(status_code=400, detail="Ein Preis kann nicht negativ sein")
    if not data.source_url.strip():
        raise HTTPException(status_code=400, detail="Ein Preis braucht eine nachvollziehbare Quelle")
    if data.valid_to and data.valid_from and data.valid_to < data.valid_from:
        raise HTTPException(status_code=400, detail="Das Enddatum liegt vor dem Startdatum")

    preis = _preis_anlegen(db, product_id, data)
    db.flush()
    audit(db, user, "product.price_set", "product", product_id,
          after={"amount_cents": preis.amount_cents, "valid_from": str(preis.valid_from),
                 "source_url": preis.source_url})
    db.commit()
    return _preis_out(preis)


@router.delete("/{product_id}/prices/{price_id}", dependencies=[Depends(require_csrf)])
def delete_price(
    product_id: str,
    price_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Falsch eingetragenen Preis entfernen. Nur Teamleiter.

    Verkaeufe halten ihren Preis als eigene Kopie (unit_price_cents), ein
    geloeschter Preiseintrag veraendert also keine Umsatzzahl der
    Vergangenheit.
    """
    require_team_leader(user)
    preis = db.get(ProductPrice, price_id)
    if not preis or preis.product_id != product_id:
        raise HTTPException(status_code=404, detail="Preis nicht gefunden")

    audit(db, user, "product.price_deleted", "product", product_id,
          before={"amount_cents": preis.amount_cents, "valid_from": str(preis.valid_from)})
    db.delete(preis)
    db.commit()
    return {"ok": True}


# Spaltennamen, die der Preisimport versteht.
PREIS_SPALTEN: dict[str, set[str]] = {
    "name": {"produkt", "produktname", "artikel", "name", "product", "product_name"},
    "amount": {"preis", "betrag", "vk", "verkaufspreis", "price", "amount"},
    "valid_from": {"gueltig ab", "gültig ab", "gueltig_ab", "gültig_ab", "ab", "valid_from"},
    "source_url": {"quelle", "source", "source_url", "url"},
}


def _betrag_in_cent(text: str) -> int | None:
    """Liest einen Preis aus Text - deutsche und englische Schreibweise.

    '1.299,00', '1299,00', '1299.00' und '1.299 €' meinen alle dasselbe.
    Ein Tippfehler soll den ganzen Import nicht abbrechen, deshalb None
    statt einer Ausnahme.
    """
    roh = text.strip().replace("€", "").replace("EUR", "").replace(" ", "")
    if not roh:
        return None

    if "," in roh and "." in roh:
        # Das letzte Trennzeichen ist das Dezimalzeichen.
        roh = roh.replace(".", "") if roh.rfind(",") > roh.rfind(".") else roh.replace(",", "")
    roh = roh.replace(",", ".")

    try:
        wert = float(roh)
    except ValueError:
        return None
    if wert < 0:
        return None
    return int(round(wert * 100))


class PriceImportIn(BaseModel):
    csv: str
    source_url: str | None = None
    valid_from: date | None = None


@router.post("/prices/import", dependencies=[Depends(require_csrf)])
def import_prices(
    data: PriceImportIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preise aus einer CSV-Datei uebernehmen. Nur Teamleiter.

    Zugeordnet wird ueber den Produktnamen. Unbekannte Produkte werden
    uebersprungen und nicht angelegt: ein vertippter Name wuerde sonst ein
    Geisterprodukt erzeugen, das in jeder Auswahlliste auftaucht.
    """
    require_team_leader(user)

    text = data.csv.lstrip("﻿")
    try:
        dialect = csv.Sniffer().sniff(text[:2000], delimiters=";,\t")
    except csv.Error:
        # Deutsche Exporte nutzen ueberwiegend das Semikolon.
        dialect = csv.excel
        dialect.delimiter = ";"

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Die Datei enthält keine Kopfzeile")

    mapping: dict[str, str] = {}
    for column in reader.fieldnames:
        key = (column or "").strip().lower()
        for feld, aliase in PREIS_SPALTEN.items():
            if key in aliase:
                mapping[column] = feld
                break

    zugeordnet = set(mapping.values())
    if "name" not in zugeordnet:
        raise HTTPException(status_code=400, detail="Spalte für den Produktnamen fehlt (erlaubt: Produkt, Name, Artikel)")
    if "amount" not in zugeordnet:
        raise HTTPException(status_code=400, detail="Spalte für den Preis fehlt (erlaubt: Preis, Betrag, VK)")

    produkte = {
        p.name.strip().lower(): p
        for p in db.scalars(select(Product).where(Product.active.is_(True))).all()
    }

    gesetzt = 0
    uebersprungen = 0
    hinweise: list[str] = []

    for nummer, row in enumerate(reader, start=2):
        werte = {"name": "", "amount": "", "valid_from": "", "source_url": ""}
        for column, feld in mapping.items():
            werte[feld] = (row.get(column) or "").strip()

        produkt = produkte.get(werte["name"].lower())
        if produkt is None:
            uebersprungen += 1
            if len(hinweise) < 20:
                hinweise.append(
                    f"Zeile {nummer}: Produkt „{werte['name'] or '(leer)'}“ ist nicht angelegt"
                )
            continue

        cent = _betrag_in_cent(werte["amount"])
        if cent is None:
            uebersprungen += 1
            if len(hinweise) < 20:
                hinweise.append(f"Zeile {nummer}: „{werte['amount']}“ ist kein Preis")
            continue

        ab = data.valid_from
        if werte["valid_from"]:
            try:
                ab = date.fromisoformat(werte["valid_from"])
            except ValueError:
                uebersprungen += 1
                if len(hinweise) < 20:
                    hinweise.append(
                        f"Zeile {nummer}: „{werte['valid_from']}“ ist kein Datum (erwartet JJJJ-MM-TT)"
                    )
                continue

        quelle = werte["source_url"] or data.source_url
        if not quelle:
            uebersprungen += 1
            if len(hinweise) < 20:
                hinweise.append(f"Zeile {nummer}: keine Quelle angegeben")
            continue

        _preis_anlegen(db, produkt.id, PriceIn(
            amount_cents=cent,
            source_url=quelle,
            verified=True,
            valid_from=ab,
        ))
        gesetzt += 1

    if gesetzt:
        db.flush()
        audit(db, user, "product.prices_imported", "product", None,
              after={"gesetzt": gesetzt, "uebersprungen": uebersprungen})
    db.commit()

    return {"gesetzt": gesetzt, "uebersprungen": uebersprungen, "hinweise": hinweise}


@router.get("/{product_id}")
def product_detail(product_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or not p.active or (not p.verified and not sieht_fremde_daten(user)):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return product_out(db, p)


class ActiveIn(BaseModel):
    active: bool


@router.patch("/{product_id}/active", dependencies=[Depends(require_csrf)])
def set_active(
    product_id: str,
    data: ActiveIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Produkt archivieren oder zurückholen.

    Archivieren statt löschen: Verkäufe verweisen auf das Produkt, und die
    Verkaufshistorie muss nachvollziehbar bleiben. Ein archiviertes Produkt
    verschwindet aus Auswahllisten, bleibt aber in allen Auswertungen.
    """
    require_team_leader(user)
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")

    if p.active == data.active:
        return product_out(db, p)

    p.active = data.active
    audit(
        db,
        user,
        "product.archived" if not data.active else "product.restored",
        "product",
        p.id,
        before={"active": not data.active},
        after={"active": data.active},
    )
    db.commit()
    return product_out(db, p)


@router.post("/import", dependencies=[Depends(require_csrf)])
def import_product(data: ProductImport, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Produkt anlegen oder aktualisieren - inklusive optionalem Preis.

    Der Name ist der Schluessel: ein bereits vorhandenes Produkt wird
    aktualisiert statt ein zweites mit gleichem Namen anzulegen. Ein
    mitgeschickter Preis laeuft ueber dieselbe Zeitachsen-Logik wie
    POST /products/{id}/prices - sonst stuenden nach dem zweiten Speichern
    zwei gleichzeitig gueltige Preise nebeneinander.
    """
    require_team_leader(user)
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Ein Produkt braucht einen Namen")
    if data.verified and not data.source_url.strip():
        raise HTTPException(status_code=400, detail="Verifizierte Produktdaten benötigen eine nachvollziehbare Quelle")
    if data.price and data.price.verified and not data.price.source_url.strip():
        raise HTTPException(status_code=400, detail="Verifizierte Preise benötigen eine Quelle")

    payload = data.model_dump()
    preis_daten = payload.pop("price", None)
    payload["name"] = data.name.strip()
    p = upsert_verified_product(db, payload)
    db.flush()

    if preis_daten:
        _preis_anlegen(db, p.id, PriceIn(**preis_daten))
        db.flush()

    audit(db, user, "product.imported", "product", p.id, after={"name": p.name, "source_url": p.source_url, "verified": p.verified})
    db.commit()
    return product_out(db, p)
