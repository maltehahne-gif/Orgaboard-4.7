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
