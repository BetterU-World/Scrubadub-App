# Staff session recovery, phase 1

## Confirmed causes

Each `useAuth()` used to own a credential snapshot while other query callers read
storage afresh. Signup could authenticate its page without updating App. A stale
null hydration result could unconditionally delete a newer credential. Protected
query errors could reach a generic error screen; App's billing hook was above its
own boundary. None of these findings required relaxing backend verification.

## Architecture and behavior

- `lib/staffSession.ts` is the single credential store. `useStaffSession` uses React's
  built-in `useSyncExternalStore`; no state-management dependency was added.
- Keep the existing storage key and session format. Initialize from storage once;
  ordinary renders and compatibility accessor calls use the cached snapshot. Same-tab
  writers publish immediately. Storage events, page restoration, and subscriptions
  after an unmount reconcile cross-tab changes. Delayed event values are not trusted.
- A monotonically increasing revision identifies each snapshot. Login, signup,
  invitation acceptance (Worker/Manager), and post-checkout setup install credentials
  only if no newer session change occurred while their action was in flight.
- Null staff hydration and explicit verified-session errors invalidate only the
  credential actually rejected, checking both memory and persisted storage. An older
  result cannot delete a newer login. A memory-only fallback is available when storage
  writes fail, but it cannot provide persistence through a full page reload.
- `StaffSessionRecovery` sits above App. Its boundary belongs to one staff session
  revision; invalidation unmounts subscriptions using that credential, resets the
  staff subtree, and navigates once to `/login` using replacement history. Existing
  sign-in, signup, invitation, reset-password, and setup routes remain usable.
- The inner staff error boundary forwards the exact session rejection to recovery
  without reporting it as an unrelated Sentry exception. Other errors retain the
  normal error UI and do not clear valid credentials.
- Logout clears local shared state immediately and revokes only its captured server
  session. Navigation is handled centrally rather than requiring a reload.
- Client routes are excluded from staff recovery and staff billing subscriptions.
  Staff changes do not remount client content. Client credentials and recovery
  behavior are unchanged and remain separate work.

## Security and compatibility

No runtime Convex function, authorization rule, tenant boundary, entitlement,
revocation behavior, password-reset invalidation, expiry limit, or billing rule was
changed. No heartbeat or automatic session renewal was added. Invalidity is handled
when the backend reports it; this PR does not introduce a new expiry timer.

This is a frontend release compatible with the current verified-session API. There
is no backend deployment prerequisite or session migration. Valid stored sessions
are reused. Tabs still running older frontend code retain their older behavior until
refreshed; new tabs synchronize with storage changes from older tabs.

Recovery recognizes the existing explicit session-required message and its Convex
error wrapper. A future change to that error contract must update this classifier
or introduce a coordinated structured error code. Unrelated errors are not treated
as expiration. Credentials are not added to logging, analytics, error text, or UI.

## Validation

Focused local tests cover store synchronization, mounted consumers, signup/login,
logout, stale invalidation and late successful action results, query readiness,
expiry/revocation/password-reset recovery, root billing failures through the real
App/router, unrelated errors, valid-session remount, recovery remount without new
rejected subscriptions, and Client Portal isolation. Existing backend suites verify
session enforcement, password resets, Manager capabilities, tenant isolation, and
Super Admin entitlements.

Frontend and Convex typechecks and a local frontend build are required. This task
does not deploy, merge other drafts, inspect production credentials, or change
production records. Unsaved staff-page state is discarded on session replacement or
invalidation so work is not carried across different principals.
