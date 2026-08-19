"""Rechnungen: anlegen, rechnen, als PDF ausgeben.

Getrennt vom Router, weil eine Rechnung an zwei Stellen entsteht: beim
Speichern eines Verkaufs (automatisch) und beim nachtraeglichen Erzeugen
fuer einen aelteren Verkauf. Zwei Wege, aber genau eine Rechenregel und
genau ein Nummernkreis.
"""
from __future__ import annotations

from io import BytesIO

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import local_today, to_business_tz
from app.models import (
    Customer,
    Employee,
    Invoice,
    InvoiceItem,
    PaymentMethod,
    Sale,
    SaleItem,
    User,
)

# Regelsteuersatz. Als Zahl je Position gespeichert, damit eine spaetere
# Aenderung alte Rechnungen nicht rueckwirkend umschreibt.
MWST_PROZENT = 19

ZAHLUNGSART_BEZEICHNUNG = {
    PaymentMethod.CASH: "Barzahlung",
    PaymentMethod.CARD: "Kartenzahlung",
}


def geld(cents: int | None) -> str:
    if cents is None:
        return "–"
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _zeile(*teile: str | None) -> str:
    return " ".join(t.strip() for t in teile if t and t.strip()).strip()


def naechste_nummer(db: Session, jahr: int) -> str:
    """Fortlaufende Rechnungsnummer je Jahr: RE-2026-0001.

    Gezaehlt wird ueber den hoechsten vorhandenen Wert des Jahres statt
    ueber die Anzahl: eine geloeschte Rechnung wuerde eine Nummer sonst ein
    zweites Mal vergeben, und zwei Belege mit derselben Nummer sind der
    Fehler, den niemand mehr auseinandersortieren kann.
    """
    praefix = f"RE-{jahr}-"
    hoechste = db.scalar(
        select(func.max(Invoice.number)).where(Invoice.number.like(f"{praefix}%"))
    )
    laufend = 0
    if hoechste:
        try:
            laufend = int(str(hoechste).rsplit("-", 1)[1])
        except (IndexError, ValueError):
            laufend = 0
    return f"{praefix}{laufend + 1:04d}"


def rechnung_zu_verkauf(db: Session, sale: Sale, user: User | None = None) -> Invoice:
    """Legt die Rechnung zu einem Verkauf an - oder liefert die vorhandene.

    Der Berater oben links kommt aus dem angemeldeten Benutzer, nicht aus
    einer festen Angabe im Code: jeder Berater stellt unter seinem eigenen
    Namen und seiner eigenen Anschrift aus. Fehlt der Benutzer (etwa weil
    eine Fuehrungsrolle fuer einen Mitarbeiter erfasst), tritt der
    Mitarbeiter des Verkaufs an seine Stelle.
    """
    vorhanden = db.scalar(select(Invoice).where(Invoice.sale_id == sale.id))
    if vorhanden:
        return vorhanden

    employee = db.get(Employee, sale.employee_id)
    aussteller = user
    if aussteller is None or (employee and aussteller.id != employee.user_id):
        aussteller = db.get(User, employee.user_id) if employee and employee.user_id else user

    customer = db.get(Customer, sale.customer_id)
    heute = local_today()
    leistungstag = to_business_tz(sale.sold_at).date()

    invoice = Invoice(
        number=naechste_nummer(db, heute.year),
        sale_id=sale.id,
        customer_id=sale.customer_id,
        employee_id=sale.employee_id,
        issued_on=heute,
        service_on=leistungstag,
        issuer_name=(aussteller.full_name if aussteller else None)
        or (employee.display_name if employee else "Kundenberater"),
        issuer_street=_zeile(
            getattr(aussteller, "street", None), getattr(aussteller, "house_number", None)
        ) or None,
        issuer_postal_code=getattr(aussteller, "postal_code", None),
        issuer_city=getattr(aussteller, "city", None),
        issuer_phone=getattr(aussteller, "phone", None),
        customer_name=f"{customer.first_name} {customer.last_name}".strip() if customer else "Unbekannt",
        customer_street=_zeile(customer.street, customer.house_number) if customer else None,
        customer_postal_code=customer.postal_code if customer else None,
        customer_city=customer.city if customer else None,
        customer_phone=customer.phone if customer else None,
        customer_email=customer.email if customer else None,
    )
    db.add(invoice)
    db.flush()

    positionen = db.scalars(
        select(SaleItem).where(SaleItem.sale_id == sale.id).order_by(SaleItem.id)
    ).all()
    for nummer, item in enumerate(positionen, start=1):
        db.add(InvoiceItem(
            invoice_id=invoice.id,
            product_id=item.product_id,
            position=nummer,
            name_snapshot=item.product_name_snapshot,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
            vat_percent=MWST_PROZENT,
        ))
    db.flush()
    return invoice


def positionen(db: Session, invoice_id: str) -> list[InvoiceItem]:
    return list(db.scalars(
        select(InvoiceItem)
        .where(InvoiceItem.invoice_id == invoice_id)
        .order_by(InvoiceItem.position)
    ).all())


def betraege(items: list[InvoiceItem]) -> dict:
    """Zwischensumme, MwSt. und Gesamtbetrag.

    Die Stueckpreise sind Bruttopreise - so stehen sie im Katalog und so
    zahlt der Kunde. Die Zwischensumme ist deshalb der Nettoanteil, die
    MwSt. der darin enthaltene Steueranteil, und beide zusammen ergeben
    wieder den Gesamtbetrag. Wuerde stattdessen auf den Bruttopreis noch
    Steuer aufgeschlagen, stuende auf der Rechnung ein hoeherer Betrag,
    als abgemacht war.
    """
    brutto = 0
    steuer = 0
    for item in items:
        zeilenbetrag = item.quantity * item.unit_price_cents
        brutto += zeilenbetrag
        satz = item.vat_percent or 0
        steuer += round(zeilenbetrag * satz / (100 + satz))
    return {
        "subtotal_cents": brutto - steuer,
        "vat_cents": steuer,
        "total_cents": brutto,
    }


def serialize(db: Session, invoice: Invoice) -> dict:
    items = positionen(db, invoice.id)
    return {
        "id": invoice.id,
        "number": invoice.number,
        "sale_id": invoice.sale_id,
        "customer_id": invoice.customer_id,
        "employee_id": invoice.employee_id,
        "issued_on": invoice.issued_on.isoformat(),
        "service_on": invoice.service_on.isoformat(),
        "issuer": {
            "name": invoice.issuer_name,
            "street": invoice.issuer_street,
            "postal_code": invoice.issuer_postal_code,
            "city": invoice.issuer_city,
            "phone": invoice.issuer_phone,
        },
        "customer": {
            "name": invoice.customer_name,
            "contact": invoice.customer_contact,
            "street": invoice.customer_street,
            "postal_code": invoice.customer_postal_code,
            "city": invoice.customer_city,
            "phone": invoice.customer_phone,
            "email": invoice.customer_email,
        },
        "payment_method": invoice.payment_method.value if invoice.payment_method else None,
        "payment_method_label": (
            ZAHLUNGSART_BEZEICHNUNG.get(invoice.payment_method) if invoice.payment_method else None
        ),
        "notes": invoice.notes,
        "items": [
            {
                "id": item.id,
                "position": item.position,
                "product_id": item.product_id,
                "name": item.name_snapshot,
                "quantity": item.quantity,
                "unit_price_cents": item.unit_price_cents,
                "vat_percent": item.vat_percent,
                "total_cents": item.quantity * item.unit_price_cents,
            }
            for item in items
        ],
        **betraege(items),
        "created_at": invoice.created_at,
    }


# ------------------------------------------------------------------- PDF

# Die Farben des Vordrucks. An einer Stelle, damit PDF und Bildschirm
# dieselbe Rechnung zeigen.
GRUEN = "#12823c"
GRUEN_DUNKEL = "#0c5c2a"
GRAU_LINIE = "#c8d2cb"
GRAU_TEXT = "#4a544d"


def build_pdf(db: Session, invoice: Invoice) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        KeepTogether,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    daten = serialize(db, invoice)
    puffer = BytesIO()
    doc = SimpleDocTemplate(
        puffer, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
        title=f"Rechnung {invoice.number}",
    )
    basis = getSampleStyleSheet()
    stil_klein = ParagraphStyle("klein", parent=basis["Normal"], fontSize=8, leading=10.5)
    stil_label = ParagraphStyle(
        "label", parent=stil_klein, fontName="Helvetica-Bold", textColor=colors.HexColor(GRAU_TEXT)
    )
    stil_wert = ParagraphStyle("wert", parent=stil_klein, fontName="Helvetica")
    stil_titel = ParagraphStyle(
        "titel", parent=basis["Title"], fontSize=30, leading=32, alignment=0,
        textColor=colors.white, spaceAfter=0,
    )
    stil_untertitel = ParagraphStyle(
        "untertitel", parent=basis["Normal"], fontSize=10, textColor=colors.white,
    )
    stil_abschnitt = ParagraphStyle(
        "abschnitt", parent=basis["Normal"], fontName="Helvetica-Bold", fontSize=10,
        textColor=colors.HexColor(GRUEN),
    )

    story: list = []

    kopf = Table(
        [[Paragraph("RECHNUNG", stil_titel)], [Paragraph("Rechnungsvordruck / Kundenberater", stil_untertitel)]],
        colWidths=[doc.width],
    )
    kopf.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(GRUEN)),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
    ]))
    story.append(kopf)
    story.append(Spacer(1, 12))

    berater = [Paragraph(f"<b>{daten['issuer']['name']}</b>", stil_wert)]
    for zeile in (
        daten["issuer"]["street"],
        _zeile(daten["issuer"]["postal_code"], daten["issuer"]["city"]),
    ):
        if zeile:
            berater.append(Paragraph(zeile, stil_wert))
    if daten["issuer"]["phone"]:
        berater.append(Paragraph(f"<b>Mobil:</b> {daten['issuer']['phone']}", stil_wert))

    eckdaten = [
        ["Rechnungsnummer", daten["number"]],
        ["Kundennummer", (daten["customer_id"] or "")[:8].upper()],
        ["Rechnungsdatum", invoice.issued_on.strftime("%d.%m.%Y")],
        ["Leistungsdatum", invoice.service_on.strftime("%d.%m.%Y")],
        ["Berater", daten["issuer"]["name"]],
    ]
    eck_tabelle = Table(
        [[Paragraph(k, stil_label), Paragraph(str(v), stil_wert)] for k, v in eckdaten],
        colWidths=[doc.width * 0.22, doc.width * 0.24],
    )
    eck_tabelle.setStyle(TableStyle([
        ("LINEBELOW", (1, 0), (1, -1), 0.4, colors.HexColor(GRAU_LINIE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    oben = Table(
        [[berater, eck_tabelle]], colWidths=[doc.width * 0.5, doc.width * 0.5]
    )
    oben.setStyle(TableStyle([
        ("BOX", (0, 0), (0, 0), 0.8, colors.HexColor(GRUEN)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 10),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("BOTTOMPADDING", (0, 0), (0, 0), 8),
        ("LEFTPADDING", (1, 0), (1, 0), 14),
    ]))
    story.append(oben)
    story.append(Spacer(1, 12))

    kunde = daten["customer"]
    kundenfelder = [
        [
            Paragraph("Kunde / Firma", stil_label), Paragraph(kunde["name"] or "", stil_wert),
            Paragraph("PLZ / Ort", stil_label),
            Paragraph(_zeile(kunde["postal_code"], kunde["city"]), stil_wert),
        ],
        [
            Paragraph("Ansprechpartner", stil_label), Paragraph(kunde["contact"] or "", stil_wert),
            Paragraph("Telefon", stil_label), Paragraph(kunde["phone"] or "", stil_wert),
        ],
        [
            Paragraph("Straße / Hausnummer", stil_label), Paragraph(kunde["street"] or "", stil_wert),
            Paragraph("E-Mail", stil_label), Paragraph(kunde["email"] or "", stil_wert),
        ],
    ]
    breite = doc.width / 4
    kundenblock = Table(
        [[Paragraph("KUNDENDATEN", stil_abschnitt), "", "", ""], *kundenfelder],
        colWidths=[breite * 0.85, breite * 1.15, breite * 0.8, breite * 1.2],
    )
    kundenblock.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
        ("LINEBELOW", (1, 1), (1, -1), 0.4, colors.HexColor(GRAU_LINIE)),
        ("LINEBELOW", (3, 1), (3, -1), 0.4, colors.HexColor(GRAU_LINIE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(kundenblock)
    story.append(Spacer(1, 12))

    zeilen = [["Pos.", "Artikel / Leistung", "Menge", "Einzelpreis", "MwSt.", "Gesamt"]]
    for item in daten["items"]:
        zeilen.append([
            str(item["position"]),
            item["name"],
            str(item["quantity"]),
            geld(item["unit_price_cents"]),
            f"{item['vat_percent']} %",
            geld(item["total_cents"]),
        ])
    # Der Vordruck hat sechs Zeilen. Weniger Positionen lassen ihn nicht
    # schrumpfen - das Blatt soll aussehen wie das Papier daneben.
    while len(zeilen) <= 6:
        zeilen.append([str(len(zeilen)), "", "", "", "%", ""])

    positionstabelle = Table(
        zeilen,
        colWidths=[doc.width * w for w in (0.07, 0.41, 0.11, 0.15, 0.10, 0.16)],
        rowHeights=[20] + [22] * (len(zeilen) - 1),
    )
    positionstabelle.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(GRUEN)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(GRAU_LINIE)),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (4, 1), (4, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(positionstabelle)
    story.append(Spacer(1, 10))

    bar = "X" if invoice.payment_method == PaymentMethod.CASH else " "
    karte = "X" if invoice.payment_method == PaymentMethod.CARD else " "
    zahlung = Table(
        [
            [Paragraph(
                f"<b><font color='{GRUEN}'>Zahlungsart:</font></b> "
                f"[{bar}] Barzahlung &nbsp;&nbsp; [{karte}] Kartenzahlung",
                stil_wert,
            )],
            [Paragraph(
                "<b>Hinweis:</b> Bei Kartenzahlung bitte den Kundenberater vorab informieren.",
                stil_klein,
            )],
        ],
        colWidths=[doc.width * 0.5 - 6],
    )
    zahlung.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))

    summen = Table(
        [
            ["Zwischensumme", geld(daten["subtotal_cents"])],
            ["MwSt.", geld(daten["vat_cents"])],
            ["Gesamtbetrag", geld(daten["total_cents"])],
        ],
        colWidths=[(doc.width * 0.5 - 6) * 0.55, (doc.width * 0.5 - 6) * 0.45],
        rowHeights=[22, 22, 26],
    )
    summen.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(GRAU_LINIE)),
        ("BACKGROUND", (0, 2), (0, 2), colors.HexColor(GRUEN)),
        ("TEXTCOLOR", (0, 2), (0, 2), colors.white),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))

    unten = Table([[zahlung, summen]], colWidths=[doc.width * 0.5, doc.width * 0.5])
    unten.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 12),
    ]))
    story.append(unten)
    story.append(Spacer(1, 12))

    bemerkungen = Table(
        [
            [Paragraph("BEMERKUNGEN", stil_abschnitt)],
            [Paragraph((invoice.notes or "").replace("\n", "<br/>"), stil_wert)],
        ],
        colWidths=[doc.width * 0.46],
        rowHeights=[18, 54],
    )
    bemerkungen.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
        ("VALIGN", (0, 1), (0, 1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))

    def unterschrift(beschriftung: str):
        t = Table([[""], [Paragraph(beschriftung, stil_klein)]], colWidths=[doc.width * 0.25], rowHeights=[46, 16])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor(GRUEN)),
            ("LINEABOVE", (0, 1), (0, 1), 0.5, colors.HexColor(GRAU_LINIE)),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 1), (0, 1), "MIDDLE"),
        ]))
        return t

    fuss = Table(
        [[bemerkungen, unterschrift("Unterschrift Kunde"), unterschrift("Unterschrift Kundenberater")]],
        colWidths=[doc.width * 0.48, doc.width * 0.26, doc.width * 0.26],
    )
    fuss.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (1, 0), 10),
    ]))
    story.append(KeepTogether(fuss))

    doc.build(story)
    return puffer.getvalue()
