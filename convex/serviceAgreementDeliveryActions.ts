"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendServiceAgreementEmail } from "./lib/email";
import { requireOwnerOrManagerCapability } from "./lib/sessions";
import { requireAppUrl } from "./lib/environment";

function appUrl() {
  return requireAppUrl();
}

export const sendServiceAgreement = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args): Promise<{ success: true; sentAt: number }> => {
    const owner = await requireOwnerOrManagerCapability(
      ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial"
    );
    const ownerArgs = { companyId: owner.companyId, agreementId: args.agreementId };
    const baseUrl = appUrl();
    const prepared = await ctx.runMutation(
      (internal as any).serviceAgreementDeliveryInternal.prepareAgreementEmail,
      ownerArgs
    );
    const next = `/client/service-agreements/${args.agreementId}`;
    const viewUrl = `${baseUrl}/client/login?next=${encodeURIComponent(next)}`;
    let delivery: { accepted: boolean; providerMessageId?: string } = { accepted: false };
    try {
      delivery = await sendServiceAgreementEmail({
      email: prepared.recipientEmail,
      viewUrl,
      companyName: prepared.content.companyName,
      companyLogoUrl: prepared.content.companyLogoUrl ?? undefined,
      companyEmail: prepared.content.companyEmail ?? undefined,
      replyTo: prepared.replyTo ?? undefined,
      companyPhone: prepared.content.companyPhone ?? undefined,
      clientName: prepared.clientName,
      language: prepared.language,
      agreement: prepared.agreementEmailSummary,
      });
    } catch {
      delivery = { accepted: false };
    }
    if (delivery.accepted) {
      try {
        const result = await ctx.runMutation(
          (internal as any).serviceAgreementDeliveryInternal.finishAgreementEmail,
          { ...ownerArgs, attemptId: prepared.attemptId, result: "provider_accepted", providerMessageId: delivery.providerMessageId }
        );
        return { success: true, sentAt: result.sentAt };
      } catch {
        try {
          await ctx.runMutation((internal as any).serviceAgreementDeliveryInternal.finishAgreementEmail,
            { ...ownerArgs, attemptId: prepared.attemptId, result: "unknown" });
        } catch { /* Pending record remains for retry/reconciliation. */ }
        throw new Error("The email provider accepted the agreement, but SCRUB could not confirm its final state. Retry may send a duplicate email.");
      }
    }
    await ctx.runMutation((internal as any).serviceAgreementDeliveryInternal.finishAgreementEmail,
      { ...ownerArgs, attemptId: prepared.attemptId, result: "failed" });
    throw new Error("The agreement email could not be sent. Please try again.");
  },
});
