"""Bring-your-own-key: header validation, per-request LLM selection, quota bypass, key hygiene."""
import json
import logging

import httpx
import openai
import pytest

from app.config import Settings
from app.errors import AppError
from app.llm.client import GeminiLLM, OpenAILLM, ProviderError
from app.llm.factory import ByokConfig, parse_byok
from app.llm.models import QualityExtraction
from app.llm.redact import RedactingFilter, redact
from tests.conftest import JOB_DESCRIPTION, RESUME_TEXT, make_pdf, quality_extraction

KEY = "AIzaSyD-fake-key-for-tests-1234567890abcdef"
OPENAI_KEY = "sk-proj-fake-key-for-tests-1234567890abcdef"


def analyze(client, headers, byok_headers=None):
    return client.post(
        "/api/v1/analyze",
        headers={**headers, **(byok_headers or {})},
        files={"resume": ("resume.pdf", make_pdf(RESUME_TEXT), "application/pdf")},
        data={"jobData": json.dumps({"description": JOB_DESCRIPTION})},
    )


# ------------------------------------------------------------------ header validation
def test_no_headers_means_no_byok():
    assert parse_byok(None, None, None) is None


@pytest.mark.parametrize(
    "provider,key,model,code",
    [
        ("gemini", None, None, "invalid_llm_key"),  # model/provider without a key
        ("anthropic", KEY, None, "invalid_llm_provider"),
        (None, KEY, None, "invalid_llm_provider"),
        ("gemini", "short", None, "invalid_llm_key"),
        ("gemini", "has spaces in it which is not a key at all", None, "invalid_llm_key"),
        ("gemini", KEY, "../../etc/passwd", "invalid_llm_model"),
        ("gemini", KEY, "model with space", "invalid_llm_model"),
        ("openai", OPENAI_KEY, "gpt-4o?x=1", "invalid_llm_model"),
    ],
)
def test_invalid_byok_headers_are_rejected(provider, key, model, code):
    with pytest.raises(AppError) as err:
        parse_byok(provider, key, model)
    assert err.value.status_code == 400 and err.value.code == code


def test_valid_headers_are_normalized():
    cfg = parse_byok(" OpenAI ", f"  {OPENAI_KEY}  ", " gpt-4o-mini ")
    assert (cfg.provider, cfg.api_key, cfg.model) == ("openai", OPENAI_KEY, "gpt-4o-mini")


def test_the_key_never_appears_in_repr():
    cfg = ByokConfig(provider="gemini", api_key=KEY)
    assert KEY not in repr(cfg) and KEY not in str(cfg)


# ------------------------------------------------------------------ endpoints
def test_without_a_key_the_server_llm_is_used_and_quota_applies(client, auth, llm, quota):
    assert analyze(client, auth).status_code == 200
    assert llm.requested == [None]
    assert quota.consumed == 1


def test_own_key_is_passed_through_and_skips_the_daily_quota(client, auth, llm, quota):
    quota.allowed = False  # an exhausted free quota must not block someone paying their own provider
    response = analyze(client, auth, {"X-LLM-Provider": "gemini", "X-LLM-Key": KEY, "X-LLM-Model": "gemini-x"})
    assert response.status_code == 200, response.text
    cfg = llm.requested[0]
    assert (cfg.provider, cfg.api_key, cfg.model) == ("gemini", KEY, "gemini-x")
    assert quota.consumed == 0 and quota.released == 0
    assert response.json()["engine"] == {"provider": "fake", "model": "fake-model", "own_key": True}
    assert KEY not in response.text


def test_server_llm_is_reported_as_not_own_key(client, auth):
    assert analyze(client, auth).json()["engine"]["own_key"] is False


def test_failure_with_own_key_does_not_touch_quota(client, auth, llm, quota):
    llm.fail = AppError(400, "llm_key_rejected", "Gemini rejected your API key. Check it in Settings.")
    response = analyze(client, auth, {"X-LLM-Provider": "gemini", "X-LLM-Key": KEY})
    assert response.status_code == 400 and response.json()["error"]["code"] == "llm_key_rejected"
    assert quota.consumed == 0 and quota.released == 0


def test_invalid_key_headers_are_a_400_before_any_work(client, auth, llm, quota):
    response = analyze(client, auth, {"X-LLM-Provider": "nope", "X-LLM-Key": KEY})
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_llm_provider"
    assert llm.calls == 0 and quota.consumed == 0


def test_key_check_requires_auth_and_a_key(client, auth):
    assert client.post("/api/v1/key/check", headers={"X-LLM-Provider": "gemini", "X-LLM-Key": KEY}).status_code == 401
    response = client.post("/api/v1/key/check", headers=auth)
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_llm_key"


def test_key_check_success_and_failure(client, auth, llm):
    # The fake returns a QualityExtraction regardless of schema; the endpoint only needs no error.
    ok = client.post("/api/v1/key/check", headers={**auth, "X-LLM-Provider": "openai", "X-LLM-Key": OPENAI_KEY})
    assert ok.status_code == 200 and ok.json()["ok"] is True
    assert OPENAI_KEY not in ok.text
    llm.fail = AppError(400, "llm_key_rejected", "OpenAI rejected your API key. Check it in Settings.")
    bad = client.post("/api/v1/key/check", headers={**auth, "X-LLM-Provider": "openai", "X-LLM-Key": OPENAI_KEY})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "llm_key_rejected"


def test_cors_allows_the_key_headers_from_the_extension(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("CHROME_EXTENSION_IDS", "abcdef")
    get_settings.cache_clear()
    try:
        r = TestClient(create_app()).options(
            "/api/v1/analyze",
            headers={
                "Origin": "chrome-extension://abcdef",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,x-llm-key,x-llm-provider,x-llm-model",
            },
        )
        assert r.status_code == 200, r.text
    finally:
        get_settings.cache_clear()


# ------------------------------------------------------------------ key hygiene
def test_redact_removes_known_and_key_shaped_secrets():
    text = f"error calling with {KEY} and also {OPENAI_KEY} and plain-secret-value"
    cleaned = redact(text, "plain-secret-value")
    assert KEY not in cleaned and OPENAI_KEY not in cleaned and "plain-secret-value" not in cleaned
    assert cleaned.count("[redacted]") == 3


def test_log_filter_scrubs_keys_from_any_record(caplog):
    handler = logging.StreamHandler()
    handler.addFilter(RedactingFilter())
    record = logging.LogRecord("x", logging.WARNING, "f", 1, "bad key %s", (KEY,), None)
    assert handler.filter(record)
    assert KEY not in record.getMessage()


# ------------------------------------------------------------------ provider adapters (no network)
class FakeChatCompletions:
    def __init__(self, behaviours):
        self.behaviours, self.calls = list(behaviours), []

    async def parse(self, **kwargs):
        self.calls.append(kwargs)
        behaviour = self.behaviours.pop(0)
        if isinstance(behaviour, Exception):
            raise behaviour
        return behaviour


def openai_llm(behaviours, model="gpt-4o-mini", **settings):
    llm = OpenAILLM(Settings(llm_max_attempts=2, **settings), api_key=OPENAI_KEY, model=model)
    completions = FakeChatCompletions(behaviours)
    llm._client = type("C", (), {"chat": type("Ch", (), {"completions": completions})()})()
    return llm, completions


def completion(parsed, refusal=None):
    message = type("M", (), {"parsed": parsed, "refusal": refusal})()
    return type("R", (), {"choices": [type("Ch", (), {"message": message})()]})()


def status_error(cls, status, **extra):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx.Response(status, request=request, json={"error": {"message": "boom"}})
    exc = cls("boom", response=response, body=None)
    for k, v in extra.items():
        setattr(exc, k, v)
    return exc


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    async def instant(_):
        return None

    monkeypatch.setattr("app.llm.client.asyncio.sleep", instant)


async def run(llm):
    return await llm.extract(QualityExtraction, "system", "prompt")


async def test_openai_success_uses_structured_parse_with_determinism_settings():
    llm, calls = openai_llm([completion(quality_extraction())])
    result = await run(llm)
    assert result.structure_advice == "Add a summary."
    sent = calls.calls[0]
    assert sent["model"] == "gpt-4o-mini" and sent["response_format"] is QualityExtraction
    assert sent["temperature"] == 0 and "seed" in sent
    assert [m["role"] for m in sent["messages"]] == ["system", "user"]


async def test_reasoning_models_do_not_get_temperature_or_seed():
    for model in ("o3-mini", "gpt-5-mini", "o1"):
        llm, calls = openai_llm([completion(quality_extraction())], model=model)
        await run(llm)
        assert "temperature" not in calls.calls[0] and "seed" not in calls.calls[0], model
    llm, calls = openai_llm([completion(quality_extraction())], model="gpt-4o")
    await run(llm)
    assert "temperature" in calls.calls[0]


async def test_openai_bad_key_is_reported_as_the_users_key_problem():
    llm, _ = openai_llm([status_error(openai.AuthenticationError, 401)])
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.status_code == 400 and err.value.code == "llm_key_rejected"
    assert "OpenAI" in err.value.message and OPENAI_KEY not in err.value.message


async def test_openai_no_credit_is_reported_as_quota_not_retried():
    llm, calls = openai_llm([status_error(openai.RateLimitError, 429, code="insufficient_quota")])
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.code == "llm_key_quota"
    assert len(calls.calls) == 1  # retrying cannot help when there is no credit


async def test_openai_plain_rate_limit_is_retried_then_reported():
    llm, calls = openai_llm([status_error(openai.RateLimitError, 429), status_error(openai.RateLimitError, 429)])
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.code == "llm_key_quota" and len(calls.calls) == 2


async def test_openai_unknown_model_names_the_model():
    llm, _ = openai_llm([status_error(openai.NotFoundError, 404)], model="gpt-made-up")
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.code == "llm_model_not_found" and "gpt-made-up" in err.value.message


async def test_openai_refusal_and_bad_request_fail_cleanly():
    llm, _ = openai_llm([completion(None, refusal="I cannot help with that")])
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.status_code == 502
    llm, _ = openai_llm([status_error(openai.BadRequestError, 400)])
    with pytest.raises(AppError) as err:
        await run(llm)
    assert err.value.status_code == 502


async def test_openai_server_errors_are_retried_once():
    llm, calls = openai_llm([status_error(openai.InternalServerError, 500), completion(quality_extraction())])
    await run(llm)
    assert len(calls.calls) == 2


def test_own_gemini_model_gets_no_server_fallback():
    llm = GeminiLLM(Settings(llm_fallback_model="server-fallback"), api_key=KEY, model="my-model", byok=True)
    assert llm._model_for(2, 2) == "my-model"
    default = GeminiLLM(Settings(llm_fallback_model="server-fallback", llm_model="main"), api_key=KEY, byok=True)
    assert default._model_for(2, 2) == "server-fallback"


def test_provider_error_kinds_for_gemini():
    from google.genai import errors

    def make(code, message="x"):
        return errors.APIError(code, {"error": {"code": code, "message": message, "status": "S"}})

    assert GeminiLLM._classify(make(400, "API key not valid. Please pass a valid API key.")).kind == "auth"
    assert GeminiLLM._classify(make(403)).kind == "auth"
    assert GeminiLLM._classify(make(404)).kind == "model_missing"
    assert GeminiLLM._classify(make(429)).kind == "transient"
    assert GeminiLLM._classify(make(400, "bad schema")).kind == "rejected"
    assert isinstance(ProviderError("auth"), Exception)
