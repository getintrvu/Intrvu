# IntrvuFit extension

Chrome extension (Manifest V3) that compares your resume with the LinkedIn job you are viewing. React + TypeScript + Tailwind, built with Vite.

## How it fits together

- **`src/extension/content.ts`**: the one content script, injected on LinkedIn job pages. It extracts the job posting (`jobExtractor.ts`), writes it to `chrome.storage.local`, shows the floating **Analyze** button (`launcher.ts`) and hosts the side panel (`panel.ts`), an iframe of the React UI.
- **`src/extension/background.ts`**: service worker. Tells the page when LinkedIn navigates (single-page app), handles the toolbar click, and injects the content script into tabs that were already open at install time.
- **`src/` (React app)**: the panel UI. Signs in with Google through Supabase (`src/auth`, `src/lib/supabase.ts`), calls the backend (`src/api/client.ts`) and renders the results.
- The panel and the page only talk through `chrome.storage` and one validated `postMessage` (close button). Nothing is broadcast to the LinkedIn page.

## Setup

```bash
npm install
cp .env.example .env     # fill in the three VITE_ values
npm run build            # type-checks, builds the UI, bundles the content script and worker into dist/
```

Load it: `chrome://extensions` -> Developer mode -> **Load unpacked** -> select `dist/`.

| Command | What it does |
|---|---|
| `npm run build` | production build into `dist/` (works on Windows, macOS and Linux) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm test` | Vitest (extractor against a saved LinkedIn page, API client, resume storage, score labels) |
| `npm run dev` | UI in a normal browser tab (sign-in and tab APIs need the real extension) |

## Configuration

`.env` values are public (they are baked into the bundle). Never put a secret in them.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | backend URL; its origin is added to the manifest `host_permissions` at build time |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project URL and the public anon key |
| `EXTENSION_PUBLIC_KEY` | optional but strongly recommended: pins the extension id |

### Pin the extension id (do this once)

The OAuth redirect URL and the backend CORS origin both contain the extension id, so it must not change between builds.

```bash
node scripts/generate-extension-key.mjs
```

It writes `key.pem` (keep it private and backed up), and prints the `EXTENSION_PUBLIC_KEY` for `.env`, the id, the redirect URL for Supabase, and the value for the backend's `CHROME_EXTENSION_IDS`.

### Google sign-in

1. Google Cloud Console -> OAuth client (type: Web application). Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase -> Authentication -> Providers -> Google: paste the client id and secret.
3. Supabase -> Authentication -> URL configuration -> Redirect URLs: add `https://<extension-id>.chromiumapp.org/`.

## Privacy

The resume PDF and the last 20 finished analyses are kept in `chrome.storage.local` on the user's device (so the same resume and job always show the same result without using quota); both are cleared on sign-out. The PDF and is sent to the backend only when **Analyze** is clicked. "Delete my IntrvuFit data" in the user menu deletes IntrvuFit's server-side data for the user and clears local data. The Supabase account itself is shared with other products and is not deleted.
