from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.rbac import current_employee, resolve_employee_by_name
from app.core.timeutils import day_bounds, month_bounds, week_bounds
from app.models import Appointment, AppointmentProduct, AppointmentStatus, AppointmentType, Customer, Employee, Message, Product, ProductPresentation, Rental, RentalStatus, Role, Sale, SaleChannel, SaleItem, User
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


def execute_tool(db: Session, user: User, name: str, args: dict) -> dict:
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
        if user.role != Role.TEAM_LEADER and c.employee_id != own.id:
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
        if not c or (user.role != Role.TEAM_LEADER and c.employee_id != e.id): return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
        a=Appointment(customer_id=c.id,employee_id=e.id,start_at=datetime.fromisoformat(args["start_at"]),end_at=datetime.fromisoformat(args["end_at"]) if args.get("end_at") else None,appointment_type=AppointmentType(args["appointment_type"]),notes=args.get("notes"),address_snapshot=" ".join(x for x in [c.street,c.house_number,c.postal_code,c.city] if x),phone_snapshot=c.phone,email_snapshot=c.email)
        db.add(a);db.commit();db.refresh(a);return {"created":True,"appointment":_appointment_dict(db,a)}

    if name == "update_appointment_status":
        a=db.get(Appointment,args["appointment_id"])
        if not a:return {"error":"Termin nicht gefunden"}
        e=current_employee(db,user)
        if user.role!=Role.TEAM_LEADER and a.employee_id!=e.id:return {"error":"Nicht berechtigt"}
        a.status=AppointmentStatus(args["status"]);db.commit();return {"updated":True,"appointment":_appointment_dict(db,a)}

    if name == "create_sale":
        if not args.get("confirm"):
            return {"requires_confirmation":True,"message":"Bitte den Verkauf mit Produkten, Stückzahlen und Preisen bestätigen."}
        e=resolve_employee_by_name(db,user,args.get("employee_name"));c=db.get(Customer,args["customer_id"])
        if not c or c.deleted_at or (user.role!=Role.TEAM_LEADER and c.employee_id!=e.id):return {"error":"Kunde nicht gefunden oder nicht berechtigt"}
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
        term=f"%{args['recipient_name']}%"; users=db.scalars(select(User).where(User.full_name.ilike(term),User.is_active.is_(True))).all()
        if len(users)!=1:return {"error":"Empfänger ist nicht eindeutig"}
        m=Message(sender_user_id=user.id,recipient_user_id=users[0].id,body=args["body"].strip());db.add(m);db.commit();return {"sent":True,"recipient":users[0].full_name}

    return {"error": f"Unbekanntes Tool: {name}"}
