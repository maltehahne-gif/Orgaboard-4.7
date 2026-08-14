"""Einfache Sperre gegen Passwort-Raten.

Bewusst prozesslokal und ohne zusaetzliche Infrastruktur: OrgaBoard laeuft als
einzelne Uvicorn-Instanz hinter nginx. Bei mehreren Instanzen oder Workern muss
das auf einen gemeinsamen Speicher (Redis o. ae.) umgestellt werden - bis dahin
ist eine gedaempfte Instanz besser als gar keine.

Gezaehlt wird pro Kombination aus E-Mail und Client-IP. Ein erfolgreicher Login
loescht den Zaehler.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

from fastapi import HTTPException, Request

# Ab so vielen Fehlversuchen innerhalb des Fensters wird gesperrt.
MAX_ATTEMPTS = 8

# Zeitfenster, in dem Fehlversuche zusammengezaehlt werden (Sekunden).
WINDOW_SECONDS = 15 * 60

# Dauer der Sperre nach Ueberschreiten (Sekunden).
BLOCK_SECONDS = 15 * 60

# Obergrenze, damit der Speicher nicht unbegrenzt waechst.
MAX_TRACKED_KEYS = 10_000


@dataclass
class _Bucket:
    attempts: list[float] = field(default_factory=list)
    blocked_until: float = 0.0


class LoginRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        """Entfernt Eintraege, die weder gesperrt noch aktuell relevant sind."""
        stale = [
            key
            for key, bucket in self._buckets.items()
            if bucket.blocked_until <= now
            and not [t for t in bucket.attempts if now - t < WINDOW_SECONDS]
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
                    detail=(
                        "Zu viele Fehlversuche. Bitte in "
                        f"{max(1, retry_after // 60)} Minuten erneut versuchen."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )

    def register_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(now)
            bucket = self._buckets.setdefault(key, _Bucket())
            bucket.attempts = [t for t in bucket.attempts if now - t < WINDOW_SECONDS]
            bucket.attempts.append(now)
            if len(bucket.attempts) >= MAX_ATTEMPTS:
                bucket.blocked_until = now + BLOCK_SECONDS
                bucket.attempts.clear()

    def reset(self, key: str) -> None:
        with self._lock:
            self._buckets.pop(key, None)

    def clear(self) -> None:
        """Alle Sperren aufheben. Fuer Tests und einen sauberen Neustart."""
        with self._lock:
            self._buckets.clear()


login_limiter = LoginRateLimiter()


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
