"""Kommt an, was in der .env steht?

Der Anlass war ein stiller Ausfall: SYSTEM_ADMIN_EMAIL und
SYSTEM_ADMIN_PASSWORD waren in der .env.example dokumentiert, wurden in
docker-compose.yml aber nicht an den Container weitergereicht. Der Betreiber
trug seine Adresse ein, startete neu - und im Container war das Feld leer.
Es entstand nie ein Systemadministrator, der Verwaltungsbereich blieb
dauerhaft unerreichbar, und nirgends erschien ein Fehler. Falsch war weder
die .env noch der Code, sondern die Leitung dazwischen.

Solche Luecken faellt niemand von selbst auf, weil beide Seiten fuer sich
richtig aussehen. Diese Tests pruefen deshalb die Verbindung.
"""
import re
from pathlib import Path

PROJEKT = Path(__file__).resolve().parents[2]
ENV_BEISPIEL = PROJEKT / ".env.example"
COMPOSE = PROJEKT / "docker-compose.yml"


def _dokumentierte_namen() -> list[str]:
    text = ENV_BEISPIEL.read_text(encoding="utf-8")
    # Auskommentierte Beispielzeilen zaehlen nicht als Zusage.
    return [m.group(1) for m in re.finditer(r"^([A-Z][A-Z0-9_]*)=", text, re.M)]


def test_env_beispiel_und_compose_existieren():
    assert ENV_BEISPIEL.is_file(), "Ohne .env.example weiss niemand, was einstellbar ist"
    assert COMPOSE.is_file()


def test_jede_dokumentierte_einstellung_erreicht_den_container():
    """Was in der .env.example steht, muss auch ankommen.

    Eine dokumentierte Einstellung, die der Container nie sieht, ist
    schlimmer als eine fehlende: Sie sieht aus, als waere sie gesetzt.
    """
    compose = COMPOSE.read_text(encoding="utf-8")
    fehlend = [name for name in _dokumentierte_namen() if name not in compose]

    assert not fehlend, (
        "In .env.example dokumentiert, aber in docker-compose.yml nicht "
        f"weitergereicht: {', '.join(fehlend)}. Wer diese Werte in der .env "
        "setzt, sieht keine Wirkung und keinen Fehler."
    )


def test_betreiberkonto_ist_einstellbar():
    """Der Weg zum Verwaltungsbereich fuehrt ausschliesslich hierueber.

    Die Rolle SYSTEM_ADMIN laesst sich bewusst nicht ueber die Oberflaeche
    vergeben. Faellt diese Weitergabe weg, gibt es keinen zweiten Weg.
    """
    compose = COMPOSE.read_text(encoding="utf-8")
    for name in ("SYSTEM_ADMIN_EMAIL", "SYSTEM_ADMIN_PASSWORD"):
        assert name in compose, f"{name} erreicht den Container nicht"
        assert name in ENV_BEISPIEL.read_text(encoding="utf-8"), (
            f"{name} ist nicht dokumentiert - dann findet es niemand"
        )


def test_keine_geheimnisse_im_beispiel():
    """Die .env.example zeigt Schluessel, niemals Werte."""
    text = ENV_BEISPIEL.read_text(encoding="utf-8")
    for name in ("JWT_SECRET", "POSTGRES_PASSWORD", "SYSTEM_ADMIN_PASSWORD",
                 "SMTP_PASSWORD", "OPENAI_API_KEY"):
        for zeile in text.splitlines():
            if zeile.startswith(f"{name}="):
                assert zeile.strip() == f"{name}=", (
                    f"{name} hat in .env.example einen Wert stehen - "
                    "die Datei liegt im Repository und ist oeffentlich lesbar"
                )
