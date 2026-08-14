from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "CHANGE_ME_IN_PRODUCTION"

# Secrets, die im Repository nachlesbar sind. Wer eines davon einsetzt, kann von
# jedem, der das Repository kennt, beliebige Sitzungen faelschen - inklusive der
# Teamleiter-Rolle. Ausserhalb der lokalen Entwicklung wird der Start verweigert.
PUBLIC_JWT_SECRETS = {
    DEFAULT_JWT_SECRET,
    "orgaboard-local-only-jwt-secret-2026-change-before-public-deployment",
}


class Settings(BaseSettings):
    app_name: str = "OrgaBoard"
    env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./orgaboard.db"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_exp_minutes: int = 720
    cookie_secure: bool = False
    frontend_origin: str = "http://localhost:5173"
    # Kommagetrennte Zusatzadressen, auf die ein Passwort-Reset-Link zeigen darf,
    # z. B. eine Codespaces-URL. Nur konfigurierte Werte, nie Request-Header.
    password_reset_allowed_origins: str = ""
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-terra"
    openai_max_output_tokens: int = 1600
    openai_timeout_seconds: float = 45.0
    ai_enabled: bool = True
    seed_default_password: str | None = None
    seed_allow_demo_business_data: bool = False
    auto_create_schema: bool = True
    business_timezone: str = "Europe/Berlin"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True
    password_reset_exp_minutes: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_production_secrets(self):
        # Mitgelieferte Secrets duerfen nur in der lokalen Entwicklung gelten.
        # Frueher haing die Pruefung allein an env == "production" - damit lief das
        # Compose-Setup (ENV=development) dauerhaft mit einem oeffentlich bekannten
        # Schluessel, ohne dass die Pruefung je angeschlagen haette.
        if self.env != "development" and self.jwt_secret in PUBLIC_JWT_SECRETS:
            raise ValueError(
                "JWT_SECRET ist ein im Repository nachlesbarer Standardwert. "
                "Bitte vor dem Betrieb ein eigenes Secret setzen, "
                "z. B. mit: python -c \"import secrets;print(secrets.token_urlsafe(48))\""
            )
        if self.env == "production" and len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET muss in Produktion mindestens 32 Zeichen lang und individuell gesetzt sein")
        if self.env == "production" and not self.cookie_secure:
            raise ValueError("COOKIE_SECURE muss in Produktion true sein, sonst wird das Sessioncookie unverschluesselt uebertragen")
        return self


@lru_cache

def get_settings() -> Settings:
    return Settings()
