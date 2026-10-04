# IntrvuFit — Improvement Plan

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

Ordering principle: stop money/data leaks first, then make results trustworthy, then clean up, then modernise, then build features. Each phase ends in a shippable state, and each phase should land as its own commit/PR.

---

## Phase 1 — Security, cost and privacy (do first)

Goal: nobody can run up the LLM bill or read user data, and the store listing is defensible.

| # | Task | Where | Done |
|---|------|-------|------|
| 1.1 | Remove the `output.json` debug write (stores user analyses on disk) | `Backend/routers/analyze.py:141-156` | [x] |
| 1.2 | Fix `/api/filter-job-description` (`request.text` → `request_data.text`); make the LLM call async; add auth | `Backend/routers/analyze.py:181-238`, `app/utils/job_filter.py` | [~] bug fixed; it is a passthrough with no LLM call, so it only needs the Supabase auth dependency later |
| 1.3 | Real auth: stop shipping a static key in the extension bundle. Options: per-install token issued by the backend + quota, or a signed anonymous install ID. Turn `REQUIRE_AUTH` on in `render.yaml` | `frontend/src/config.ts`, `app/middleware/auth.py`, `render.yaml` | [ ] |
| 1.4 | Constant-time key compare (`secrets.compare_digest`); stop logging key prefixes | `app/middleware/auth.py` | [ ] |
| 1.5 | Rate limiting that works behind Render's proxy (trusted `X-Forwarded-For`) and per install token, not just IP | `app/middleware/rate_limit.py` | [ ] |
| 1.6 | Cap PDF size at about 5 MB and pages at about 10; remove the duplicate `max_text_length` / `max_file_size_mb` settings | `app/core/config.py` | [x] |
| 1.7 | Tighten manifest: drop `<all_urls>` injector, narrow `*.linkedin.com`, remove localhost host permissions from the prod build, narrow `web_accessible_resources` | `frontend/manifest.json` | [ ] |
| 1.8 | Fix `postMessage('*')` and the loose origin check | `frontend/src/components/Header.tsx`, `public/side-panel-injector.js`, `launcher-button.js` | [ ] |
| 1.9 | Privacy: consent screen on first use, privacy policy page, store resume in `chrome.storage.local` (not iframe localStorage) with a "delete my data" button | frontend | [ ] |
| 1.10 | Remove committed `__pycache__`/`.pyc`; extend `.gitignore` (`__pycache__/`, `*.pyc`, `output.json`) | repo root | [x] |
| 1.11 | Confirm no real keys are in git history (check `.env` history); rotate if any | git history | [x] |

Exit criteria: unauthenticated calls to `/api/analyze` and `/api/filter-job-description` return 401; no user data is written to disk; manifest has no `<all_urls>`.

---

## Phase 2 — Correctness and reliability of the analysis

Goal: results are either right or an honest error, never a fake zero.

| # | Task | Where | Done |
|---|------|-------|------|
| 2.1 | Make sub-analysis failures propagate (or return an explicit `status: "failed"` per section). Never return a 0 score as a normal 200 result, and never cache failed results | `resume_analysis_v4.py` (all `analyze_*_v4`, and the `except` in `analyze_resume_v4`) | [ ] |
| 2.2 | Surface partial failure to the UI ("keyword analysis unavailable, retry") | backend response schema + frontend sections | [ ] |
| 2.3 | Stop blocking the event loop: `extraction_chain.ainvoke`, PDF parsing via `run_in_threadpool` | `app/utils/openai_extraction.py`, `analyze.py` | [ ] |
| 2.4 | Bound LLM concurrency (semaphore) for the 8 parallel calls | `resume_analysis_v4.py` | [ ] |
| 2.5 | Fix retry/breaker layering: retry only transient errors (timeouts, 429, 5xx); malformed-JSON should not trip the breaker; use an async-aware breaker | `app/services/openai_model.py`, `app/resilience/circuit_breaker.py` | [ ] |
| 2.6 | Align timeouts: per-call × retries must fit inside `REQUEST_TIMEOUT`; return 504 cleanly | `config.py`, `timeout_middleware.py` | [ ] |
| 2.7 | Fix `/api/analyze-job` mismatch: delete the dead hook or add the endpoint | `frontend/src/hooks/useJobExtraction.ts` | [ ] |
| 2.8 | Handle scanned/image PDFs with a clear error (OCR later) | `text_extraction.py` | [ ] |
| 2.9 | Frontend: progress states, request timeout, retry button, readable error messages for 401/413/429/503/504 | `StartSection.tsx` | [ ] |

Exit criteria: killing the LLM key yields a clear error in the UI, not a "Low Fit 0" result; the load test of 10 concurrent requests does not hang the server.

---

## Phase 3 — Cleanup and foundations

Goal: smaller, honest, reproducible codebase with a safety net.

| # | Task | Where | Done |
|---|------|-------|------|
| 3.1 | Delete the V1–V3 analysis code and the "V3 compatibility" fields (check the frontend doesn't use them first) | `resume_structure_analysis/{analysis,resume_analysis,async_analysis,action_words,...}.py` | [ ] |
| 3.2 | Collapse the 8 repeated try/except blocks into one helper | `resume_analysis_v4.py` | [ ] |
| 3.3 | Cache: choose real Upstash/Redis or a bounded `TTLCache`; rename `redis_cache.py` accordingly; drop unused deps; fix `render.yaml` | `app/cache`, `requirements.txt`, `render.yaml` | [ ] |
| 3.4 | Pydantic v2 idioms (`field_validator`, `SettingsConfigDict`), FastAPI lifespan instead of `on_event`, remove `sys.path` hack | `config.py`, `api/main.py` | [ ] |
| 3.5 | `PyPDF2` → `pypdf` | `text_extraction.py`, `requirements.txt` | [ ] |
| 3.6 | Pin dependencies (lockfile via `uv`/`pip-tools`); decide whether to keep the LangChain dependency | `requirements.txt` | [ ] |
| 3.7 | Pick one deploy target (Render recommended) and delete the others (`vercel.json`, unused compose/bat); fix Docker worker count | repo | [ ] |
| 3.8 | Replace the keepalive cron workflow (paid tier or external monitor) | `.github/workflows/keepalive.yml` | [ ] |
| 3.9 | Tests: pytest for the PDF validator, sanitiser, score validator and the router (LLM mocked); a golden-set harness for scoring | `Backend/tests/` | [ ] |
| 3.10 | CI: lint + pytest + frontend build on every PR; Dependabot | `.github/workflows` | [ ] |
| 3.11 | Consolidate docs (8+ overlapping md files → one README + one ARCHITECTURE) | repo | [ ] |

---

## Phase 4 — Extension modernisation

Goal: maintainable build, cross-platform, store-ready.

| # | Task | Done |
|---|------|------|
| 4.1 | Real build pipeline (Vite + `@crxjs/vite-plugin` or `vite-plugin-web-extension`); remove the Windows-only `copy` postbuild; stop committing `dist/` and the duplicated `public/` copies | [ ] |
| 4.2 | Convert content/background scripts to TypeScript, bundled | [ ] |
| 4.3 | Move to `chrome.sidePanel`; delete the hand-built injector, resize code and CSS injection | [ ] |
| 4.4 | Harden LinkedIn scraping: selector fallbacks, JSON-LD fallback, tests against saved HTML fixtures | [ ] |
| 4.5 | Service worker: persist state in `chrome.storage`, no `setTimeout` retries, strip noisy logging | [ ] |
| 4.6 | Manifest: sized icons, CSP, `minimum_chrome_version`, rename the package from `vite-react-typescript-starter` | [ ] |
| 4.7 | Upgrade dependencies (React 19, Vite 6/7, Tailwind, lucide-react, ESLint) | [ ] |
| 4.8 | Frontend tests (Vitest + Testing Library) for the result views | [ ] |

---

## Phase 5 — Quality and product

| # | Task | Done |
|---|------|------|
| 5.1 | Cheaper/faster scoring: evaluate smaller model, merge the 8 prompts into 2–3, use structured output / JSON schema instead of fence stripping | [ ] |
| 5.2 | Deterministic parts of scoring (keyword/skill matching via embeddings or n-grams) so the same input gives the same score | [ ] |
| 5.3 | Golden-set regression suite run in CI against prompt/model changes | [ ] |
| 5.4 | DOCX resume support and OCR for scanned PDFs | [ ] |
| 5.5 | More job sites: Indeed, Greenhouse, Lever, Workday | [ ] |
| 5.6 | Analysis history and saved resume versions | [ ] |
| 5.7 | Observability: structured logs, error tracking (Sentry), token/cost metrics per request | [ ] |

---

## Working agreement

- One phase at a time; each task is its own small commit so it can be reverted.
- Before deleting anything in 3.1, grep the frontend for the fields it reads.
- Keep the extension and backend compatible at each step: backend changes that alter the response shape ship together with the matching frontend change.
- Update the checkboxes in this file as work lands.

## Decisions (locked)

| Area | Decision | Consequences |
|------|----------|--------------|
| Hosting | **Vercel** (serverless Python) | No shared memory between requests: in-memory cache and rate limiter are useless, so state must live in an external store. Function max duration is limited by plan, so the 8-call analysis must be fast (or `maxDuration` raised). Render config, Dockerfile, `server.py` and the keepalive cron get deleted. Cold starts replace "sleeping server". |
| LLM | **Gemini (default)** | Set `LLM_PROVIDER=gemini` as the default; use Gemini structured output (`response_schema` / JSON mode) instead of stripping code fences. Keep the provider abstraction only if cheap; otherwise call the `google-genai` SDK directly and drop LangChain. Pick the exact model (Flash-class) after a golden-set comparison. |
| Auth | **Supabase Auth with Google login** | The extension signs in via `chrome.identity.launchWebAuthFlow` against Supabase's Google OAuth. The extension sends the Supabase access token as `Authorization: Bearer`. The backend verifies the JWT (Supabase JWKS / JWT secret). No static API key exists anywhere. Per-user quotas live in a Supabase table. |
| Data store | **Supabase Postgres** (and optionally Upstash Redis) | Used for users, quotas/usage, and analysis history. Rate limiting keyed by `user_id`, not IP. Result cache is a table (or Upstash) with a TTL. |
| Monetisation | Not decided; schema leaves room (plan/tier column on the profile). | Quota check is a single function so paid tiers can plug in later. |

### Vercel-specific notes
- Entry point: a single ASGI `app` that Vercel's Python runtime can import; replace the legacy `builds` in `vercel.json` with the current config and set `maxDuration` for the analyze route.
- PDF uploads: Vercel request bodies are capped (about 4.5 MB), which fits the planned 5 MB limit only if we cap lower. Use a 4 MB cap, and show the limit in the UI.
- Secrets (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`/JWKS, `SUPABASE_SERVICE_ROLE_KEY`) go in Vercel env vars. The service-role key is backend-only and must never reach the extension.
- CORS: allow only the extension's `chrome-extension://<id>` origin(s). Publish a stable extension ID early (manifest `key`) so the origin does not change between dev and store builds.
- Extension needs the `identity` permission and the Supabase redirect URL (`https://<ext-id>.chromiumapp.org/`) added to Supabase's allowed redirects and the Google OAuth client.

## Plan changes from the decisions above

These override the matching rows earlier in this file.

| Task | Change |
|------|--------|
| 1.3 | Replaced by **Supabase Google login**: (a) Supabase project + Google OAuth client, (b) `profiles` and `usage` tables with Row Level Security, (c) backend `verify_supabase_jwt` dependency replacing `verify_api_key`, (d) extension login/logout UI and token refresh, (e) remove `VITE_API_KEY`, `REQUIRE_AUTH`, `VALID_API_KEYS`. |
| 1.4 | Obsolete (no API keys left). Replaced by JWT verification: check signature, expiry, audience, and reject unverified tokens. |
| 1.5 | Rate limit and daily/monthly quota **per user id**, stored in Supabase/Upstash, not in-process memory (slowapi memory limiter is removed). |
| 1.6 | Upload cap 4 MB (Vercel body limit), 10 pages. |
| 1.9 | Consent screen now attaches to first login; "delete my data" also deletes the user's rows in Supabase. |
| 2.6 | Timeout budget is `maxDuration` of the Vercel function; remove `TimeoutMiddleware`, the 120 s setting, and size per-call timeouts accordingly. |
| 3.3 | Cache moves to Supabase table or Upstash with TTL. Delete the fake `redis_cache.py`. |
| 3.6 | Drop `langchain-*`, `redis`, `gunicorn`, `psutil`, `slowapi` (if not needed). Add `google-genai`, `supabase`/`PyJWT`. |
| 3.7 | Target is Vercel only. Delete `render.yaml`, `Dockerfile`, `docker-compose.yml`, `server.py`, `start_server.bat`. |
| 3.8 | Delete `.github/workflows/keepalive.yml` (Vercel has no sleeping server). Cold starts are handled by keeping imports light. |
| 5.1 | Gemini structured output; merge the 8 prompts into 2–3 calls to fit the function time limit and cut cost. This moves up: do it in Phase 2 together with 2.4–2.6, because it affects whether Vercel's time limit is met. |

## Revised order within Phase 1

1. 1.1, 1.2 (small bug and data-leak fixes, no dependencies)
2. 1.6, 1.10, 1.11 (limits, repo hygiene, secrets check)
3. Supabase project setup + schema (new task **1.3a**)
4. Backend JWT verification + per-user quotas (1.3c, 1.5)
5. Extension login flow (1.3d), then manifest tightening (1.7, 1.8)
6. Consent and data deletion (1.9)
7. Vercel deployment config (new task **1.12**: working `vercel.json`/entrypoint, env vars, CORS for the extension ID)

## Resolved
- **Vercel plan: Hobby.** The function time limit is short by default, so design for a hard budget of well under 60 s (target 15-25 s): 2-3 merged Gemini calls running in parallel, `maxDuration` set explicitly on the analyze route. Verify the current Hobby limit in the Vercel dashboard before finalising. Hobby is also non-commercial per Vercel's terms, so moving to Pro is required if the product starts charging.
- **Gemini model: best free-tier Flash-class model.** Make the model name an env var (`LLM_MODEL`), default to a Flash/Flash-Lite model, and confirm the current free models and limits in Google AI Studio. Choose between them with the golden-set check (task 5.3) on a few real resumes. Caveat: Google's free tier may use submitted content to improve its products, which is a problem for resumes (personal data). Free tier is fine for development and testing with fake/own resumes; switch the key to a paid-tier project before real users, and say so in the privacy policy. Free-tier rate limits (requests per minute/day) also cap total users, so the per-user quota must stay below them.
- **Resume history: keep it local.** Store the resume PDF and past results in `chrome.storage.local` only. Supabase stores just identity, plan/quota and per-request usage (timestamp, scores, token count), never resume text or PDFs. This keeps the privacy story simple, removes a data-deletion burden and avoids Supabase storage costs. Server-side history can be added later as an opt-in feature.

## Still open
- Exact Gemini model name (pick after the golden-set check).
- Whether to move to Vercel Pro (or another host) once there are paying users.
