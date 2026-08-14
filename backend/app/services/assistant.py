from __future__ import annotations
import json
import re
import hashlib
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.rbac import current_employee
from app.core.timeutils import day_bounds, local_today, month_bounds, to_business_tz, week_bounds
from app.models import Appointment, AppointmentProduct, AppointmentStatus, Conversation, ConversationMessage, Customer, Product, Rental, RentalStatus, Role, User
from app.services.assistant_tools import TOOL_SPECS, execute_tool
from app.services.serializers import current_price
from app.services.stats import revenue_between, units_between

settings = get_settings()

SYSTEM_PROMPT = """Du bist OrgaBoard KI, ein sachlicher deutschsprachiger Vertriebsassistent.
Regeln:
- Erfinde niemals Preise, Kundendaten, Termine, Verkäufe oder andere Geschäftsdaten.
- Nutze für Geschäftsdaten ausschließlich die bereitgestellten Tools.
- Wenn Daten fehlen, sage klar: Dazu habe ich aktuell keine verlässlichen Daten.
- Der Server erzwingt Rollenrechte; versuche niemals, diese zu umgehen.
- Frage gezielt nach fehlenden Pflichtangaben.
- Bei kritischen Änderungen wie einem Verkauf muss vor dem finalen Schreiben eine Bestätigung vorliegen.
- Behalte Gesprächskontext bei, aber antworte knapp und praktisch.
"""


def _conversation(db: Session, user: User, conversation_id: str | None) -> Conversation:
    c = db.get(Conversation, conversation_id) if conversation_id else None
    if c and c.user_id != user.id:
        c = None
    if not c:
        c = Conversation(user_id=user.id)
        db.add(c); db.flush()
    return c


def _save(db: Session, c: Conversation, role: str, content: str):
    db.add(ConversationMessage(conversation_id=c.id, role=role, content=content))


def _recent_messages(db: Session, c: Conversation, limit: int = 12) -> list[dict]:
    rows = db.scalars(select(ConversationMessage).where(ConversationMessage.conversation_id == c.id).order_by(ConversationMessage.created_at.desc()).limit(limit)).all()
    return [{"role":r.role,"content":r.content} for r in reversed(rows)]


def _format_money(cents: int) -> str:
    return f"{cents/100:,.2f} €".replace(",","X").replace(".",",").replace("X",".")


def _local_answer(db: Session, user: User, c: Conversation, text: str) -> str:
    """Safe, deterministic fallback for core questions when no LLM key is configured."""
    lower = text.casefold()
    e = current_employee(db, user)

    if any(k in lower for k in ["nächster termin", "naechster termin", "hab ich heute noch was", "habe ich heute noch was"]):
        a = db.scalar(select(Appointment).where(Appointment.employee_id==e.id, Appointment.start_at>=datetime.now(timezone.utc), Appointment.status.notin_([AppointmentStatus.CANCELLED,AppointmentStatus.COMPLETED])).order_by(Appointment.start_at))
        if not a: return "Du hast aktuell keinen kommenden Termin in der Datenbank."
        customer=db.get(Customer,a.customer_id) if a.customer_id else None
        c.last_entity_type="appointment";c.last_entity_id=a.id
        name=f"{customer.first_name} {customer.last_name}" if customer else "einem Termin"
        local_start=to_business_tz(a.start_at)
        return f"Dein nächster Termin ist am {local_start.strftime('%d.%m.%Y')} um {local_start.strftime('%H:%M')} Uhr bei {name}. Adresse: {a.address_snapshot or 'nicht hinterlegt'}."

    if "adresse" in lower and c.last_entity_type=="appointment" and c.last_entity_id:
        a=db.get(Appointment,c.last_entity_id)
        if a and (user.role==Role.TEAM_LEADER or a.employee_id==e.id): return f"Die hinterlegte Adresse lautet: {a.address_snapshot or 'keine Adresse hinterlegt'}."

    if "morgen" in lower and "termin" in lower:
        d=local_today()+timedelta(days=1);ds,de=day_bounds(d);rows=db.scalars(select(Appointment).where(Appointment.employee_id==e.id,Appointment.start_at>=ds,Appointment.start_at<de).order_by(Appointment.start_at)).all()
        if not rows:return "Für morgen sind keine Termine in der Datenbank hinterlegt."
        parts=[]
        for a in rows:
            cust=db.get(Customer,a.customer_id) if a.customer_id else None;parts.append(f"{to_business_tz(a.start_at).strftime('%H:%M')} Uhr – {cust.first_name+' '+cust.last_name if cust else 'Termin'}")
        return "Morgen: " + "; ".join(parts) + "."

    if "umsatz" in lower:
        ws,we=week_bounds();revenue=revenue_between(db,ws,we,e.id);return f"Dein Umsatz in dieser Woche beträgt {_format_money(revenue)}."

    if "einheit" in lower or "ziel" in lower:
        if "woche" in lower:
            ws, we = week_bounds()
            units = units_between(db, ws, we, e.id)
            return f"Du hast diese Woche {units} Einheiten."

        ms, me = month_bounds()
        units = units_between(db, ms, me, e.id)
        target = e.monthly_units_target
        missing = max(target - units, 0)
        pct = round(units / target * 100, 1) if target else 0
        return (
            f"Du hast diesen Monat {units} Einheiten. "
            f"Monatsziel: {target}. "
            f"Es fehlen {missing} Einheiten; "
            f"Zielerreichung {pct} %."
        )

    if "verleih" in lower or "rückgabe" in lower or "rueckgabe" in lower:
        rows=db.scalars(select(Rental).where(Rental.employee_id==e.id,Rental.status.in_([RentalStatus.RENTED,RentalStatus.DUE])).order_by(Rental.due_at.asc().nullslast())).all()
        if not rows:return "Du hast aktuell keine aktiven Verleihgeräte."
        parts=[]
        for r in rows:
            p=db.get(Product,r.product_id);cust=db.get(Customer,r.customer_id);due=r.due_at.strftime('%d.%m.%Y') if r.due_at else 'ohne Rückgabedatum';parts.append(f"{p.name if p else 'Gerät'} bei {cust.first_name+' '+cust.last_name if cust else 'Kunde'}, Rückgabe {due}")
        return "; ".join(parts) + "."

    if "kostet" in lower or "preis" in lower:
        products=db.scalars(select(Product).where(Product.active.is_(True),Product.verified.is_(True))).all()
        matches=[p for p in products if p.name.casefold() in lower or any(token in lower for token in p.name.casefold().split() if len(token)>3)]
        if len(matches)==1:
            p=matches[0];c.last_entity_type="product";c.last_entity_id=p.id;price=current_price(db,p.id)
            if not price:return f"Für {p.name} habe ich aktuell keinen verifizierten Preis."
            return f"Der verifizierte aktuelle Preis für {p.name} beträgt {_format_money(price.amount_cents)}. Quelle ist im Produktdatensatz hinterlegt."
        return "Welches Produkt meinst du genau?"

    if any(k in lower for k in ["farben", "varianten", "zubehör", "zubehoer"]) and c.last_entity_type=="product" and c.last_entity_id:
        p=db.get(Product,c.last_entity_id)
        if p and p.verified:
            if "farbe" in lower or "variant" in lower: return f"Hinterlegte verifizierte Varianten für {p.name}: {', '.join(map(str,p.variants_json or [])) or 'keine verlässlichen Varianten hinterlegt'}."
            return f"Hinterlegtes Zubehör für {p.name}: {', '.join(map(str,p.accessories_json or [])) or 'keine verlässlichen Zubehördaten hinterlegt'}."

    if "buntewoche" in lower or "bunte woche" in lower:
        return "Die Buntewoche findest du im Menü „Buntewoche“. Dort werden deine Termine und automatisch berechneten Kennzahlen angezeigt; der PDF-Export ist direkt verfügbar."

    return "Für freie natürliche Sprache ist noch kein KI-Anbieter konfiguriert. Kernfragen zu Terminen, Umsatz, Einheiten, Verleih und verifizierten Produktpreisen kann ich bereits lokal beantworten."


def _openai_answer(db: Session, user: User, c: Conversation, text: str) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=settings.openai_api_key,
        timeout=settings.openai_timeout_seconds,
        max_retries=2,
    )
    history = _recent_messages(db, c, 10)
    input_items = [{"role":m["role"],"content":m["content"]} for m in history]
    if not input_items or input_items[-1].get("content") != text:
        input_items.append({"role":"user","content":text})
    instructions = SYSTEM_PROMPT + f"\nAngemeldet: {user.full_name}; Rolle: {user.role.value}."
    safety_identifier = hashlib.sha256(f"orgaboard:{user.id}".encode()).hexdigest()
    for _ in range(5):
        response = client.responses.create(
            model=settings.openai_model,
            instructions=instructions,
            input=input_items,
            tools=TOOL_SPECS,
            store=False,
            reasoning={"effort":"low"},
            text={"verbosity":"low"},
            max_output_tokens=settings.openai_max_output_tokens,
            max_tool_calls=8,
            safety_identifier=safety_identifier,
        )
        calls = [o for o in response.output if getattr(o,"type",None)=="function_call"]
        if not calls:
            return response.output_text or "Dazu habe ich aktuell keine verlässlichen Daten."
        for item in response.output:
            input_items.append(item.to_dict() if hasattr(item,"to_dict") else dict(item))
        for call in calls:
            try: args=json.loads(call.arguments)
            except json.JSONDecodeError: args={}
            result=execute_tool(db,user,call.name,args)
            input_items.append({"type":"function_call_output","call_id":call.call_id,"output":json.dumps(result,ensure_ascii=False,default=str)})
    return "Die Anfrage konnte nicht sicher abgeschlossen werden. Bitte formuliere sie etwas genauer."


def chat(db: Session, user: User, text: str, conversation_id: str | None = None) -> dict:
    c=_conversation(db,user,conversation_id);_save(db,c,"user",text)
    if settings.ai_enabled and settings.openai_api_key:
        answer=_openai_answer(db,user,c,text)
    else:
        answer=_local_answer(db,user,c,text)
    _save(db,c,"assistant",answer);db.commit()
    return {"conversation_id":c.id,"answer":answer,"provider":"openai" if settings.openai_api_key and settings.ai_enabled else "local-safe"}
