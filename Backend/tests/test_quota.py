import httpx
import pytest

from app.config import Settings
from app.quota import QuotaService


def service(handler):
    svc = QuotaService(Settings(auth_required=True, supabase_url="https://x.supabase.co", supabase_service_role_key="k", daily_quota=5))
    svc._client = httpx.AsyncClient(transport=httpx.MockTransport(handler), headers=svc._headers)
    return svc


async def test_void_rpc_with_empty_body_does_not_break_release():
    """release/delete return nothing; an empty body used to raise JSONDecodeError."""
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(204)

    await service(handler).release("user-1")
    assert calls == ["/rest/v1/rpc/intrvufit_release_quota"]


async def test_consume_parses_the_json_result():
    svc = service(lambda r: httpx.Response(200, json={"allowed": True, "used": 2, "limit": 5}))
    status = await svc.consume("user-1")
    assert (status.allowed, status.used, status.remaining) == (True, 2, 3)


async def test_quota_service_errors_fail_closed_with_503():
    from app.errors import AppError

    svc = service(lambda r: httpx.Response(500, json={"message": "db down"}))
    with pytest.raises(AppError) as err:
        await svc.consume("user-1")
    assert err.value.status_code == 503
