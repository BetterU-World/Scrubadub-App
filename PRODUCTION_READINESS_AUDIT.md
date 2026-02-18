# DAY 1 PRODUCTION READINESS AUDIT

**Date:** 2026-02-18
**Application:** Scrubadub — SaaS Cleaning Operations Platform
**Stack:** React (Vite) + Convex BaaS
**Auditor:** Claude (Automated)

---

## SECTION RESULTS

| Section | Status |
|---|---|
| 1. Environment | PASS (conditional) |
| 2. Auth | FAIL |
| 3. Multi-Tenant Security | FAIL (CRITICAL) |
| 4. Core Data Integrity | FAIL |
| 5. Logging | PASS (partial) |
| 6. Deployment Safety | FAIL |

## OVERALL STATUS: BLOCKED — FIX REQUIRED

---

## TOP 3 HIGHEST RISK ISSUES

### 1. CRITICAL: Server-Side Authentication Is Non-Functional

**Risk Level:** CRITICAL
**Files:** `convex/lib/helpers.ts`, `packages/frontend/src/main.tsx`

**What failed:**
The backend auth helpers (`requireAuth`, `requireOwner`, `requireCompanyMember`) all call `ctx.auth.getUserIdentity()`, which requires Convex Auth integration. However, the frontend uses `ConvexProvider` (not `ConvexProviderWithAuth`) and does NOT pass any auth token to the Convex client. This means `ctx.auth.getUserIdentity()` always returns `null`.

**Impact:**
- ALL mutations calling `requireAuth`/`requireOwner` will throw "Not authenticated" — meaning core owner operations (create jobs, create properties, invite employees, approve jobs, etc.) are **non-functional**.
- Alternatively, if the app somehow functions, it means these guards are being bypassed, which means there is **zero server-side authentication**.

**Affected mutations (all broken or unprotected):**
- `mutations/jobs.ts` — create, update, cancel, confirmJob, denyJob, startJob, approveJob, requestRework
- `mutations/employees.ts` — inviteCleaner, updateEmployeeStatus
- `mutations/properties.ts` — create, update, toggleActive
- `mutations/forms.ts` — submit
- `mutations/redFlags.ts` — create, updateStatus, createMaintenanceJob

**Fix:**
Either:
- (A) Integrate Convex Auth properly with the frontend (use `ConvexProviderWithAuth` with a supported auth provider), OR
- (B) Replace the `ctx.auth.getUserIdentity()` pattern with a custom session validation approach that validates the userId passed from the client against a server-side session token.

**Safe to auto-fix:** No. Requires architectural decision on auth strategy.

---

### 2. CRITICAL: All Queries Have Zero Access Control (Client-Trust Pattern)

**Risk Level:** CRITICAL
**Files:** All files in `convex/queries/`

**What failed:**
Every query function accepts a `companyId` argument from the client and trusts it blindly. There is NO server-side verification that the requesting user belongs to that company. Any authenticated (or unauthenticated) client can query any company's data by supplying a different `companyId`.

**Specific unprotected queries:**
| Query | File | Risk |
|---|---|---|
| `jobs.list` | `convex/queries/jobs.ts:4` | Any company's jobs accessible |
| `jobs.get` | `convex/queries/jobs.ts:47` | Any job accessible by ID |
| `jobs.getForCleaner` | `convex/queries/jobs.ts:81` | Any cleaner's jobs accessible |
| `employees.list` | `convex/queries/employees.ts:4` | Any company's employee list |
| `properties.list` | `convex/queries/properties.ts:4` | Any company's properties |
| `properties.get` | `convex/queries/properties.ts:14` | Any property by ID |
| `properties.getHistory` | `convex/queries/properties.ts:21` | Full property history by ID |
| `dashboard.getStats` | `convex/queries/dashboard.ts:4` | Any company's dashboard data |
| `forms.getByJob` | `convex/queries/forms.ts:4` | Any form by job ID |
| `forms.getItems` | `convex/queries/forms.ts:14` | Any form's items |
| `redFlags.listByCompany` | `convex/queries/redFlags.ts:4` | Any company's red flags |
| `redFlags.listByJob` | `convex/queries/redFlags.ts:41` | Any job's red flags |
| `performance.*` | `convex/queries/performance.ts` | Any company's performance data |
| `auditLog.list` | `convex/queries/auditLog.ts:4` | Any company's audit logs |
| `notifications.list` | `convex/queries/notifications.ts:4` | Any user's notifications |
| `storage.getUrl` | `convex/queries/storage.ts:4` | Any stored file |

**Fix:**
Every query must validate the requesting user's identity and verify their `companyId` matches the requested data. This requires fixing Issue #1 (auth) first, then adding `requireAuth()` or `requireCompanyMember()` calls to every query.

**Safe to auto-fix:** No. Requires auth to be functional first.

---

### 3. CRITICAL: Password Hashing Is Not Production-Ready

**Risk Level:** HIGH
**File:** `convex/auth.ts:6-15`

**What failed:**
The password hashing function uses a simple djb2-like bitwise hash with NO salt, NO key stretching, NO iterations:

```typescript
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sh_${Math.abs(hash).toString(36)}_${password.length}`;
}
```

**Problems:**
- Hash collisions are trivially likely (32-bit integer space)
- Hash includes password length, aiding brute force
- No salt — identical passwords produce identical hashes
- No bcrypt/scrypt/argon2 — instantly reversible with a lookup table
- The hash is also duplicated in `mutations/employees.ts:60-66` (acceptInvite)

**Fix:**
Replace with bcrypt via a Convex action (since bcrypt requires Node.js crypto, it must run in an action, not a mutation). Use `bcrypt.hash(password, 12)` for hashing and `bcrypt.compare()` for verification.

**Safe to auto-fix:** No. Requires migrating existing password hashes (breaking change for existing users).

---

## DETAILED SECTION AUDITS

---

## SECTION 1 — Production Environment Verification

| Check | Status | Details |
|---|---|---|
| Production database connected | PASS | Convex is a managed BaaS — the deployment URL (`VITE_CONVEX_URL`) determines prod vs dev. No hardcoded localhost URLs. |
| Env vars loaded correctly | PASS | Two env vars: `VITE_CONVEX_URL` (frontend), `CONVEX_SITE_URL` (backend). Both injected at build/deploy time. |
| No fallback to dev values | PASS | No patterns like `process.env.X \|\| "http://localhost"` found. Missing env vars cause a hard crash, not silent fallback. |
| Build pipeline uses prod config | PASS (conditional) | No CI/CD config exists (no GitHub Actions, no Vercel config, no Dockerfile). Convex deploy is via `npx convex deploy`. Frontend build is `tsc && vite build`. No dev-mode flags in build config. |

**Note:** No `.env.example` file exists to document required env vars. Recommended to add one.

---

## SECTION 2 — Authentication Production Stability

| Check | Status | Details |
|---|---|---|
| Users can sign up | PASS | `convex/auth.ts:21` — signUp mutation creates company + owner user atomically. Email uniqueness enforced. |
| Users can log in | PASS | `convex/auth.ts:57` — signIn validates email/password. Checks for inactive accounts. |
| Session persists across refresh | PASS | `useAuth.ts:19-26` — userId stored in localStorage (`scrubadub_auth`). On refresh, `getCurrentUser` query re-validates. |
| Logout works | PASS | `useAuth.ts:72-75` — removes from localStorage, sets state to null. |
| Auth state syncs across app | PASS (minor concern) | `useAuth` is a hook (not Context). Multiple instances sync via localStorage + Convex query cache. A Context provider would be cleaner. |
| Protected routes block unauthenticated users | PASS | `App.tsx:42-57` — unauthenticated users see only auth routes. All other paths redirect to `/login`. |
| Role protection (owner vs cleaner) | PASS (client-side only) | `App.tsx:60-91` — routes rendered by role. But server-side role enforcement via `requireOwner()` is broken (see Issue #1). |

**Additional Auth Failures:**

| Issue | Severity | File | Details |
|---|---|---|---|
| No server-side session validation | CRITICAL | `useAuth.ts` | userId stored in localStorage with no server-side session token. A user can forge any userId to impersonate any account. |
| Password reset token exposed | HIGH | `convex/auth.ts:142`, `ForgotPasswordPage.tsx:24-25` | `requestPasswordReset` returns the token to the client. Frontend displays it in the UI. Anyone can reset anyone's password by requesting a reset and using the returned token. |
| Duplicate hash function | LOW | `mutations/employees.ts:60-66` | Password hashing logic is copy-pasted in `acceptInvite` instead of importing from `auth.ts`. |

---

## SECTION 3 — Multi-Tenant Security (CRITICAL)

| Check | Status | Risk Level | Details |
|---|---|---|---|
| Users cannot access other companies' data | FAIL | CRITICAL | All queries accept client-supplied `companyId` with no server-side validation of membership. |
| Queries scoped by companyId | PARTIAL | HIGH | Queries DO filter by companyId, but the companyId comes from the client and is NOT validated. |
| Mutations validate company ownership | FAIL | CRITICAL | Mutations call `requireOwner()` which is broken (ctx.auth returns null). |
| No client-trust-only security | FAIL | CRITICAL | The entire security model is client-trust. companyId and userId are passed from the client with no server verification. |
| Backend enforces tenant isolation | FAIL | CRITICAL | Backend cannot enforce isolation because server-side auth is non-functional. |

**Unprotected mutations (no auth check at all):**
- `mutations/forms.ts` — createFromTemplate, updateItem, updateScore, updateFinalPass, saveSignature
- `mutations/notifications.ts` — markAsRead, markAllAsRead
- `mutations/storage.ts` — generateUploadUrl, getUrl

These mutations can be called by anyone with any parameters.

---

## SECTION 4 — Core Data Flow Integrity

| Check | Status | Details |
|---|---|---|
| Company creation persists | PASS | `auth.ts:38-41` — created atomically with owner user in signUp. |
| Employee creation persists | CONDITIONAL | `employees.ts:inviteCleaner` — would work if `requireOwner()` doesn't throw. |
| Property creation persists | CONDITIONAL | `properties.ts:create` — same auth dependency. |
| Job creation persists | CONDITIONAL | `jobs.ts:create` — same auth dependency. |
| Gold Standard form submissions | PARTIAL | Form creation and item updates work (no auth check). Form submission (`forms.ts:submit`) calls `requireAuth()` — may be broken. |
| No duplicate records on retry | PARTIAL FAIL | `forms.createFromTemplate` has idempotency guard (`if (existing) return existing._id`). Other create mutations (jobs, properties) have NO duplicate guards — double-click or network retry creates duplicates. |
| No silent failures | PARTIAL FAIL | `CleaningFormPage.tsx:374` — form submit error is caught and logged to `console.error(err)` but NOT displayed to the user. The user sees no feedback on failure. |

---

## SECTION 5 — Production Logging + Error Visibility

| Check | Status | Details |
|---|---|---|
| Server errors are logged | PASS | Convex platform logs all function executions and errors. |
| Critical failures not swallowed | PARTIAL FAIL | `CleaningFormPage.tsx:374` — submit error swallowed (only `console.error`). All other errors propagate correctly. |
| API errors return safe messages | PASS | Error messages are safe strings ("Not authenticated", "Job not found", etc.). No stack traces or internal details exposed. |
| Monitoring shows backend failures | PASS | Convex Dashboard provides real-time function logs and error monitoring. |

---

## SECTION 6 — Deployment Safety

| Check | Status | Details |
|---|---|---|
| No dev-only flags enabled | PASS | No `isDev`, `DEBUG`, `NODE_ENV` checks in application code. |
| No debug auth bypasses | PASS | No bypass patterns found. |
| No test payment bypasses | PASS (N/A) | No payment/billing code exists. |
| No mock data forced in production | PASS | No mock data or seed scripts found. |
| Password reset token in UI | FAIL | `ForgotPasswordPage.tsx:59-68` — displays reset token in UI with "MVP" label. Must be removed for production. Backend must stop returning token in response. |

---

## COMPLETE ISSUE REGISTRY

| # | Severity | Issue | File(s) | Auto-fixable |
|---|---|---|---|---|
| 1 | CRITICAL | Server-side auth non-functional (ctx.auth returns null) | `convex/lib/helpers.ts`, `main.tsx` | No |
| 2 | CRITICAL | All queries have zero access control | `convex/queries/*` | No (requires #1) |
| 3 | CRITICAL | Client-trust security pattern (userId/companyId from client) | `useAuth.ts`, all queries/mutations | No |
| 4 | HIGH | Password hashing uses non-cryptographic hash | `convex/auth.ts:6-15` | No |
| 5 | HIGH | Password reset token returned to client and displayed in UI | `convex/auth.ts:142`, `ForgotPasswordPage.tsx:24` | Yes |
| 6 | HIGH | Several mutations have NO auth checks | `mutations/forms.ts`, `mutations/notifications.ts`, `mutations/storage.ts` | No (requires #1) |
| 7 | MEDIUM | Form submit error silently swallowed | `CleaningFormPage.tsx:374` | Yes |
| 8 | MEDIUM | No duplicate guards on create mutations | `mutations/jobs.ts`, `mutations/properties.ts` | No |
| 9 | MEDIUM | Duplicate password hash implementation | `mutations/employees.ts:60-66` | Yes |
| 10 | LOW | No .env.example for env var documentation | (missing file) | Yes |
| 11 | LOW | useAuth is a hook not Context (multiple instances) | `hooks/useAuth.ts` | No |

---

## AUTO-FIXABLE ITEMS

### Fix #5: Remove password reset token from API response and UI

**File:** `convex/auth.ts:142`
**Change:** `return { success: true, token: resetToken }` -> `return { success: true }`
**File:** `packages/frontend/src/pages/auth/ForgotPasswordPage.tsx:24-25,59-68`
**Change:** Remove `resetLink` state and the MVP reset link display block.

### Fix #7: Show form submit error to user

**File:** `packages/frontend/src/pages/cleaner/CleaningFormPage.tsx:373-374`
**Change:** Add error state and display to user instead of only `console.error`.

### Fix #9: Extract shared hash function

**File:** `convex/mutations/employees.ts:60-66`
**Change:** Import `simpleHash` from `auth.ts` instead of duplicating.

---

## RECOMMENDED FIX PRIORITY ORDER

1. **Fix server-side auth** — Integrate Convex Auth properly OR implement custom session tokens. This unblocks everything.
2. **Add auth checks to all queries** — Every query must verify the user's identity and company membership.
3. **Add auth checks to unprotected mutations** — forms, notifications, storage mutations.
4. **Replace password hashing** — Use bcrypt via Convex action.
5. **Remove password reset token exposure** — Stop returning token to client.
6. **Add error display for form submission** — Show user-facing error messages.
7. **Add idempotency guards** — Prevent duplicate creates on retry.

---

*This audit covers code-level readiness only. Infrastructure, DNS, SSL, CDN, and monitoring configuration are outside the scope of this review.*
