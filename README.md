# ScrubaDub

Cleaning operations platform built with Convex + React + Vite.

## Quick start

```bash
# Install dependencies
npm install

# Copy env file and fill in values
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

See [`.env.example`](.env.example) for required variables. Stripe and token secrets are set as Convex environment variables in the dashboard.

## CI

GitHub Actions runs on every push/PR to `main`: typecheck, test, build. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
