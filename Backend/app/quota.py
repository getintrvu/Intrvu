"""Per-user daily quota, enforced atomically in Postgres via Supabase RPC functions."""
import logging
from dataclasses import dataclass
from functools import lru_cache

import httpx

from app.config import Settings, get_settings
from app.errors import service_unavailable

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QuotaStatus:
    allowed: bool
    used: int
    limit: int

    @property
    def remaining(self) -> int:
        return max(self.limit - self.used, 0)


class QuotaService:
    """Talks to Supabase PostgREST with the service role key. When auth is disabled (local
    development) the quota is not enforced."""

    def __init__(self, settings: Settings):
        self._enabled = settings.auth_required
        self._limit = settings.daily_quota
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        self._headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }
        self._client: httpx.AsyncClient | None = None

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(5.0), headers=self._headers)
        return self._client

    async def _rpc(self, name: str, payload: dict) -> dict:
        if not self._enabled:
            return {"allowed": True, "used": 0, "limit": self._limit}
        try:
            response = await self._http().post(f"{self._base}/rpc/{name}", json=payload)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Quota RPC %s failed: %s", name, type(exc).__name__)
            raise service_unavailable() from exc

    async def consume(self, user_id: str) -> QuotaStatus:
        data = await self._rpc("consume_quota", {"p_user_id": user_id, "p_limit": self._limit})
        return QuotaStatus(bool(data["allowed"]), int(data["used"]), int(data["limit"]))

    async def release(self, user_id: str) -> None:
        """Give back a unit after a failed analysis. Best effort: never raises."""
        try:
            await self._rpc("release_quota", {"p_user_id": user_id})
        except Exception:
            logger.warning("Could not release quota for a failed analysis")

    async def status(self, user_id: str) -> QuotaStatus:
        data = await self._rpc("get_usage", {"p_user_id": user_id, "p_limit": self._limit})
        return QuotaStatus(True, int(data["used"]), int(data["limit"]))


@lru_cache
def get_quota_service() -> QuotaService:
    return QuotaService(get_settings())
