"""Application settings, read from environment variables (or a local .env file)."""
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    environment: str = "development"

    # LLM
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.5-flash-lite"
    # Tried on the last attempt when the primary model keeps failing with a transient error.
    llm_fallback_model: str = "gemini-3.1-flash-lite"
    llm_seed: int | None = 7  # fixed sampling seed: reduces run-to-run variation
    llm_timeout_seconds: float = 40.0
    llm_max_attempts: int = 2

    # Supabase (auth + quota). The service role key is backend-only.
    supabase_url: str = ""
    supabase_jwt_secret: str = ""  # only for legacy HS256 projects; otherwise JWKS is used
    supabase_service_role_key: str = ""

    # Auth / quota
    auth_required: bool = True
    daily_quota: int = 10

    # CORS: comma separated origins, plus extension ids that become chrome-extension://<id>
    allowed_origins: str = ""
    chrome_extension_ids: str = ""

    # Input limits (4 MB stays under Vercel's ~4.5 MB request body limit)
    max_pdf_size_mb: int = 4
    max_pdf_pages: int = 10
    max_resume_chars: int = 30_000
    max_job_chars: int = 20_000

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def max_pdf_bytes(self) -> int:
        return self.max_pdf_size_mb * 1024 * 1024

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        origins += [
            f"chrome-extension://{i.strip()}" for i in self.chrome_extension_ids.split(",") if i.strip()
        ]
        return list(dict.fromkeys(origins))

    @model_validator(mode="after")
    def _production_requires_auth(self) -> "Settings":
        if self.is_production and not self.auth_required:
            raise ValueError("AUTH_REQUIRED must be true in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
