import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { track } from "@vercel/analytics";
import { api } from "../../../../../convex/_generated/api";
import type { GiveawayCampaign } from "../../../../../convex/lib/giveawayCampaigns";
import { getBrowserKey, randomHex } from "../../lib/assessmentPersistence";

export function GiveawayAlternateEntry({ campaign, active }: { campaign: GiveawayCampaign; active: boolean }) {
  const enter = useMutation((api as any).giveaways.enterAlternate);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [rulesAcknowledged, setRulesAcknowledged] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const browserKey = useRef<string>();
  const submitting = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!active || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      // Entry remains usable when browser storage is unavailable. No contact data is persisted locally.
      if (!browserKey.current) {
        try { browserKey.current = getBrowserKey(); } catch { browserKey.current = randomHex(); }
      }
      await enter({ campaignId: campaign.campaignId, browserKey: browserKey.current, firstName, lastName, email, eligibilityConfirmed, rulesAcknowledged, marketingConsent });
      setReceived(true); setFirstName(""); setLastName(""); setEmail("");
    } catch (caught) {
      setError(caught instanceof Error && /rate limit/i.test(caught.message)
        ? "Too many submissions. Please wait before trying again. If you already entered, another submission will not add an entry."
        : "We could not record this submission. Entries must still be open; check your details and confirmations, then try again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <section id="alternate-entry" aria-labelledby="alternate-entry-title" className="mt-14 scroll-mt-6 rounded-3xl border border-gray-200 bg-white p-6 sm:p-10">
    <h2 id="alternate-entry-title" className="text-2xl font-bold">Free alternate entry</h2>
    <p className="mt-3 max-w-3xl leading-7 text-gray-600">No Assessment, account, trial, subscription, payment, purchase, follow, share, or marketing consent required. Both methods receive the same chance of winning. One entry per person/email across both methods.</p>
    {received ? <p role="status" className="mt-6 rounded-xl border border-primary-200 bg-primary-50 p-4 text-primary-900">Your submission has been received. Valid entries are subject to eligibility verification. If this email already has an entry through either method, no additional entry is created. We will contact the selected entrant by email.</p>
      : !active ? <p role="status" className="mt-5 font-medium text-gray-700">Alternate entries are not open. Check the promotion dates and current giveaway status above.</p>
      : <form onSubmit={submit} onFocusCapture={() => { if (!started.current) { started.current = true; track("giveaway_alternate_entry_started", { campaignId: campaign.campaignId }); } }} className="mt-6 max-w-2xl space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="alternate-first-name" className="block font-medium">First name</label><input id="alternate-first-name" name="given-name" autoComplete="given-name" required maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} className="input-field mt-2"/></div>
          <div><label htmlFor="alternate-last-name" className="block font-medium">Last name</label><input id="alternate-last-name" name="family-name" autoComplete="family-name" required maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} className="input-field mt-2"/></div>
        </div>
        <div><label htmlFor="alternate-email" className="block font-medium">Contact email</label><input id="alternate-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} aria-describedby="alternate-email-help" className="input-field mt-2"/><p id="alternate-email-help" className="mt-2 text-sm leading-6 text-gray-600">We need your email to contact you if you are selected. Providing it does not subscribe you to marketing.</p></div>
        <p id="alternate-eligibility" className="leading-7 text-gray-600">{campaign.eligibility}</p>
        <label className="flex items-start gap-3 leading-6"><input type="checkbox" required checked={eligibilityConfirmed} onChange={event => setEligibilityConfirmed(event.target.checked)} aria-describedby="alternate-eligibility" className="mt-1 h-5 w-5 shrink-0 accent-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"/><span>I meet the eligibility requirements above and in the Official Rules, including the insider exclusion.</span></label>
        <label className="flex items-start gap-3 leading-6"><input type="checkbox" required checked={rulesAcknowledged} onChange={event => setRulesAcknowledged(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"/><span>I have read and agree to the <a href="#official-rules" className="font-medium text-primary-700 underline">Official Rules</a>.</span></label>
        <label className="flex items-start gap-3 leading-6"><input type="checkbox" checked={marketingConsent} onChange={event => setMarketingConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"/><span>Optional: I would also like occasional SCRUB updates, resources, and offers. My choice does not affect my entry or odds.</span></label>
        <p className="text-sm leading-6 text-gray-600">Entry information is used to administer the promotion, verify eligibility, contact the selected winner, and fulfill the prize. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-700 underline">Privacy Policy (opens in a new tab)</a></p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="btn-secondary w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:w-auto">{busy ? "Submitting…" : "Submit free alternate entry"}</button>
      </form>}
  </section>;
}
