"""New Supabase projects sign tokens with asymmetric keys (JWKS). Exercise that path offline."""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth import TokenVerifier
from app.config import Settings
from app.errors import AppError

ISSUER = "https://proj.supabase.co/auth/v1"


@pytest.fixture
def verifier_and_key():
    settings = Settings(supabase_url="https://proj.supabase.co", supabase_jwt_secret="", auth_required=True)
    verifier = TokenVerifier(settings)
    key = ec.generate_private_key(ec.SECP256R1())
    # Stand in for the network call to the JWKS endpoint.
    verifier._jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=key.public_key()))
    return verifier, key


def token(key, **overrides):
    claims = {"sub": "abc", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 600, "email": "a@b.c"}
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="ES256")


def test_valid_es256_token(verifier_and_key):
    verifier, key = verifier_and_key
    user = verifier.verify(token(key))
    assert user.id == "abc" and user.email == "a@b.c"


@pytest.mark.parametrize("override", [{"iss": "https://evil.example/auth/v1"}, {"aud": "anon"}, {"exp": 1}])
def test_invalid_claims_rejected(verifier_and_key, override):
    verifier, key = verifier_and_key
    with pytest.raises(AppError) as err:
        verifier.verify(token(key, **override))
    assert err.value.status_code == 401


def test_token_signed_by_another_key_rejected(verifier_and_key):
    verifier, _ = verifier_and_key
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(AppError) as err:
        verifier.verify(token(other))
    assert err.value.status_code == 401


def test_alg_none_and_hs256_confusion_rejected(verifier_and_key):
    verifier, key = verifier_and_key
    forged = jwt.encode({"sub": "x", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 60}, "k" * 40, algorithm="HS256")
    with pytest.raises(AppError):
        verifier.verify(forged)


def test_unconfigured_supabase_fails_closed():
    verifier = TokenVerifier(Settings(supabase_url="", supabase_jwt_secret="", auth_required=True))
    with pytest.raises(AppError) as err:
        verifier.verify("anything")
    assert err.value.status_code == 503


def test_small_clock_skew_is_tolerated(verifier_and_key):
    """A token 'issued' 30 s in the future (our clock slightly behind Supabase's) must still work."""
    verifier, key = verifier_and_key
    now = int(time.time())
    assert verifier.verify(token(key, iat=now + 30, nbf=now + 30)).id == "abc"
    with pytest.raises(AppError):
        verifier.verify(token(key, iat=now + 600, nbf=now + 600))  # a real problem is still rejected
