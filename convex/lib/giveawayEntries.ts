import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { giveawayCampaigns, giveawayState, normalizeGiveawayEmail } from "./giveawayCampaigns";

export type GiveawayContact = { email: string; eligibilityConfirmed: boolean; marketingConsent: boolean };

/** Called only from canonical assessment completion, in the same Convex transaction. */
export async function qualifyGiveaway(ctx: MutationCtx, attempt: Doc<"assessmentAttempts">, now: number, contact?: GiveawayContact) {
  const campaignId = attempt.sourceSnapshot?.utmCampaign;
  if (!campaignId || attempt.sourceSnapshot?.utmSource !== "giveaway") return;
  const campaign = giveawayCampaigns[campaignId];
  if (!campaign || giveawayState(campaign, now) !== "active") {
    await ctx.db.patch(attempt._id, { giveawayOutcome: "outside_period" });
    return;
  }
  if (!contact) throw new Error("A contact email is required for giveaway entry");
  const normalizedEmail = normalizeGiveawayEmail(contact.email);
  if (!contact.eligibilityConfirmed) throw new Error("Confirm giveaway eligibility and Official Rules before entering");
  // An indexed read and insert in one mutation are serialized by Convex OCC.
  const existing = await ctx.db.query("giveawayEntries").withIndex("by_campaign_email", q => q.eq("campaignId", campaignId).eq("normalizedEmail", normalizedEmail)).unique();
  const outcome = existing ? "duplicate" : "qualified";
  if (!existing) await ctx.db.insert("giveawayEntries", {
    campaignId, attemptId: attempt._id, normalizedEmail, originalEmail: contact.email.trim(),
    qualifiedAt: now, status: "qualified", rulesVersion: campaign.rulesVersion,
    eligibilityConfirmedAt: now, marketingConsent: contact.marketingConsent,
    marketingConsentAt: contact.marketingConsent ? now : undefined,
    consentVersion: contact.marketingConsent ? "giveaway_followup_v1" : undefined,
  });
  await ctx.db.patch(attempt._id, { giveawayOutcome: outcome });
  await ctx.db.insert("assessmentEvents", {
    attemptId: attempt._id,
    eventKey: existing ? "giveaway_duplicate_entry_detected" : "giveaway_entry_qualified",
    deduplicationKey: `${attempt._id}:giveaway_entry`, language: attempt.responseLanguage,
    metadata: { campaignId }, createdAt: now,
  });
}
