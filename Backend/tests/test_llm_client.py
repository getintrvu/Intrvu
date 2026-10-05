"""GeminiLLM retry / fallback behaviour, with a fake SDK client (no network)."""
import pytest
from google.genai import errors

from app.config import Settings
from app.errors import AppError
from app.llm.client import GeminiLLM
from app.llm.models import QualityExtraction
from tests.conftest import quality_extraction


class FakeResponse:
    def __init__(self, parsed=None, text=None):
        self.parsed, self.text = parsed, text


class FakeModels:
    def __init__(self, behaviours):
        self.behaviours, self.models_used = list(behaviours), []

    async def generate_content(self, model, contents, config):
        self.models_used.append(model)
        behaviour = self.behaviours.pop(0)
        if isinstance(behaviour, Exception):
            raise behaviour
        return behaviour


def llm_with(behaviours, **settings):
    llm = GeminiLLM(Settings(gemini_api_key="x", llm_model="primary", llm_fallback_model="fallback", **settings))
    models = FakeModels(behaviours)
    llm._client = type("C", (), {"aio": type("A", (), {"models": models})()})()
    return llm, models


def api_error(code):
    return errors.APIError(code, {"error": {"code": code, "message": "boom", "status": "X"}})


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    async def instant(_):
        return None
    monkeypatch.setattr("app.llm.client.asyncio.sleep", instant)


async def call(llm):
    return await llm.extract(QualityExtraction, "sys", "prompt")


async def test_success_uses_primary_model():
    llm, models = llm_with([FakeResponse(parsed=quality_extraction())])
    assert (await call(llm)).structure_advice == "Add a summary."
    assert models.models_used == ["primary"]


async def test_transient_error_retries_on_the_fallback_model():
    llm, models = llm_with([api_error(503), FakeResponse(parsed=quality_extraction())])
    await call(llm)
    assert models.models_used == ["primary", "fallback"]


async def test_retired_primary_model_404_rolls_over_to_fallback():
    llm, models = llm_with([api_error(404), FakeResponse(parsed=quality_extraction())])
    await call(llm)
    assert models.models_used == ["primary", "fallback"]


async def test_persistent_busy_becomes_503_not_a_fake_result():
    llm, _ = llm_with([api_error(503), api_error(503)])
    with pytest.raises(AppError) as err:
        await call(llm)
    assert err.value.status_code == 503 and err.value.code == "llm_busy"


async def test_non_retryable_error_fails_immediately():
    llm, models = llm_with([api_error(400)])
    with pytest.raises(AppError) as err:
        await call(llm)
    assert err.value.status_code == 502
    assert models.models_used == ["primary"]


async def test_malformed_json_is_retried_once():
    llm, models = llm_with([FakeResponse(parsed=None, text="{not json"), FakeResponse(parsed=quality_extraction())])
    await call(llm)
    assert len(models.models_used) == 2
