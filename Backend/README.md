# IntrvuFit backend

FastAPI service for the IntrvuFit Chrome extension. Deployed on Vercel (Python runtime).

## How an analysis works

1. The extension sends the PDF and the job posting with a Supabase access token (`Authorization: Bearer`).
2. The token is verified (JWKS, or HS256 for legacy projects) and one unit of the user's daily quota is taken atomically in Postgres.
3. Two Gemini calls run in parallel with structured output: one extracts job-fit evidence, one extracts resume-quality evidence. **The model never returns scores.**
4. `app/scoring.py` computes every score from that evidence using the V4 rules in `docs/scoring-spec-v4.md`, so identical evidence always gives an identical score.
5. If either call fails the request returns an error and the quota unit is refunded. A fake zero score is never returned.

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | no | |
| GET | `/api/v1/usage` | yes | `{used, limit, remaining}` for today |
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

## Deploy (Vercel)

1. Create the Supabase project, enable the Google provider, and run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Import the repo in Vercel with **Root Directory = `Backend`**.
3. Set the environment variables from `.env.example` (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CHROME_EXTENSION_IDS`, `ENVIRONMENT=production`).
4. `vercel.json` sets `maxDuration` to 60 s. Check your plan's limit.

`ENVIRONMENT=production` refuses to start with `AUTH_REQUIRED=false` and hides `/docs`.

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
api/index.py     Vercel entrypoint
```
