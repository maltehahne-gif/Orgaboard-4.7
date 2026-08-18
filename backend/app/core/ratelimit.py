"""Einfache Sperre gegen Passwort-Raten und andere Missbrauchsversuche.

Bewusst prozesslokal und ohne zusaetzliche Infrastruktur: OrgaBoard laeuft als
einzelne Uvicorn-Instanz hinter nginx. Bei mehreren Instanzen oder Workern muss
das auf einen gemeinsamen Speicher (Redis o. ae.) umgestellt werden - bis dahin
ist eine gedaempfte Instanz besser als gar keine.

RateLimiter ist bewusst generisch (statt nur fuer den Login gebaut): dieselbe
Sperrlogik - Fenster, Schwelle, Sperrdauer - passt genauso auf andere Formen
von Missbrauch, zum Beispiel zu viele Feedback-Einsendungen. Ein zweiter,
eigens gebauter Zaehler wuerde nur dieselbe Logik ein zweites Mal enthalten.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

from fastapi import HTTPException, Request

# Login: ab so vielen Fehlversuchen innerhalb des Fensters wird gesperrt.
MAX_ATTEMPTS = 8

# Login: Zeitfenster, in dem Fehlversuche zusammengezaehlt werden (Sekunden).
WINDOW_SECONDS = 15 * 60

# Login: Dauer der Sperre nach Ueberschreiten (Sekunden).
BLOCK_SECONDS = 15 * 60

# Obergrenze, damit der Speicher nicht unbegrenzt waechst.
MAX_TRACKED_KEYS = 10_000


@dataclass
class _Bucket:
    attempts: list[float] = field(default_factory=list)
    blocked_until: float = 0.0


class RateLimiter:
    """Zaehlt Vorgaenge je Schluessel und sperrt ab einer Schwelle innerhalb
    eines Zeitfensters - fuer eine Sperrdauer, die auch laenger als das
    Zaehlfenster sein kann."""

    def __init__(
        self,
        max_attempts: int = MAX_ATTEMPTS,
        window_seconds: float = WINDOW_SECONDS,
        block_seconds: float = BLOCK_SECONDS,
        block_message: str = "Zu viele Anfragen. Bitte in {minuten} Minuten erneut versuchen.",
    ) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._block_seconds = block_seconds
        self._block_message = block_message
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        """Entfernt Eintraege, die weder gesperrt noch aktuell relevant sind."""
        stale = [
            key
            for key, bucket in self._buckets.items()
            if bucket.blocked_until <= now
            and not [t for t in bucket.attempts if now - t < self._window_seconds]
        ]
        for key in stale:
            del self._buckets[key]

        # Notbremse, falls die Sperren schneller wachsen als sie ablaufen.
        if len(self._buckets) > MAX_TRACKED_KEYS:
            oldest = sorted(
                self._buckets.items(),
                key=lambda item: max(item[1].attempts, default=0.0),
            )
            for key, _ in oldest[: len(self._buckets) - MAX_TRACKED_KEYS]:
                del self._buckets[key]

    def check(self, key: str) -> None:
        """Wirft 429, wenn der Schluessel aktuell gesperrt ist."""
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.get(key)
            if not bucket:
                return
            if bucket.blocked_until > now:
                retry_after = int(bucket.blocked_until - now) + 1
                raise HTTPException(
                    status_code=429,
                    detail=self._block_message.format(minuten=max(1, retry_after // 60)),
                    headers={"Retry-After": str(retry_after)},
                )

    def register_attempt(self, key: str) -> None:
        """Zaehlt einen Vorgang. Ab der Schwelle wird der Schluessel gesperrt."""
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            bucket = self._buckets.setdefault(key, _Bucket())
            bucket.attempts = [t for t in bucket.attempts if now - t < self._window_seconds]
            bucket.attempts.append(now)
            if len(bucket.attempts) >= self._max_attempts:
                bucket.blocked_until = now + self._block_seconds
                bucket.attempts.clear()

    # Historischer Name fuer register_attempt() - der Login zaehlt nur
    # fehlgeschlagene Versuche, deshalb die treffendere Bezeichnung an dieser
    # einen Aufrufstelle.
    register_failure = register_attempt

    def reset(self, key: str) -> None:
        with self._lock:
            self._buckets.pop(key, None)

    def clear(self) -> None:
        """Alle Sperren aufheben. Fuer Tests und einen sauberen Neustart."""
        with self._lock:
            self._buckets.clear()


# Rueckwaertskompatibler Name - an 27 Stellen importiert.
LoginRateLimiter = RateLimiter

login_limiter = RateLimiter(
    max_attempts=MAX_ATTEMPTS,
    window_seconds=WINDOW_SECONDS,
    block_seconds=BLOCK_SECONDS,
    block_message="Zu viele Fehlversuche. Bitte in {minuten} Minuten erneut versuchen.",
)

# Feedback: hoechstens 5 Einsendungen innerhalb von 10 Minuten je Benutzer.
FEEDBACK_MAX_ATTEMPTS = 5
FEEDBACK_WINDOW_SECONDS = 10 * 60
FEEDBACK_BLOCK_SECONDS = 10 * 60

feedback_limiter = RateLimiter(
    max_attempts=FEEDBACK_MAX_ATTEMPTS,
    window_seconds=FEEDBACK_WINDOW_SECONDS,
    block_seconds=FEEDBACK_BLOCK_SECONDS,
    block_message=(
        "Du hast in kurzer Zeit mehrere Feedbacks gesendet. "
        "Bitte versuche es in {minuten} Minuten erneut."
    ),
)


def client_ip(request: Request) -> str:
    """Client-IP hinter dem nginx-Proxy.

    nginx setzt X-Forwarded-For. Der erste Eintrag ist der urspruengliche
    Client; alles danach sind Proxys.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def login_key(request: Request, email: str) -> str:
    return f"{client_ip(request)}|{email.lower().strip()}"
