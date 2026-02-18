# ScrubaDub Runbook

## Local Dev

```bash
# Install deps (from repo root)
npm install

# Start frontend + Convex backend together
npm run dev

# Or start them separately
npm run dev:frontend   # Vite on http://localhost:5173
npm run dev:convex     # Convex dev server (syncs schema + functions)
```

**Required env var:** Create `packages/frontend/.env.local`:
```
VITE_CONVEX_URL=<your convex deployment URL>
```

## Build Check

```bash
cd packages/frontend && npx tsc --noEmit && npx vite build
```

## Smoke Tests (Manual)

### 1. Owner login
- Open `http://localhost:5173/login`
- Sign in with owner credentials
- Confirm: lands on owner Dashboard

### 2. Create property
- Sidebar → Properties → "Add Property"
- Fill name + address → save
- Confirm: property appears in list

### 3. Invite cleaner
- Sidebar → Employees → "Invite Cleaner"
- Enter name + email → "Generate Invite Link"
- Confirm: invite link is displayed with Copy button

### 4. Accept invite (incognito)
- Copy the invite link
- Open a **new incognito window** (logged out)
- Paste link directly in address bar
- Confirm: AcceptInvitePage loads (not login page)
- Set password → "Join Team"
- Confirm: redirected to cleaner "My Jobs" page (no full page reload)

### 5. Cleaner sees jobs
- As owner: create a job, assign it to the cleaner
- As cleaner: refresh "My Jobs"
- Confirm: job appears in Active section

## Deploy (Vercel)

### Env vars (set in Vercel project settings)
| Variable | Description |
|---|---|
| `VITE_CONVEX_URL` | Convex deployment URL (e.g. `https://your-app-123.convex.cloud`) |

### SPA routing
`vercel.json` at repo root provides the catch-all rewrite:
```json
{
  "buildCommand": "cd packages/frontend && npm run build",
  "outputDirectory": "packages/frontend/dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
This ensures direct navigation to `/invite/:token`, `/login`, `/reset-password/:token` etc. serves `index.html` so the SPA router handles them.

### Verify after deploy
- Direct-open `https://<your-domain>/invite/nonexistent` in a fresh browser
- Should show "Invalid Invite" page (not a Vercel 404)
- Direct-open `https://<your-domain>/login` — should show login form
