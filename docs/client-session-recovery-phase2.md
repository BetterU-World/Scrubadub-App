# Client Portal session recovery (Phase 2)

## Confirmed causes

`convex/queries/clientAuth.ts:getCurrentClientUser` throws when session verification fails. The previous `useClientAuth` cleanup handled only a null result, so an invalid stored credential survived refresh and could block login. Each hook also owned an independent token snapshot; same-tab and cross-tab authentication changes did not reliably update every consumer.

PR #263's staff-session architecture is the reference. Its runtime implementation is unchanged by this phase.

## Recovery architecture

- `lib/clientSession.ts` owns a cached external-store snapshot under the existing client storage key. `useClientSession` shares it across mounted consumers. Storage events, pageshow, and subscription mounting reconcile persisted changes; ordinary renders use the cached snapshot.
- Login and invitation acceptance publish credentials only if their starting revision remains current. Rejected credentials are invalidated conditionally, with persisted state checked before removal. Older responses cannot clear or overwrite a newer observed session.
- `ClientSessionRecovery`, scoped to App's client route branch, catches only the explicit verified-session error. It unmounts rejected subscriptions, invalidates the captured credential, and resets on client revision changes. Other errors propagate to the existing error boundary without deleting credentials.
- Missing credentials on protected client routes return to client login. Return navigation accepts only recognized protected Client Portal routes. Login and invitations wait for existing-session hydration before exposing their forms.
- Logout immediately publishes an empty client session and attempts server revocation of the captured credential. It does not reload the browser or change staff storage.
- Forgot/reset-password routes remain public and usable with an invalid stored client credential. Reset retains existing backend revocation behavior; the next client hydration rejects any revoked session.

Client protected queries retain their existing verified-user/session gates. Backend verification, expiry limits, tenant and relationship checks, billing, and business workflows are unchanged. Staff-session changes do not remount client content or discard client drafts; client-session replacement intentionally remounts private client content.

## Validation

130 tests across 14 files pass, including actual App login/invitation/password-recovery/logout routes, mounted shared-hook recovery, storage races, stale results, reconnect/remount, staff isolation, and existing client authorization/session regressions. Frontend and Convex typechecks, the frontend production build, and diff whitespace checks pass. The build retains Vite's large-chunk warning.

## Compatibility and limits

The existing client storage key and backend APIs are retained. No backend deployment, schema migration, session renewal, or production data operation is required. Existing open tabs need the updated frontend loaded to receive recovery behavior.

Verification remains reactive: invalidation is detected on hydration or an explicit protected-query rejection, without a new heartbeat or automatic renewal. A browser that blocks storage can use an in-memory session for the page, but cannot persist or synchronize it across tabs. Client drafts are not preserved across client principal changes. Logout's server revocation remains best effort when the network is unavailable; local access stops immediately.
