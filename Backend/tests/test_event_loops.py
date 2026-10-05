"""Clients must survive a runtime that serves later requests on a different event loop."""
import asyncio

from app.config import Settings
from app.llm.client import GeminiLLM, OpenAILLM
from app.quota import QuotaService


def run(coro):
    return asyncio.run(coro)


def test_quota_http_client_is_reused_within_a_loop_and_rebuilt_for_a_new_one():
    svc = QuotaService(Settings(auth_required=True, supabase_url="https://x.supabase.co", supabase_service_role_key="k"))

    async def two_calls():
        return svc._http(), svc._http()

    first_a, first_b = run(two_calls())
    assert first_a is first_b  # same loop: one shared client (keeps connections warm)
    second, _ = run(two_calls())
    assert second is not first_a  # a new loop: a fresh client, never one bound to a closed loop


def test_gemini_client_is_rebuilt_for_a_new_loop():
    llm = GeminiLLM(Settings(gemini_api_key="x"))

    async def get():
        return llm._get_client(), llm._get_client()

    a1, a2 = run(get())
    assert a1 is a2
    b, _ = run(get())
    assert b is not a1


def test_openai_client_is_rebuilt_for_a_new_loop():
    llm = OpenAILLM(Settings(), api_key="sk-proj-abcdefghijklmnopqrstuvwxyz")

    async def get():
        return llm._get_client(), llm._get_client()

    a1, a2 = run(get())
    assert a1 is a2
    b, _ = run(get())
    assert b is not a1


def test_a_client_injected_for_testing_is_left_alone():
    llm = GeminiLLM(Settings(gemini_api_key="x"))
    fake = object()
    llm._client = fake  # tests set this directly; it has no recorded loop

    async def get():
        return llm._get_client()

    assert run(get()) is fake
