"""Live bring-your-own-key checks against the real provider APIs.

    .venv/Scripts/python -m pytest -m live tests/live/test_byok_live.py

Rejected-key cases need no real key (a fake key is sent to the real API). The success cases use
GEMINI_API_KEY from Backend/.env as if it were a user's own key, and are skipped without it.
"""
import json

import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient

from app.auth import User, get_current_user
from app.main import create_app
from app.quota import get_quota_service
from tests.conftest import JOB_DESCRIPTION, RESUME_TEXT, FakeQuota, make_pdf

pytestmark = pytest.mark.live

FAKE_GEMINI = "AIzaSyD-this-is-not-a-real-key-0000000000"
FAKE_OPENAI = "sk-proj-this-is-not-a-real-key-000000000000000000"
USER = User(id="22222222-2222-2222-2222-222222222222", email="live@example.com")


@pytest.fixture
def quota():
    return FakeQuota()


@pytest.fixture
def client(quota):
    app = create_app()  # real LLM factory: nothing is faked except the sign-in and the quota store
    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_quota_service] = lambda: quota
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def real_gemini_key():
    key = dotenv_values(".env").get("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY is not set in Backend/.env")
    return key


def test_openai_rejects_a_fake_key_with_a_clear_message(client):
    r = client.post("/api/v1/key/check", headers={"X-LLM-Provider": "openai", "X-LLM-Key": FAKE_OPENAI})
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "llm_key_rejected"
    assert "OpenAI" in r.json()["error"]["message"]
    assert FAKE_OPENAI not in r.text


def test_gemini_rejects_a_fake_key_with_a_clear_message(client):
    r = client.post("/api/v1/key/check", headers={"X-LLM-Provider": "gemini", "X-LLM-Key": FAKE_GEMINI})
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "llm_key_rejected"
    assert FAKE_GEMINI not in r.text


def test_a_real_gemini_key_passes_the_check(client, real_gemini_key):
    r = client.post("/api/v1/key/check", headers={"X-LLM-Provider": "gemini", "X-LLM-Key": real_gemini_key})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True and r.json()["provider"] == "gemini"
    assert real_gemini_key not in r.text


def test_a_wrong_model_name_is_reported_as_such(client, real_gemini_key):
    r = client.post(
        "/api/v1/key/check",
        headers={"X-LLM-Provider": "gemini", "X-LLM-Key": real_gemini_key, "X-LLM-Model": "gemini-no-such-model"},
    )
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "llm_model_not_found"
    assert "gemini-no-such-model" in r.json()["error"]["message"]


def test_full_analysis_with_the_users_own_key_skips_our_quota(client, quota, real_gemini_key):
    quota.allowed = False  # even an exhausted shared quota must not block a user paying their own provider
    r = client.post(
        "/api/v1/analyze",
        headers={"X-LLM-Provider": "gemini", "X-LLM-Key": real_gemini_key},
        files={"resume": ("resume.pdf", make_pdf(RESUME_TEXT), "application/pdf")},
        data={"jobData": json.dumps({"description": JOB_DESCRIPTION})},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"]["provider"] == "gemini" and body["engine"]["own_key"] is True
    assert 0 <= body["job_fit_score"]["percentage"] <= 100
    assert quota.consumed == 0
    assert real_gemini_key not in r.text
