# IntrvuFit

A Chrome extension that compares your resume with the LinkedIn job you are looking at and returns a **Job Fit score**, a **Resume Quality tier**, and concrete suggestions.

```
Chrome extension (React, MV3)  --Bearer token-->  FastAPI on Vercel  -->  Gemini (evidence extraction)
        |                                              |
        +-- Google sign-in via Supabase Auth           +-- Supabase Postgres (per-user daily quota)
```

- **frontend/**: the extension. See [frontend/README.md](frontend/README.md).
- **Backend/**: the API. See [Backend/README.md](Backend/README.md).
- **docs/scoring-spec-v4.md**: the scoring rules the backend implements.
- **IMPROVEMENT_PLAN.md**: what has been rebuilt and what is next.

## Key design decisions

- **The model never scores.** Gemini only extracts evidence (matched keywords, roles, bullets, sections). Python computes every score from the V4 rules, so the same evidence always gives the same score and results are explainable.
- **Two LLM calls, not nine**, run in parallel, which keeps an analysis well inside serverless time limits.
- **No fake results.** If the model fails, the user gets an error and the quota is refunded; a zero score is never returned as if it were real.
- **No static API key.** The extension signs users in with Google (Supabase); the backend verifies the token and enforces a per-user daily quota.
- **Privacy.** Resumes are processed in memory and never stored server-side. The saved PDF lives only in the user's browser.

## Getting started

1. Create a Supabase project, enable the Google provider, and run `Backend/supabase/migrations/0001_init.sql`.
2. Generate a stable extension id (`node frontend/scripts/generate-extension-key.mjs`) and add its redirect URL to Supabase.
3. Deploy `Backend/` to Vercel (Root Directory `Backend`) with the environment variables from `Backend/.env.example`.
4. Fill `frontend/.env`, run `npm run build`, and load `frontend/dist` as an unpacked extension.

CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend lint, tests and build on every push and pull request.

## License

See [LICENSE](LICENSE).
