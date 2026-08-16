from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from app.core.config import get_settings

BUSINESS_TZ = ZoneInfo(get_settings().business_timezone)


def utc_aware(value: datetime) -> datetime:
    # SQLite may return a naive value even for timezone=True. Stored values are UTC.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def to_business_tz(value: datetime) -> datetime:
    return utc_aware(value).astimezone(BUSINESS_TZ)


def local_today() -> date:
    return datetime.now(BUSINESS_TZ).date()


def _local_midnight_to_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=BUSINESS_TZ).astimezone(timezone.utc)


def week_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    d = day or local_today()
    monday = d - timedelta(days=d.weekday())
    start = _local_midnight_to_utc(monday)
    end = _local_midnight_to_utc(monday + timedelta(days=7))
    return start, end


def day_bounds(day: date) -> tuple[datetime, datetime]:
    return _local_midnight_to_utc(day), _local_midnight_to_utc(day + timedelta(days=1))


def month_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    d = day or local_today()
    first = d.replace(day=1)
    if first.month == 12:
        nxt = first.replace(year=first.year + 1, month=1)
    else:
        nxt = first.replace(month=first.month + 1)
    return _local_midnight_to_utc(first), _local_midnight_to_utc(nxt)


def quarter_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    d = day or local_today()
    first_month = (d.month - 1) // 3 * 3 + 1
    first = d.replace(month=first_month, day=1)
    if first_month == 10:
        nxt = first.replace(year=first.year + 1, month=1)
    else:
        nxt = first.replace(month=first_month + 3)
    return _local_midnight_to_utc(first), _local_midnight_to_utc(nxt)


def year_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    d = day or local_today()
    first = d.replace(month=1, day=1)
    nxt = first.replace(year=first.year + 1)
    return _local_midnight_to_utc(first), _local_midnight_to_utc(nxt)


# Ein Vertriebssystem verwaltet die naechsten Jahre, nicht die naechsten
# Jahrhunderte. Diese Fenster fangen Tippfehler in Jahreszahlen ab -
# "2206" statt "2026" legte sonst einen Termin an, der nie wieder auftaucht,
# und eine Wiedervorlage aus dem Jahr 1990 waere ab dem ersten Tag
# ueberfaellig und stuende dauerhaft ganz oben in den Tagesprioritaeten.
JAHRE_RUECKWIRKEND = 10
JAHRE_VORAUS = 10


def _jahre_versetzt(tag: date, jahre: int) -> date:
    # Nicht ueber replace(year=...): am 29. Februar gaebe es das Zieldatum in
    # einem Nicht-Schaltjahr nicht, und die Pruefung wuerde ausgerechnet an
    # diesem Tag mit einem Fehler abbrechen.
    try:
        return tag.replace(year=tag.year + jahre)
    except ValueError:
        return tag.replace(year=tag.year + jahre, day=28)


def fruehestes_datum() -> date:
    return _jahre_versetzt(local_today(), -JAHRE_RUECKWIRKEND)


def spaetestes_datum() -> date:
    return _jahre_versetzt(local_today(), JAHRE_VORAUS)


def datum_plausibel(wert: date) -> bool:
    """Liegt das Datum im Bereich, den dieses System sinnvoll abbildet?"""
    return fruehestes_datum() <= wert <= spaetestes_datum()


def period_bounds(
    period: str, date_from: date | None = None, date_to: date | None = None
) -> tuple[datetime, datetime]:
    """Zeitraumgrenzen fuer einen benannten Zeitraum oder einen eigenen.

    Eine Stelle fuer Dashboard, Cockpit und Mitarbeitervergleich - sonst
    entscheidet jede Auswertung fuer sich, was "diese Woche" bedeutet, und
    zwei Seiten zeigen am Wochenrand unterschiedliche Zahlen. Unbekannte
    oder unvollstaendige Angaben fallen auf den laufenden Monat zurueck.
    """
    if period == "custom" and date_from and date_to:
        start, _ = day_bounds(date_from)
        _, end = day_bounds(date_to)
        return start, end
    today = local_today()
    if period == "week":
        return week_bounds(today)
    if period == "day":
        return day_bounds(today)
    if period == "quarter":
        return quarter_bounds(today)
    if period == "year":
        return year_bounds(today)
    return month_bounds(today)
