# ScrubaDub

Cleaning operations platform built with Convex + React + Vite.

## Quick start

```bash
# Install dependencies
npm install

# Copy env file and fill in the local frontend values
cp .env.example .env.local

# Run Convex backend + frontend dev server
npm run dev
```

## Project structure

```
packages/frontend/   React SPA (Vite + Tailwind)
convex/              Convex backend (queries, mutations, actions, schema)
  lib/               Shared helpers (auth, validation, tokens, passwords)
  mutations/         Write operations
  queries/           Read operations
  _generated/        Auto-generated Convex types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Convex + frontend dev servers |
| `npm run dev:frontend` | Frontend only |
| `npm run dev:convex` | Convex only |
| `npx vitest run` | Run unit tests |
| `npm run build -w packages/frontend` | Production build |

## Environment variables

Vite reads the repository-root `.env.local`. `CONVEX_DEPLOYMENT` selects the
deployment used by the Convex CLI, while `VITE_CONVEX_URL` independently selects
the deployment used by the browser. Verify that both identify the same
non-production deployment before starting local QA.

Set these core server variables in the Convex development deployment dashboard:

- `TOKEN_PEPPER`: a unique random development value; never copy production.
- `APP_URL`: normally `http://localhost:5173` for local development.
- `SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS=true`: blocks email, Stripe, Stripe
  webhooks, private Vercel Blob reads, and external calendar fetches. The explicit
  kill switch takes precedence even when `APP_URL` is a non-local preview URL.

Stripe, Resend, and Vercel Blob variables are optional integrations and are
validated only when their actions run. Login and core CRUD do not require them.
Do not copy production Resend, Blob, or token-pepper values into development.
See [`.env.example`](.env.example) for the full variable inventory.

Before local QA, confirm the yellow `DEV` marker shows the expected Convex
hostname. If it does not, stop before creating or changing data.

## CI

GitHub Actions runs on every push/PR to `main`: typecheck, test, build. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
