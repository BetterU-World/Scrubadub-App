# Company Resource large-file operations

Company Resources accept PDF, JPEG, PNG, and WebP files through 50 MiB. An authorized staff mutation creates a one-hour Resource upload intent and a Convex generated upload URL. The browser uploads directly to Convex storage with the server-issued nonce in the `Content-Type` metadata, registers the returned storage ID, and asks a backend action to finalize. Finalization checks the stored object's creation time, nonce, MIME type, actual byte count, and bounded signature reads before an atomic Resource create or replacement. An arbitrary storage ID cannot be finalized against an intent.

Staff and client file requests use a Resource ID and authenticated 8 MiB ranges. Every range repeats Resource authorization. A file-generation token prevents the browser from assembling chunks across replacements. No Convex storage URL is returned to the browser by these routes.

If validation or finalization fails, the registered candidate is deleted. Cancel also deletes a registered candidate. A 15-minute cron cleans up to 25 expired pending intents and their registered candidates per run. If more than 25 expire at once, the next run continues. Completed intents retain request-key retry results; permanent Resource deletion removes related intents.

There is a narrow orphan window after Convex accepts a direct upload but before the browser registers its storage ID. If the browser disappears in that window, the intent has no candidate ID for automatic cleanup. An operator can conservatively reconcile it:

1. Find the expired or cancelled `resourceUploadIntents` record and its nonce in the Convex dashboard.
2. Find the `_storage` object whose `contentType` contains that exact `scrub-intent` nonce; confirm its creation time is after the intent's `createdAt`.
3. Run the internal `mutations/resourceUploadIntents:reconcileOrphan` mutation with that exact `intentId` and `storageId`. It refuses active intents, a mismatched marker or time, and any object referenced by a Company Resource. It deletes only the supplied, verified object.

Do not delete arbitrary `_storage` objects or use a broad storage sweep. This reconciliation is only for uploads with an exact Resource intent match.
