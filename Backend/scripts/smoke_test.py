"""Checks a deployed backend. Needs no keys and changes nothing.

    python scripts/smoke_test.py https://your-project.vercel.app chrome-extension://<extension-id>

Run it right after a deploy. It proves the function starts, the routes exist, authentication is
enforced, CORS only allows the extension, and the API docs are hidden in production.
"""
import json
import sys
import urllib.error
import urllib.request


def call(base, path, method="GET", headers=None, data=None):
    request = urllib.request.Request(base + path, method=method, headers=headers or {}, data=data)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, dict(response.headers), response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode()


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    base, origin = sys.argv[1].rstrip("/"), sys.argv[2]
    failures = 0

    def check(label, ok, detail=""):
        nonlocal failures
        print(("PASS " if ok else "FAIL ") + label + (f"  ({detail})" if detail and not ok else ""))
        failures += 0 if ok else 1

    status, _, body = call(base, "/api/health")
    check("health answers ok", status == 200 and '"ok"' in body, f"{status} {body[:80]}")

    status, _, body = call(base, "/api/v1/usage")
    code = ""
    try:
        code = json.loads(body)["error"]["code"]
    except Exception:
        pass
    check("usage without a token is rejected with a JSON error", status == 401 and code == "unauthorized", f"{status} {body[:80]}")

    status, _, _ = call(base, "/api/v1/analyze", method="POST")
    check("analyze without a token is rejected", status in (401, 422), str(status))

    status, headers, _ = call(
        base, "/api/v1/analyze", method="OPTIONS",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,x-llm-key"},
    )
    lowered = {k.lower(): v for k, v in headers.items()}
    check("CORS allows the extension", lowered.get("access-control-allow-origin") == origin, f"{status} {lowered.get('access-control-allow-origin')}")

    status, headers, _ = call(
        base, "/api/v1/analyze", method="OPTIONS",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    lowered = {k.lower(): v for k, v in headers.items()}
    check("CORS refuses other sites", "access-control-allow-origin" not in lowered, str(lowered.get("access-control-allow-origin")))

    for path in ("/docs", "/openapi.json"):
        status, _, _ = call(base, path)
        check(f"{path} is hidden in production", status == 404, str(status))

    print("\nAll checks passed." if not failures else f"\n{failures} check(s) failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
