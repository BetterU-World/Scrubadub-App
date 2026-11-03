import { useState } from "react";
import { useAction, useMutation, useQuery, usePaginatedQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function GiveawayCampaignPanel({ userId, sessionToken }: { userId: Id<"users">; sessionToken: string }) {
  const auth = { userId, sessionToken };
  const [runId, setRunId] = useState<Id<"giveawayEmailRuns"> | null>(null);
  const [template, setTemplate] = useState<"winner" | "marketing">("winner");
  const [testEmail, setTestEmail] = useState("");
  const [phrase, setPhrase] = useState("");
  const [readiness, setReadiness] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const prepare = useMutation(api.giveawayEmailCampaign.prepare);
  const prepareNext = useMutation(api.giveawayEmailCampaign.prepareNextPage);
  const prepareTest = useMutation(api.giveawayEmailCampaign.prepareTest);
  const approve = useMutation(api.giveawayEmailCampaign.approve);
  const pause = useMutation(api.giveawayEmailCampaign.pause);
  const reviewPaused = useMutation(api.giveawayEmailCampaign.reviewPausedRun);
  const send = useAction(api.actions.giveawayCampaignDelivery.sendBatch);
  const preview = useQuery(api.giveawayEmailCampaign.designPreview, { ...auth, template });
  const status = useQuery(api.giveawayEmailCampaign.status, runId ? { ...auth, runId } : "skip");
  const ledger = usePaginatedQuery(api.giveawayEmailCampaign.ledgerPage, runId ? { ...auth, runId } : "skip", { initialNumItems: 25 });
  const [restoreId, setRestoreId] = useState("");
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true); setFeedback("");
    try { await work(); } catch { setFeedback("Operation blocked or failed. Review configuration, current approval, and the private delivery ledger before proceeding. Nothing is retried automatically."); }
    finally { setBusy(false); }
  };
  const resetReview = () => { setPhrase(""); setReadiness(false); };
  const expected = status ? `APPROVE ${status.mode.toUpperCase()} SCRUB GIVEAWAY A AND C` : "";
  return <section className="card mb-6" aria-labelledby="giveaway-campaign-title">
    <h2 id="giveaway-campaign-title" className="text-lg font-semibold">Giveaway email campaign</h2>
    <p className="mt-2 text-sm text-gray-600">A: official winner. C: explicitly marketing-consented nonwinners. B is archived. Design and PR approval do not authorize sending. Previews use sample data and omit the private postal address.</p>
    <div className="mt-4 flex flex-wrap gap-3" role="group" aria-label="Email preview">
      <button className="btn-secondary" onClick={() => setTemplate("winner")}>Preview winner A</button>
      <button className="btn-secondary" onClick={() => setTemplate("marketing")}>Preview marketing C</button>
    </div>
    {preview && <><p className="mt-4 text-sm"><strong>From:</strong> SCRUB Team · <strong>Subject:</strong> {preview.subject}</p><iframe title="Campaign email design preview" className="mt-3 h-[650px] w-full rounded border" sandbox="" srcDoc={preview.html} /></>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button className="btn-secondary" disabled={busy} onClick={() => action(async () => { setRunId(await prepare(auth)); resetReview(); })}>Prepare production dry run</button>
      <label className="text-sm">Approved internal test address<input type="email" autoComplete="off" className="input mt-1" value={testEmail} onChange={e => setTestEmail(e.target.value)} /></label>
      <button className="btn-secondary" disabled={busy || !testEmail} onClick={() => action(async () => { setRunId(await prepareTest({ ...auth, testEmail })); resetReview(); })}>Prepare test review (no send)</button>
    </div>
    <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Existing private run ID<input className="input mt-1" value={restoreId} onChange={e => setRestoreId(e.target.value)} /></label><button className="btn-secondary" disabled={busy || !restoreId} onClick={() => { setRunId(restoreId as Id<"giveawayEmailRuns">); resetReview(); }}>Review existing run</button></div>
    {status && runId && <div className="mt-5 rounded border p-4">
      <p className="font-semibold">{status.mode === "production" ? "PRODUCTION" : "TEST"} · {status.state}</p>
      <p className="mt-2 break-all text-xs">Run: {runId}<br />Snapshot digest: {status.digest}</p>
      <dl className="my-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{Object.entries(status.counts).map(([key, count]) => <div key={key}><dt>{key}</dt><dd className="font-semibold">{count}</dd></div>)}</dl>
      {status.state === "preparing" && <button className="btn-secondary" disabled={busy} onClick={() => action(() => prepareNext({ ...auth, runId }))}>Process next 100 entrants (no send)</button>}
      {status.state === "ready" && <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={readiness} onChange={e => setReadiness(e.target.checked)} />I have explicit founder permission for this mode and reviewed the private recipient eligibility/suppression audit, billing and bonus terms, correspondence and 72-hour clock, sender/reply-to, private footer, and functional unsubscribe. Both A and C are ready.</label>
        <label className="mt-4 block text-sm">Type {expected}<input className="input mt-1 w-full" autoComplete="off" value={phrase} onChange={e => setPhrase(e.target.value)} /></label>
        <button className="btn-secondary mt-3" disabled={busy || !readiness || phrase !== expected} onClick={() => action(async () => { await approve({ ...auth, runId, expectedDigest: status.digest, approval: phrase, confirmReadiness: readiness }); resetReview(); })}>Record explicit {status.mode} send approval</button>
      </>}
      {status.state === "approved" && <div className="mt-4 flex flex-wrap gap-3"><button className="btn-primary" disabled={busy || status.inFlight} onClick={() => action(async () => { const result = await send({ ...auth, runId, limit: 10 }); setFeedback(`Provider accepted ${result.accepted} messages in this invocation. ${result.stopped ? "Stopped; review state before continuing." : "Invoke another batch manually if needed."}`); })}>Send up to 10 {status.mode} emails now</button><button className="btn-secondary" disabled={busy} onClick={() => action(() => pause({ ...auth, runId }))}>Pause remaining sends</button></div>}
      {(status.inFlight || status.state === "paused") && <p className="mt-3 text-sm text-amber-800">Delivery is paused or unresolved. Reconcile private provider evidence before another approval. No automatic retry.</p>}
      {status.state === "paused" && !status.inFlight && <button className="btn-secondary mt-3" disabled={busy} onClick={() => action(() => reviewPaused({ ...auth, runId }))}>Return resolved run to approval review</button>}
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Private delivery ledger (no email addresses)</summary><ul className="mt-3 space-y-2 text-xs">{ledger.results.map(row => <li key={row.recipientId} className="break-all">{row.template} · {row.state} · {row.recipientId}{row.providerId && <> · provider: {row.providerId}</>}{row.responseDeadline && <> · winner response deadline: {new Date(row.responseDeadline).toLocaleString()}</>}</li>)}</ul>{ledger.status === "CanLoadMore" && <button className="btn-secondary mt-3" onClick={() => ledger.loadMore(25)}>Load more ledger entries</button>}</details>
      {status.approvalExpiresAt && <p className="mt-3 text-xs">Approval expires: {new Date(status.approvalExpiresAt).toLocaleString()}. A new approval is required after reconciliation.</p>}
    </div>}
    {feedback && <p role="status" className="mt-4 text-sm">{feedback}</p>}
  </section>;
}
