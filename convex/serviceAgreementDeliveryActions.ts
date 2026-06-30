"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { sendServiceAgreementEmail } from "./lib/email";

function appUrl() {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
}

export const sendServiceAgreement = action({
  args: {
    userId: v.id("users"),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args): Promise<{ success: true; sentAt: number }> => {
    const payload = await ctx.runQuery(
      (internal as any).serviceAgreementDeliveryInternal.getAgreementForOwnerDelivery,
      args
    );

    const email = payload.recipientEmail?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Add a valid client email before sending this agreement");
    }

    const next = `/client/service-agreements/${args.agreementId}`;
    const viewUrl = `${appUrl()}/client/login?next=${encodeURIComponent(next)}`;
    const result = await ctx.runMutation(
      (internal as any).serviceAgreementDeliveryInternal.markAgreementSent,
      args
    );

    const sent = await sendServiceAgreementEmail({
      email,
      viewUrl,
      companyName: payload.company.companyName,
      companyLogoUrl: payload.company.companyLogoUrl ?? undefined,
      companyEmail: payload.company.companyEmail ?? undefined,
      companyPhone: payload.company.companyPhone ?? undefined,
      clientName: payload.clientName,
      agreement: payload.agreement,
    });

    if (!sent) {
      throw new Error("Agreement was prepared, but the email could not be sent. Please try again.");
    }

    return { success: true, sentAt: result.sentAt };
  },
});
