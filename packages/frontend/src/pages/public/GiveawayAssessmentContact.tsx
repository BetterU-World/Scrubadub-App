import { useState } from "react";
import { useTranslation } from "react-i18next";
import { giveawayCampaigns, normalizeGiveawayEmail } from "../../../../../convex/lib/giveawayCampaigns";
import type { GiveawayContact } from "../../../../../convex/lib/giveawayEntries";
import { useGiveawayState } from "./GiveawayPage";

export function GiveawayAssessmentContact({ campaignId, busy, error, onComplete, onBack }: { campaignId: string; busy: boolean; error: string; onComplete: (contact?: GiveawayContact) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const campaign = giveawayCampaigns[campaignId];
  const state = useGiveawayState(campaign);
  const [email, setEmail] = useState("");
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [invalid, setInvalid] = useState(false);
  return <main className="mx-auto max-w-xl rounded-3xl border border-gray-200 bg-white p-6 sm:p-8">
    <h1 className="text-2xl font-bold">{t("assessment.giveaway.title")}</h1>
    {state !== "active" ? <><p className="mt-4 leading-7">{t("assessment.giveaway.closed")}</p><button disabled={busy} className="btn-primary mt-6" onClick={() => onComplete()}>{t("assessment.actions.complete")}</button></> : <form onSubmit={event => { event.preventDefault(); try { normalizeGiveawayEmail(email); setInvalid(false); onComplete({ email, eligibilityConfirmed, marketingConsent }); } catch { setInvalid(true); } }}>
      <p id="giveaway-email-help" className="mt-4 leading-7 text-gray-600">{t("assessment.giveaway.emailHelp")}</p>
      <label className="mt-5 block font-medium" htmlFor="giveaway-email">{t("assessment.giveaway.email")}</label><input id="giveaway-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} aria-describedby="giveaway-email-help" aria-invalid={invalid} className="input-field mt-2"/>
      {invalid && <p role="alert" className="mt-2 text-red-700">{t("assessment.giveaway.invalidEmail")}</p>}
      <label className="mt-5 flex items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={eligibilityConfirmed} onChange={event => setEligibilityConfirmed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-600"/>{t("assessment.giveaway.eligibility")}</label>
      <a href={`/giveaway?campaign=${encodeURIComponent(campaignId)}#official-rules`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-primary-700 underline">{t("assessment.giveaway.rules")}</a>
      <p className="mt-3"><a href={`/giveaway?campaign=${encodeURIComponent(campaignId)}#alternate-entry`} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">{t("assessment.giveaway.alternate")}</a></p>
      <label className="mt-5 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={marketingConsent} onChange={event => setMarketingConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary-600"/>{t("assessment.giveaway.marketing")}</label>
      <p className="mt-4 text-sm text-gray-600">{t("assessment.giveaway.limit")}</p><a href="/privacy" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-primary-700 underline">{t("assessment.giveaway.privacy")}</a>
      <button disabled={busy} type="submit" className="btn-primary mt-6 w-full">{t("assessment.giveaway.submit")}</button>
    </form>}
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}<button type="button" disabled={busy} onClick={onBack} className="btn-secondary mt-4 w-full">{t("common.back")}</button>
  </main>;
}
