# Scrubadub-App Repository Audit

**Date:** 2026-02-17
**Scope:** Full repository audit — security, code quality, testing, CI/CD, architecture

---

## Executive Summary

Scrubadub is a full-stack cleaning operations management platform (React + Convex) at MVP stage. The codebase has a clean architecture and well-defined schema, but contains **critical security vulnerabilities**, **zero test coverage**, **no CI/CD pipeline**, and several code quality issues that must be addressed before production use.

| Area | Grade | Key Issues |
|------|-------|------------|
| **Security** | D | Critical password hashing flaw, missing auth on queries, unrestricted uploads |
| **Code Quality** | B+ | Excessive `any` types, large components, but clean structure overall |
| **Testing** | F | 0 test files, 0 coverage, no test framework installed |
| **CI/CD** | F | No pipelines, no linting, no pre-commit hooks |
| **Architecture** | B+ | Clean separation, good schema design, real-time via Convex |
| **Documentation** | D | No root README, no API docs, no .env.example |

---

## 1. Security Audit

### 1.1 CRITICAL — Weak Password Hashing

**Files:** `convex/auth.ts:4-19`, `convex/mutations/employees.ts:60-66`

The application uses a custom non-cryptographic hash function:

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
- Not cryptographic — trivially reversible/brute-forceable
- Password length leaked in the hash output
- No per-password salt
- No computational cost (no key stretching)
- Duplicated in `employees.ts` (invite acceptance)

**Fix:** Replace with bcrypt or argon2 via a Convex action.

---

### 1.2 HIGH — Missing Authorization on All Queries

**Files:** Every file in `convex/queries/`

All query functions accept a `companyId` argument but **never verify** that the calling user belongs to that company. This allows any authenticated user to read data from any company by guessing/enumerating IDs.

Affected queries:
| File | Functions |
|------|-----------|
| `queries/properties.ts` | `list`, `get`, `getHistory` |
| `queries/jobs.ts` | `list`, `get`, `getCalendarJobs` |
| `queries/employees.ts` | `list`, `getCleaners` |
| `queries/forms.ts` | `getByJob`, `getFormItems` |
| `queries/redFlags.ts` | `listByCompany`, `listByJob` |
| `queries/notifications.ts` | `list`, `unreadCount` |
| `queries/auditLog.ts` | `list` |
| `queries/performance.ts` | `getCleanerStats`, `getLeaderboard` |
| `queries/dashboard.ts` | `getStats` |

**Fix:** Add `requireCompanyMember()` checks (already available in `convex/lib/helpers.ts`) to every query.

---

### 1.3 HIGH — Unrestricted File Upload

**File:** `convex/mutations/storage.ts:4-9`

```typescript
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
```

- No authentication check
- No file type validation
- No file size limits

**Fix:** Add auth check, file type whitelist, and size limits.

---

### 1.4 HIGH — Weak Token Generation

**Files:** `convex/auth.ts:134-135`, `convex/mutations/employees.ts:21`

Password reset and invite tokens use predictable generation:

```typescript
const resetToken = `pr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
```

`Date.now()` is predictable and `Math.random()` is not cryptographically secure.

**Fix:** Use `crypto.getRandomValues()` for at least 128 bits of entropy.

---

### 1.5 HIGH — Invite Tokens Never Expire

**File:** `convex/mutations/employees.ts:46-90`

Invite tokens have no expiration timestamp. Once generated, they remain valid indefinitely.

**Fix:** Add an `inviteTokenExpiry` field (e.g., 7 days) and validate on acceptance.

---

### 1.6 MEDIUM — Weak Password Policy

**File:** `packages/frontend/src/pages/auth/SignupPage.tsx:19-22`

Only enforces 6-character minimum with no complexity requirements. Validation is client-side only — no server-side check.

**Fix:** Enforce 12+ characters, add complexity requirements, validate server-side.

---

### 1.7 MEDIUM — User Enumeration via Error Messages

**File:** `convex/auth.ts:67-70`

Login returns different error messages for "email not found" vs "wrong password", allowing user enumeration.

**Fix:** Return a generic "Invalid credentials" for all auth failures.

---

### 1.8 MEDIUM — No Input Length Validation

**Files:** `convex/mutations/jobs.ts`, `convex/mutations/redFlags.ts`, `convex/mutations/forms.ts`

All text fields (`notes`, `note`, etc.) accept `v.string()` with no length limit, enabling storage abuse or DoS.

**Fix:** Add `.max()` constraints to string validators.

---

### 1.9 LOW — No Rate Limiting

No rate limiting on password reset, login attempts, or invite acceptance endpoints.

### 1.10 LOW — No Content Security Policy

No CSP headers configured on the frontend.

---

## 2. Code Quality Audit

### 2.1 Excessive `any` Types (15+ occurrences)

| File | Line(s) | Context |
|------|---------|---------|
| `convex/mutations/forms.ts` | 46 | `requireEditable(ctx: any, formId: any)` |
| `convex/mutations/jobs.ts` | 88 | `Record<string, any>` |
| `convex/mutations/redFlags.ts` | 78 | `Record<string, any>` |
| `packages/frontend/src/pages/owner/PropertyDetailPage.tsx` | 109, 284, 309 | Component props typed as `any` |
| `packages/frontend/src/pages/owner/JobListPage.tsx` | 103 | `job.cleaners as any[]` |
| `packages/frontend/src/pages/owner/JobDetailPage.tsx` | 96 | `job.cleaners as any[]` |
| `packages/frontend/src/pages/owner/CalendarPage.tsx` | 294, 411, 438, 488 | Multiple `any` casts |
| `packages/frontend/src/pages/cleaner/CleaningFormPage.tsx` | 357-358 | `as any` casts |
| `packages/frontend/src/pages/owner/JobFormPage.tsx` | — | `type as any` |
| `packages/frontend/src/pages/owner/PropertyFormPage.tsx` | — | `type as any` |

**Fix:** Create proper TypeScript interfaces for Cleaner, Job-with-cleaners, Timeline items, and form categories.

---

### 2.2 Large Components

| File | Lines | Recommendation |
|------|-------|----------------|
| `CleaningFormPage.tsx` | 779 | Extract SignatureCanvas, FormItemList, MilestoneToast |
| `CalendarPage.tsx` | 508 | Extract MonthView, WeekView, DayView into separate files |
| `PropertyDetailPage.tsx` | 349 | Type the internal component props properly |

---

### 2.3 N+1 Query Pattern

**File:** `convex/queries/performance.ts:71-78`

```typescript
for (const jobId of allCleanerJobIds) {
  const flags = await ctx.db.query("redFlags")
    .withIndex("by_jobId", (q) => q.eq("jobId", jobId)).collect();
  redFlagsReported += flags.length;
}
```

Makes one DB call per job. For a cleaner with 100 jobs, this is 100 sequential queries.

**Fix:** Batch the query or filter in memory after a single broader fetch.

---

### 2.4 Duplicated Update Logic

Three mutations repeat the same "filter undefined values" pattern:
- `convex/mutations/jobs.ts:86-91`
- `convex/mutations/forms.ts:71-74`
- `convex/mutations/redFlags.ts:78-79`

**Fix:** Extract a shared `cleanPatch()` helper in `convex/lib/helpers.ts`.

---

### 2.5 Console Error in Production

**File:** `packages/frontend/src/pages/cleaner/CleaningFormPage.tsx:374`

```typescript
} catch (err) {
  console.error(err);  // No user feedback
}
```

**Fix:** Replace with user-facing error notification.

---

### 2.6 No Linting or Formatting Tools

- No ESLint configuration
- No Prettier configuration
- `noUnusedLocals` and `noUnusedParameters` disabled in frontend tsconfig

**Fix:** Add ESLint with `@typescript-eslint`, Prettier, and enable unused-variable checks.

---

## 3. Testing Audit

### Result: Zero Test Coverage

| Metric | Value |
|--------|-------|
| Test files | 0 |
| Test framework | None installed |
| Unit tests | None |
| Integration tests | None |
| E2E tests | None |
| Coverage tool | None |
| Test script in package.json | None |

**Recommended test stack:**
- **Unit/Integration:** Vitest (pairs with Vite)
- **Component:** React Testing Library
- **E2E:** Playwright or Cypress
- **Convex:** Convex test helpers for backend function testing

---

## 4. CI/CD & Infrastructure Audit

### Result: No Pipeline Exists

| Item | Status |
|------|--------|
| GitHub Actions | Not configured |
| Pre-commit hooks | Not configured |
| Docker | Not configured |
| Deployment scripts | None |
| `.env.example` | Missing |
| Root README | Missing |
| CONTRIBUTING guide | Missing |
| CHANGELOG | Missing |

### Package Scripts — Missing Essentials

Current scripts:
```
dev, dev:frontend, dev:convex, build, preview
```

Missing:
```
test, lint, format, type-check, clean, prepare (husky)
```

### .gitignore — Incomplete

Current entries cover basics (`node_modules/`, `dist/`, `.env`, `.env.local`, `.DS_Store`, `*.log`) but miss:
- `.env.*.local`
- IDE directories (`.vscode/`, `.idea/`)
- Coverage reports (`coverage/`)
- OS files (`Thumbs.db`)

---

## 5. Priority Action Items

### Critical (fix before any production use)
1. Replace custom password hashing with bcrypt/argon2
2. Add authorization checks to all query functions
3. Add authentication to file upload endpoint

### High
4. Use cryptographically secure token generation
5. Add token expiration to invite and reset flows
6. Add a test framework and write tests for auth, mutations, and core flows
7. Set up CI/CD pipeline (GitHub Actions)
8. Add ESLint + Prettier

### Medium
9. Create proper TypeScript types to replace `any` usage
10. Fix N+1 query in performance stats
11. Add input length validation on all text fields
12. Strengthen password policy (12+ chars, server-side validation)
13. Return generic error messages for auth failures
14. Break down large components (CleaningFormPage, CalendarPage)

### Low
15. Add root README with setup instructions
16. Create `.env.example` template
17. Add pre-commit hooks (Husky + lint-staged)
18. Expand `.gitignore`
19. Add rate limiting on auth endpoints
20. Add Content Security Policy headers
