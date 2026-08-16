from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.core.benutzerscope import benutzer_sichtbar_filter
from app.core.permissions import sieht_fremde_daten
from app.services.assistant_guard import SCHREIBENDE_WERKZEUGE, vormerken
from app.core.audit import audit
from app.core.rbac import current_employee, resolve_employee_by_name
from app.core.timeutils import day_bounds, month_bounds, week_bounds
from app.models import Appointment, AppointmentProduct, AppointmentStatus, AppointmentType, Customer, CustomerNote, Employee, FollowUp, FollowUpReason, FollowUpStatus, Message, Product, ProductPresentation, Rental, RentalStatus, Role, Sale, SaleChannel, SaleItem, User
from app.services.serializers import current_price, product_out, sale_units
from app.services.stats import refresh_weekly_stat, revenue_between, units_between


TOOL_SPECS = [
    {
        "type": "function", "name": "get_next_appointment",
        "description": "Liefert den nächsten Termin. Mitarbeitername nur nutzen, wenn der Teamleiter ausdrücklich eine andere Person meint.",
        "parameters": {"type":"object","properties":{"employee_name":{"type":["string","null"]}},"required":["employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_appointments",
        "description": "Liefert Termine in einem Datumsbereich.",
        "parameters": {"type":"object","properties":{"start_date":{"type":"string","description":"YYYY-MM-DD"},"end_date":{"type":"string","description":"YYYY-MM-DD, exklusiv"},"employee_name":{"type":["string","null"]}},"required":["start_date","end_date","employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "search_customer",
        "description": "Sucht Kunden im erlaubten Datenbereich.",
        "parameters": {"type":"object","properties":{"query":{"type":"string"},"employee_name":{"type":["string","null"]}},"required":["query","employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_customer_history",
        "description": "Liefert Vorstellungen und Käufe eines Kunden.",
        "parameters": {"type":"object","properties":{"customer_id":{"type":"string"}},"required":["customer_id"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "search_products",
        "description": "Sucht ausschließlich verifizierte Produkte.",
        "parameters": {"type":"object","properties":{"query":{"type":"string"}},"required":["query"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_product_details",
        "description": "Liefert verifizierte Produktinformationen und – falls vorhanden – einen verifizierten aktuellen Preis.",
        "parameters": {"type":"object","properties":{"product_id":{"type":"string"}},"required":["product_id"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_weekly_revenue",
        "description": "Berechnet Wochenumsatz aus Verkäufen.",
        "parameters": {"type":"object","properties":{"employee_name":{"type":["string","null"]}},"required":["employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_weekly_units",
        "description": "Berechnet die Einheiten der aktuellen Woche.",
        "parameters": {"type":"object","properties":{"employee_name":{"type":["string","null"]}},"required":["employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_monthly_units",
        "description": "Berechnet die Einheiten des aktuellen Monats sowie Monatsziel und Zielerreichung.",
        "parameters": {"type":"object","properties":{"employee_name":{"type":["string","null"]}},"required":["employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_rentals",
        "description": "Liefert aktive Verleihgeräte.",
        "parameters": {"type":"object","properties":{"employee_name":{"type":["string","null"]},"due_this_week":{"type":"boolean"}},"required":["employee_name","due_this_week"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "create_appointment",
        "description": "Erstellt einen Termin nur für einen vorhandenen Kunden. Fehlende Kundendaten vorher gezielt erfragen/suchen.",
        "parameters": {"type":"object","properties":{"customer_id":{"type":"string"},"start_at":{"type":"string","description":"ISO-8601 mit Zeitzone"},"end_at":{"type":["string","null"]},"appointment_type":{"type":"string","enum":["customer","promotion","recommendation","premium_checkin","team","telephone","other"]},"notes":{"type":["string","null"]},"employee_name":{"type":["string","null"]}},"required":["customer_id","start_at","end_at","appointment_type","notes","employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "update_appointment_status",
        "description": "Ändert den Status eines Termins.",
        "parameters": {"type":"object","properties":{"appointment_id":{"type":"string"},"status":{"type":"string","enum":["planned","confirmed","completed","cancelled","rescheduled"]}},"required":["appointment_id","status"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "create_sale",
        "description": "Bereitet einen Verkauf mit mehreren Produkten vor. Diese Änderung ist kritisch und benötigt confirm=true. Preise dürfen nicht geraten werden.",
        "parameters": {"type":"object","properties":{"customer_id":{"type":"string"},"sold_at":{"type":"string"},"channel":{"type":"string","enum":["field","promotion","k70","other"]},"items":{"type":"array","items":{"type":"object","properties":{"product_id":{"type":"string"},"quantity":{"type":"integer","minimum":1},"unit_price_cents":{"type":"integer","minimum":0}},"required":["product_id","quantity","unit_price_cents"],"additionalProperties":False}},"confirm":{"type":"boolean"},"employee_name":{"type":["string","null"]}},"required":["customer_id","sold_at","channel","items","confirm","employee_name"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "send_message",
        "description": "Sendet eine interne Nachricht an einen Benutzer. Bei unklarer Person nicht raten.",
        "parameters": {"type":"object","properties":{"recipient_name":{"type":"string"},"body":{"type":"string"}},"required":["recipient_name","body"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "create_follow_up",
        "description": "Legt eine Wiedervorlage bei einem Kunden an. Wird erst nach Bestätigung durch den Benutzer ausgeführt.",
        "parameters": {"type":"object","properties":{"customer_id":{"type":"string"},"due_on":{"type":"string","description":"JJJJ-MM-TT"},"note":{"type":["string","null"]}},"required":["customer_id","due_on","note"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "complete_follow_up",
        "description": "Markiert eine Wiedervorlage als erledigt. Wird erst nach Bestätigung ausgeführt.",
        "parameters": {"type":"object","properties":{"follow_up_id":{"type":"string"}},"required":["follow_up_id"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "create_customer_note",
        "description": "Hinterlegt eine Notiz beim Kunden. Wird erst nach Bestätigung ausgeführt.",
        "parameters": {"type":"object","properties":{"customer_id":{"type":"string"},"body":{"type":"string"}},"required":["customer_id","body"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_priorities",
        "description": "Was heute am wichtigsten ist, mit Begründung je Eintrag. Für Fragen wie 'Was ist heute am wichtigsten?'.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "prepare_appointment",
        "description": "Vorbereitung auf einen Termin: Kunde, Adresse, letzter Kontakt, gekaufte und vorgeführte Produkte, Notizen, offene Wiedervorlagen, Verleihgeräte. Ohne appointment_id der nächste Termin.",
        "parameters": {"type":"object","properties":{"appointment_id":{"type":["string","null"]}},"required":["appointment_id"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_follow_up_suggestions",
        "description": "Wen man heute kontaktieren sollte, priorisiert und begründet.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_aftercare_suggestions",
        "description": "Kunden, bei denen nach einem Verkauf eine Nachbetreuung fällig wäre. Legt nichts an, schlägt nur vor.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_sales_coaching",
        "description": "Wie der Monat läuft und woran es liegt: Termine, Abschlussquote, Vergleich zum Vormonat, größter Hebel.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_goal_forecast",
        "description": "Zielprognose: erreichte und fehlende Einheiten, verbleibende Arbeitstage, benötigte Einheiten je Arbeitstag.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_funnel",
        "description": "Verkaufstrichter von Kontakt bis Nachbetreuung, mit dem größten Abfall zwischen zwei Stufen.",
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_product_analysis",
        "description": "Welche Produkte sich verkaufen und welche nicht - nur aus echten Verkaufsdaten.",
        "parameters": {"type":"object","properties":{"days":{"type":["integer","null"]}},"required":["days"],"additionalProperties":False},
        "strict": True,
    },
    {
        "type": "function", "name": "get_day_briefing",
        "description": (
            "Tagesbriefing: offene Wiedervorlagen, Termine heute, faellige Verleihgeraete, "
            "Stand beim Monatsziel, Wochenentwicklung mit Begruendung und konkrete "
            "Handlungsempfehlungen. Fuer Fragen wie 'Was muss ich heute erledigen?', "
            "'Wie stehe ich beim Monatsziel?' oder 'Warum ist der Umsatz gefallen?'. "
            "Die Zahlen sind bereits ausgerechnet - uebernimm sie unveraendert."
        ),
        "parameters": {"type":"object","properties":{},"required":[],"additionalProperties":False},
        "strict": True,
    },
]


def _appointment_dict(db: Session, a: Appointment) -> dict:
    c = db.get(Customer, a.customer_id) if a.customer_id else None
    pids = db.scalars(select(AppointmentProduct.product_id).where(AppointmentProduct.appointment_id == a.id)).all()
    products = db.scalars(select(Product).where(Product.id.in_(pids))).all() if pids else []
    return {
        "id": a.id, "customer": f"{c.first_name} {c.last_name}" if c else None,
        "start_at": a.start_at.isoformat(), "end_at": a.end_at.isoformat() if a.end_at else None,
        "address": a.address_snapshot, "phone": a.phone_snapshot, "notes": a.notes,
        "status": a.status.value, "appointment_type": a.appointment_type.value,
        "planned_products": [p.name for p in products],
    }


def _beschreibung(db: Session, name: str, args: dict) -> str:
    """Was der Benutzer vor der Bestaetigung zu lesen bekommt.

    Bewusst aus den Daten gebaut und nicht vom Modell formuliert: der Text,
    den jemand bestaetigt, muss das beschreiben, was tatsaechlich passiert.
    """
    if name == "create_appointment":
        c = db.get(Customer, args.get("customer_id", ""))
        wer = f"{c.first_name} {c.last_name}" if c else "unbekannter Kunde"
        return f"Termin mit {wer} am {args.get('start_at', '?')} anlegen"

    if name == "update_appointment_status":
        a = db.get(Appointment, args.get("appointment_id", ""))
        c = db.get(Customer, a.customer_id) if a and a.customer_id else None
        wer = f"{c.first_name} {c.last_name}" if c else "Termin"
        return f"{wer}: Status auf \"{args.get('status', '?')}\" setzen"

    if name == "create_sale":
        c = db.get(Customer, args.get("customer_id", ""))
        wer = f"{c.first_name} {c.last_name}" if c else "unbekannter Kunde"
        posten = args.get("items") or []
        summe = sum((i.get("quantity") or 0) * (i.get("unit_price_cents") or 0) for i in posten)
        return (f"Verkauf an {wer} mit {len(posten)} Position(en) über "
                f"{summe / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
                + " anlegen")

    if name == "send_message":
        return f"Nachricht an {args.get('recipient_name', '?')} senden"

    if name in {"get_priorities","prepare_appointment","get_follow_up_suggestions",
                "get_aftercare_suggestions","get_sales_coaching","get_goal_forecast",
                "get_funnel","get_product_analysis"}:
        # Import hier, weil assistant_insights seinerseits Auswertungsdienste
        # zieht - auf Modulebene ergaebe das einen Ringschluss.
        from app.core.rbac import scoped_employee_id
        from app.services import assistant_insights as ki

        scope = scoped_employee_id(db, user, None)

        if name == "get_priorities":            return ki.prioritaeten(db, user, scope)
        if name == "prepare_appointment":       return ki.terminvorbereitung(db, scope, args.get("appointment_id"))
        if name == "get_follow_up_suggestions": return ki.nachfassvorschlaege(db, scope)
        if name == "get_aftercare_suggestions": return ki.nachbetreuung(db, scope)
        if name == "get_sales_coaching":        return ki.verkaufscoach(db, scope)
        if name == "get_goal_forecast":         return ki.zielprognose(db, scope)
        if name == "get_funnel":                return ki.trichter(db, scope)
        return ki.produktanalyse(db, scope, int(args.get("days") or 90))

    if name == "create_follow_up":
        c = db.get(Customer, args.get("customer_id", ""))
        wer = f"{c.first_name} {c.last_name}" if c else "unbekannter Kunde"
        return f"Wiedervorlage für {wer} am {args.get('due_on', '?')} anlegen"

    if name == "complete_follow_up":
        return "Wiedervorlage als erledigt markieren"

    if name == "create_customer_note":
        c = db.get(Customer, args.get("customer_id", ""))
        wer = f"{c.first_name} {c.last_name}" if c else "unbekannter Kunde"
        return f"Notiz bei {wer} hinterlegen"

    return f"Aktion ausführen: {name}"


def execute_tool(db: Session, user: User, name: str, args: dict,
                 bestaetigt: bool = False) -> dict:
    """Fuehrt ein Werkzeug aus.

    `bestaetigt` setzt ausschliesslich der Bestaetigungs-Endpunkt. Das Modell
    kann es nicht mitschicken - genau das ist der Punkt: sonst waere die
    Rueckfrage eine Bitte an das Modell und keine Schranke.
    """
    if name in SCHREIBENDE_WERKZEUGE and not bestaetigt:
        return vormerken(user.id, name, args, _beschreibung(db, name, args))


    if name == "get_day_briefing":
        # Import hier, weil briefing.py seinerseits Auswertungsdienste zieht -
        # ein Import auf Modulebene ergaebe einen Ringschluss.
        from app.core.rbac import scoped_employee_id
        from app.services.briefing import day_briefing

        return day_briefing(db, user, scoped_employee_id(db, user, None))

    if name == "get_next_appointment":
        employee = resolve_employee_by_name(db, user, args.get("employee_name"))
        a = db.scalar(select(Appointment).where(Appointment.employee_id == employee.id, Appointment.start_at >= datetime.now(timezone.utc), Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED])).order_by(Appointment.start_at))
        return {"appointment": None if not a else _appointment_dict(db, a)}

    if name == "get_appointments":
        employee = resolve_employee_by_name(db, user, args.get("employee_name"))
        start = datetime.fromisoformat(args["start_date"] + "T00:00:00+00:00")
        end = datetime.fromisoformat(args["end_date"] + "T00:00:00+00:00")
        rows = db.scalars(select(Appointment).where(Appointment.employee_id == employee.id, Appointment.start_at >= start, Appointment.start_at < end).order_by(Appointment.start_at)).all()
        return {"appointments": [_appointment_dict(db, a) for a in rows]}

    if name == "search_customer":
        employee = resolve_employee_by_name(db, user, args.get("employee_name"))
        term = f"%{args['query']}%"
        rows = db.scalars(select(Customer).where(Customer.employee_id == employee.id, Customer.deleted_at.is_(None), or_(Customer.first_name.ilike(term), Customer.last_name.ilike(term))).limit(20)).all()
        return {"customers": [{"id":c.id,"name":f"{c.first_name} {c.last_name}","address":" ".join(x for x in [c.street,c.house_number,c.postal_code,c.city] if x),"phone":c.phone,"email":c.email} for c in rows]}

    if name == "get_customer_history":
        c = db.get(Customer, args["customer_id"])
        if not c:
            return {"error":"Kunde nicht gefunden"}
        own = current_employee(db, user)
        if not sieht_fremde_daten(user) and c.employee_id != own.id:
            return {"error":"Nicht berechtigt"}
        sales = db.scalars(select(Sale).where(Sale.customer_id == c.id).order_by(Sale.sold_at.desc())).all()
        purchases = []
        for sale in sales:
            items = db.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
            purchases.append({"sold_at":sale.sold_at.isoformat(),"items":[{"name":i.product_name_snapshot,"quantity":i.quantity,"unit_price_cents":i.unit_price_cents} for i in items]})
        pres = db.scalars(select(ProductPresentation).where(ProductPresentation.customer_id == c.id).order_by(ProductPresentation.presented_at.desc())).all()
        presented = []
        for p in pres:
            prod = db.get(Product, p.product_id)
            presented.append({"product":prod.name if prod else "Unbekannt","presented_at":p.presented_at.isoformat()})
        return {"customer":{"id":c.id,"name":f"{c.first_name} {c.last_name}"},"purchases":purchases,"presentations":presented}

    if name == "search_products":
        rows = db.scalars(select(Product).where(Product.active.is_(True), Product.verified.is_(True), Product.name.ilike(f"%{args['query']}%")).limit(20)).all()
        return {"products":[{"id":p.id,"name":p.name,"category":p.category} for p in rows]}

    if name == "get_product_details":
        p = db.get(Product, args["product_id"])
        if not p or not p.active or not p.verified:
            return {"error":"Keine verlässlichen Produktdaten verfügbar"}
        return product_out(db, p)

    if name == "get_weekly_revenue":
        e = resolve_employee_by_name(db, user, args.get("employee_name")); ws, we = week_bounds()
        return {"employee":e.display_name,"revenue_cents":revenue_between(db,ws,we,e.id),"week_start":ws.date().isoformat()}

    if name == "get_weekly_units":
        e = resolve_employee_by_name(
            db,
            user,
            args.get("employee_name"),
        )
        ws, we = week_bounds()
        units = units_between(db, ws, we, e.id)
        return {
            "employee": e.display_name,
            "units": units,
            "week_start": ws.date().isoformat(),
        }

    if name == "get_monthly_units":
        e = resolve_employee_by_name(
            db,
            user,
            args.get("employee_name"),
        )
        ms, me = month_bounds()
        units = units_between(db, ms, me, e.id)
        target = e.monthly_units_target
        return {
            "employee": e.display_name,
            "units": units,
            "target": target,
            "missing": max(target - units, 0),
            "percent": round(units / target * 100, 1)
            if target
            else 0,
            "month_start": ms.date().isoformat(),
        }

    if name == "get_rentals":
        e = resolve_employee_by_name(db, user, args.get("employee_name")); stmt=select(Rental).where(Rental.employee_id==e.id,Rental.status.in_([RentalStatus.RENTED,RentalStatus.DUE]))
        if args.get("due_this_week"):
            ws,we=week_bounds(); stmt=stmt.where(Rental.due_at>=ws,Rental.due_at<we)
        rows=db.scalars(stmt.order_by(Rental.due_at.asc().nullslast())).all(); result=[]
        for r in rows:
            c=db.get(Customer,r.customer_id); p=db.get(Product,r.product_id)
            result.append({"id":r.id,"product":p.name if p else None,"customer":f"{c.first_name} {c.last_name}" if c else None,"serial_number":r.serial_number,"due_at":r.due_at.isoformat() if r.due_at else None,"status":r.status.value})
        return {"rentals":result}

    if name == "create_appointment":
        e = resolve_employee_by_name(db, user, args.get("employee_name")); c=db.get(Customer,args["customer_id"])
        if not c or (not sieht_fremde_daten(user) and c.employee_id != e.id): return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
        a=Appointment(customer_id=c.id,employee_id=e.id,start_at=datetime.fromisoformat(args["start_at"]),end_at=datetime.fromisoformat(args["end_at"]) if args.get("end_at") else None,appointment_type=AppointmentType(args["appointment_type"]),notes=args.get("notes"),address_snapshot=" ".join(x for x in [c.street,c.house_number,c.postal_code,c.city] if x),phone_snapshot=c.phone,email_snapshot=c.email)
        db.add(a);db.flush()
        audit(db,user,"appointment.created_via_assistant","appointment",a.id,
              after={"customer_id":c.id,"employee_id":e.id,"start_at":a.start_at.isoformat()})
        db.commit();db.refresh(a);return {"created":True,"appointment":_appointment_dict(db,a)}

    if name == "update_appointment_status":
        a=db.get(Appointment,args["appointment_id"])
        if not a:return {"error":"Termin nicht gefunden"}
        e=current_employee(db,user)
        if not sieht_fremde_daten(user) and a.employee_id!=e.id:return {"error":"Nicht berechtigt"}
        vorher=a.status.value
        a.status=AppointmentStatus(args["status"])
        audit(db,user,"appointment.status_via_assistant","appointment",a.id,
              before={"status":vorher},after={"status":a.status.value})
        db.commit();return {"updated":True,"appointment":_appointment_dict(db,a)}

    if name == "create_sale":
        # Das frühere confirm-Argument wird nicht mehr ausgewertet: es kam
        # vom Modell und sagte damit nichts über eine Zustimmung aus.
        e=resolve_employee_by_name(db,user,args.get("employee_name"));c=db.get(Customer,args["customer_id"])
        if not c or c.deleted_at or (not sieht_fremde_daten(user) and c.employee_id!=e.id):return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
        resolved=[]
        for item in args["items"]:
            p=db.get(Product,item["product_id"])
            if not p or not p.verified or not p.active:return {"error":"Mindestens ein Produkt ist nicht verifiziert"}
            if item["unit_price_cents"] is None:return {"error":"Verkaufspreis fehlt; er darf nicht geraten werden"}
            resolved.append((p,item))
        s=Sale(customer_id=c.id,employee_id=e.id,sold_at=datetime.fromisoformat(args["sold_at"]),channel=SaleChannel(args["channel"]))
        db.add(s);db.flush()
        for p,item in resolved:db.add(SaleItem(sale_id=s.id,product_id=p.id,product_name_snapshot=p.name,quantity=item["quantity"],unit_price_cents=item["unit_price_cents"]))
        db.flush()
        # Gleiche Nachbereitung wie im regulaeren Endpunkt: ohne diese beiden
        # Zeilen tauchten ueber die KI angelegte Verkaeufe weder in der
        # Wochenstatistik noch im Audit-Log auf.
        refresh_weekly_stat(db,e.id,s.sold_at.date())
        audit(db,user,"sale.created_via_assistant","sale",s.id,after={"customer_id":c.id,"employee_id":e.id,"item_count":len(resolved)})
        db.commit();return {"created":True,"sale_id":s.id,"units":sale_units(db,s.id),"total_cents":sum(i[1]["quantity"]*i[1]["unit_price_cents"] for i in resolved)}

    if name == "send_message":
        # Dieselbe Sichtbarkeit wie in der Empfaengerauswahl. Ohne sie waere
        # die KI der bequemste Weg, ein Konto zu finden, das nirgends
        # auftauchen soll.
        term=f"%{args['recipient_name']}%"; users=db.scalars(select(User).where(User.full_name.ilike(term),User.is_active.is_(True),benutzer_sichtbar_filter(user))).all()
        if len(users)!=1:return {"error":"Empfänger ist nicht eindeutig"}
        m=Message(sender_user_id=user.id,recipient_user_id=users[0].id,body=args["body"].strip())
        db.add(m);db.flush()
        # Der Nachrichtentext steht bewusst nicht im Protokoll - protokolliert
        # wird, dass gesendet wurde, nicht was drinstand.
        audit(db,user,"message.sent_via_assistant","message",m.id,
              after={"recipient_user_id":users[0].id})
        db.commit();return {"sent":True,"recipient":users[0].full_name}

    if name in {"get_priorities","prepare_appointment","get_follow_up_suggestions",
                "get_aftercare_suggestions","get_sales_coaching","get_goal_forecast",
                "get_funnel","get_product_analysis"}:
        # Import hier, weil assistant_insights seinerseits Auswertungsdienste
        # zieht - auf Modulebene ergaebe das einen Ringschluss.
        from app.core.rbac import scoped_employee_id
        from app.services import assistant_insights as ki

        scope = scoped_employee_id(db, user, None)

        if name == "get_priorities":            return ki.prioritaeten(db, user, scope)
        if name == "prepare_appointment":       return ki.terminvorbereitung(db, scope, args.get("appointment_id"))
        if name == "get_follow_up_suggestions": return ki.nachfassvorschlaege(db, scope)
        if name == "get_aftercare_suggestions": return ki.nachbetreuung(db, scope)
        if name == "get_sales_coaching":        return ki.verkaufscoach(db, scope)
        if name == "get_goal_forecast":         return ki.zielprognose(db, scope)
        if name == "get_funnel":                return ki.trichter(db, scope)
        return ki.produktanalyse(db, scope, int(args.get("days") or 90))

    if name == "create_follow_up":
        e=current_employee(db,user);c=db.get(Customer,args["customer_id"])
        if not c or c.deleted_at or (not sieht_fremde_daten(user) and c.employee_id!=e.id):
            return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
        try: faellig=date.fromisoformat(args["due_on"])
        except (ValueError,TypeError): return {"error":"Datum unlesbar; erwartet JJJJ-MM-TT"}
        f=FollowUp(customer_id=c.id,employee_id=c.employee_id,due_on=faellig,
                   reason=FollowUpReason.MANUAL,note=(args.get("note") or None))
        db.add(f);db.flush()
        audit(db,user,"followup.created_via_assistant","follow_up",f.id,
              after={"customer_id":c.id,"due_on":str(faellig)})
        db.commit()
        return {"created":True,"follow_up_id":f.id,"due_on":str(faellig)}

    if name == "complete_follow_up":
        f=db.get(FollowUp,args["follow_up_id"])
        if not f: return {"error":"Wiedervorlage nicht gefunden"}
        e=current_employee(db,user)
        if not sieht_fremde_daten(user) and f.employee_id!=e.id:
            return {"error":"Nicht berechtigt"}
        if f.status!=FollowUpStatus.OPEN:
            return {"error":"Diese Wiedervorlage ist nicht mehr offen"}
        f.status=FollowUpStatus.DONE;f.completed_at=datetime.now(timezone.utc)
        audit(db,user,"followup.completed_via_assistant","follow_up",f.id,
              before={"status":"open"},after={"status":"done"})
        db.commit()
        return {"completed":True,"follow_up_id":f.id}

    if name == "create_customer_note":
        e=current_employee(db,user);c=db.get(Customer,args["customer_id"])
        if not c or c.deleted_at or (not sieht_fremde_daten(user) and c.employee_id!=e.id):
            return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
        text=(args.get("body") or "").strip()
        if not text: return {"error":"Die Notiz ist leer"}
        n=CustomerNote(customer_id=c.id,employee_id=e.id,body=text)
        db.add(n);db.flush()
        # Der Notiztext steht nicht im Protokoll - protokolliert wird, dass
        # eine Notiz entstand, nicht was drinsteht.
        audit(db,user,"customer_note.created_via_assistant","customer",c.id,
              after={"note_id":n.id})
        db.commit()
        return {"created":True,"note_id":n.id}

    return {"error": f"Unbekanntes Tool: {name}"}
