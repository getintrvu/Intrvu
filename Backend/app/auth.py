"""Supabase JWT verification.

New Supabase projects sign access tokens with asymmetric keys published at a JWKS endpoint;
legacy projects use a shared HS256 secret. Both are supported.
"""
import logging
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import Settings, get_settings
from app.errors import service_unavailable, unauthorized

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)
_ASYMMETRIC_ALGS = ["ES256", "RS256", "EdDSA"]


@dataclass(frozen=True)
class User:
    id: str
    email: str | None = None


class TokenVerifier:
    def __init__(self, settings: Settings):
        self._secret = settings.supabase_jwt_secret
        self._issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
        self._jwks = (
            PyJWKClient(f"{self._issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)
            if self._issuer and not self._secret
            else None
        )

    def verify(self, token: str) -> User:
        if not self._secret and not self._jwks:
            logger.error("Auth is required but Supabase is not configured")
            raise service_unavailable("auth_not_configured", "Authentication is not configured.")
        try:
            if self._secret:
                key, algorithms = self._secret, ["HS256"]
            else:
                key, algorithms = self._jwks.get_signing_key_from_jwt(token).key, _ASYMMETRIC_ALGS
            claims = jwt.decode(
                token,
                key,
                algorithms=algorithms,
                audience="authenticated",
                issuer=self._issuer,
                options={"require": ["exp", "sub"]},
            )
        except jwt.PyJWKClientConnectionError as exc:
            logger.error("Could not fetch Supabase signing keys: %s", exc)
            raise service_unavailable() from exc
        except jwt.PyJWTError as exc:
            logger.info("Rejected token: %s", type(exc).__name__)
            raise unauthorized("Your session has expired. Please sign in again.") from exc
        return User(id=claims["sub"], email=claims.get("email"))


@lru_cache
def get_verifier() -> TokenVerifier:
    return TokenVerifier(get_settings())


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    settings: Settings = Depends(get_settings),
    verifier: TokenVerifier = Depends(get_verifier),
) -> User:
    if not settings.auth_required:
        return User(id="00000000-0000-0000-0000-000000000000", email="dev@localhost")
    if credentials is None or not credentials.credentials:
        raise unauthorized()
    return await run_in_threadpool(verifier.verify, credentials.credentials)
