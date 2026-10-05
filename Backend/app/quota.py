"""Per-user daily quota, enforced atomically in Postgres via Supabase RPC functions."""
import asyncio
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
        self._client_loop: asyncio.AbstractEventLoop | None = None

    def _http(self) -> httpx.AsyncClient:
        # An httpx client is tied to the event loop it was first used on. A serverless runtime may
        # run a later request on a different loop, so a client from another loop is replaced.
        loop = asyncio.get_running_loop()
        if self._client is None or (self._client_loop is not None and self._client_loop is not loop):
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(5.0), headers=self._headers)
            self._client_loop = loop
        return self._client

    async def rpc(self, name: str, payload: dict) -> dict:
        if not self._enabled:
            return {"allowed": True, "used": 0, "limit": self._limit}
        try:
            response = await self._http().post(f"{self._base}/rpc/{name}", json=payload)
            response.raise_for_status()
            # Functions that return void (release, delete) respond with an empty body.
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Quota RPC %s failed: %s", name, type(exc).__name__)
            raise service_unavailable() from exc

    async def consume(self, user_id: str) -> QuotaStatus:
        data = await self.rpc("intrvufit_consume_quota", {"p_user_id": user_id, "p_limit": self._limit})
        return QuotaStatus(bool(data["allowed"]), int(data["used"]), int(data["limit"]))

    async def release(self, user_id: str) -> None:
        """Give back a unit after a failed analysis. Best effort: never raises."""
        try:
            await self.rpc("intrvufit_release_quota", {"p_user_id": user_id})
        except Exception:
            logger.warning("Could not release quota for a failed analysis")

    async def status(self, user_id: str) -> QuotaStatus:
        data = await self.rpc("intrvufit_get_usage", {"p_user_id": user_id, "p_limit": self._limit})
        return QuotaStatus(True, int(data["used"]), int(data["limit"]))


@lru_cache
def get_quota_service() -> QuotaService:
    return QuotaService(get_settings())


class UserDataService:
    """Deletes what IntrvuFit stores about a user. The Supabase auth user is deliberately NOT
    deleted: accounts are shared with other products."""

    def __init__(self, quota: QuotaService):
        self._quota = quota

    async def delete(self, user_id: str) -> None:
        await self._quota.rpc("intrvufit_delete_user_data", {"p_user_id": user_id})


@lru_cache
def get_user_data_service() -> UserDataService:
    return UserDataService(get_quota_service())
