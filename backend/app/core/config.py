from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OrgaBoard"
    env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./orgaboard.db"
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_exp_minutes: int = 720
    cookie_secure: bool = False
    frontend_origin: str = "http://localhost:5173"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.5"
    ai_enabled: bool = True
    seed_default_password: str | None = None
    seed_allow_demo_business_data: bool = False
    auto_create_schema: bool = True
    business_timezone: str = "Europe/Berlin"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_production_secrets(self):
        if self.env == "production" and (self.jwt_secret == "CHANGE_ME_IN_PRODUCTION" or len(self.jwt_secret) < 32):
            raise ValueError("JWT_SECRET muss in Produktion mindestens 32 Zeichen lang und individuell gesetzt sein")
        return self


@lru_cache

def get_settings() -> Settings:
    return Settings()
