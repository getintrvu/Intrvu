# IntrvuFit backend

FastAPI service for the IntrvuFit Chrome extension. Deployed on Vercel (Python runtime).

## How an analysis works

1. The extension sends the PDF and the job posting with a Supabase access token (`Authorization: Bearer`).
2. The token is verified (JWKS, or HS256 for legacy projects) and one unit of the user's daily quota is taken atomically in Postgres.
3. Two Gemini calls run in parallel with structured output: one extracts job-fit evidence, one extracts resume-quality evidence. **The model never returns scores.**
4. `app/scoring.py` computes every score from that evidence using the V4 rules in `docs/scoring-spec-v4.md`, so identical evidence always gives an identical score.
5. If either call fails the request returns an error and the quota unit is refunded. A fake zero score is never returned.

## Bring your own key

A user can use their own Gemini or OpenAI key instead of the server's. The extension keeps the key in the browser and sends it with each request in the `X-LLM-Provider`, `X-LLM-Key` and optional `X-LLM-Model` headers. It is used for that request only: it is never stored, and is scrubbed from logs (`app/llm/redact.py`). Users on their own key skip the daily quota, because it exists to cap our own AI spend.

- `POST /api/v1/key/check` verifies a key with one tiny request.
- Error codes: `llm_key_rejected` (the provider refused the key), `llm_key_quota` (no credit or rate limited), `llm_model_not_found`, `invalid_llm_key`, `invalid_llm_provider`, `invalid_llm_model`.
- `OPENAI_MODEL` is the default model for OpenAI keys (override per user in the settings).
- Live checks against the real APIs: `python -m pytest -m live tests/live/test_byok_live.py`.

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | no | |
| GET | `/api/v1/usage` | yes | `{used, limit, remaining}` for today |
| DELETE | `/api/v1/me/data` | yes | deletes IntrvuFit's data for the caller (usage rows). The shared Supabase account is kept |
| POST | `/api/v1/key/check` | yes | verifies the key in the `X-LLM-*` headers |
| POST | `/api/v1/analyze` | yes | multipart: `resume` (PDF, max 4 MB) and `jobData` (JSON string: `jobTitle`, `company`, `description` >= 100 chars) |

Errors always look like `{"error": {"code": "...", "message": "..."}}`. Codes: `unauthorized`, `invalid_pdf`, `encrypted_pdf`, `no_text_in_pdf`, `file_too_large`, `invalid_job_data`, `quota_exceeded`, `llm_busy`, `analysis_failed`, `service_unavailable`, `internal_error`.

## Local development

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt   # Windows; use .venv/bin/pip elsewhere
cp .env.example .env                                  # then fill it in; AUTH_REQUIRED=false skips Supabase
.venv/Scripts/uvicorn app.main:app --reload
.venv/Scripts/python -m pytest
```

The tests use fakes for Gemini and Supabase and need no keys or network.

## Choosing a model

Google retires models for new users without much notice (`gemini-2.5-flash` returned a 404 for a new key). List what your key can use, and set `LLM_MODEL` / `LLM_FALLBACK_MODEL` accordingly:

```bash
.venv/Scripts/python -c "from google import genai; from dotenv import dotenv_values; c = genai.Client(api_key=dotenv_values('.env')['GEMINI_API_KEY']); print(sorted(m.name for m in c.models.list() if 'generateContent' in (m.supported_actions or [])))"
```

The last retry uses the fallback model, and so does a 404 on the primary, so one retired model does not take the service down. Measured with a real resume: `gemini-3.5-flash-lite` runs both calls in about 3 s.

## Deploy (Vercel)

Vercel finds the FastAPI app by itself: `app/main.py` exports `app`, `requirements.txt` lists the runtime
dependencies, and `.python-version` pins Python 3.12. `vercel.json` only sets `maxDuration` (60 s; the
Hobby maximum is 300 s) and keeps tests and migrations out of the bundle. Request bodies are limited to
4.5 MB by Vercel, which is why uploads are capped at 4 MB.

1. **Supabase:** the project is already set up (migration `supabase/migrations/0001_init.sql`, Google provider on).
2. **Import the repo** in Vercel, with **Root Directory = `Backend`**. The framework is detected as FastAPI;
   leave the build and install commands empty.
3. **Environment variables** (Project Settings -> Environment Variables, for Production):

   | Variable | Value |
   |---|---|
   | `ENVIRONMENT` | `production` |
   | `GEMINI_API_KEY` | your key. Use a paid-tier project for real users: Google may use free-tier content to improve its products |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret, backend only |
   | `CHROME_EXTENSION_IDS` | the pinned extension id, so CORS allows the extension |
   | `LLM_MODEL`, `LLM_FALLBACK_MODEL`, `OPENAI_MODEL`, `DAILY_QUOTA` | optional (defaults in `.env.example`) |

   Do not set `AUTH_REQUIRED=false`: production refuses to start with it. `SUPABASE_JWT_SECRET` is not needed.
4. **Deploy**, then copy the **production** URL (not a preview URL: previews can sit behind Vercel's deployment
   protection and answer the extension with a login page).
5. **Check it:**
   ```bash
   python scripts/smoke_test.py https://<your-project>.vercel.app chrome-extension://<extension-id>
   ```
6. **Point the extension at it:** set `VITE_API_BASE_URL=https://<your-project>.vercel.app` (no trailing slash) in
   `frontend/.env`, run `npm run build`, and reload the extension. The API origin is added to the manifest
   automatically.

Optional: Vercel runs the function in `iad1` (Washington) by default. The Supabase project is in `us-west-2`,
so `"regions": ["pdx1"]` in `vercel.json` puts them side by side; the effect is small next to the AI calls.

`ENVIRONMENT=production` hides `/docs`.

## Layout

```
app/main.py      app factory, CORS, error handlers
app/routes.py    endpoints
app/auth.py      Supabase JWT verification
app/quota.py     per-user daily quota (Supabase RPC)
app/pdf.py       PDF validation and text extraction
app/analysis.py  runs the two extractions and assembles the response
app/llm/         Gemini client, prompts, extraction schemas
app/scoring.py   deterministic scoring
scripts/smoke_test.py   post-deploy checks (no keys needed)
```
