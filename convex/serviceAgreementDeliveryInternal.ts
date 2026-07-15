import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function formatFrequency(value: string | undefined) {
  const labels: Record<string, string> = {
    one_time: "One-time",
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
    quarterly: "Quarterly",
    custom: "Custom",
  };
  return value ? labels[value] ?? value : null;
}

async function companyBranding(ctx: any, companyId: any) {
  const [company, site] = await Promise.all([
    ctx.db.get(companyId),
    ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .first(),
  ]);

  return {
    companyName:
      site?.brandName ??
      company?.companyDisplayName ??
      company?.name ??
      "Your Cleaning Company",
    companyLogoUrl: site?.logoUrl ?? null,
    companyEmail: site?.publicEmail ?? company?.contactEmail ?? null,
    companyPhone: site?.publicPhone ?? company?.contactPhone ?? null,
  };
}

export const getAgreementForOwnerDelivery = internalQuery({
  args: {
    companyId: v.id("companies"),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Service agreement not found");
    if (agreement.companyId !== args.companyId) throw new Error("Access denied");
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be sent");
    }
    if (agreement.sentAt && Date.now() - agreement.sentAt < 60_000) {
      throw new Error("This agreement was just sent. Please wait before sending again.");
    }

    const [request, relationship, branding] = await Promise.all([
      agreement.clientRequestId ? ctx.db.get(agreement.clientRequestId) : null,
      agreement.clientRelationshipId ? ctx.db.get(agreement.clientRelationshipId) : null,
      companyBranding(ctx, agreement.companyId),
    ]);

    if (!relationship || relationship.companyId !== agreement.companyId) {
      throw new Error("Client relationship required before sending");
    }
    if (!relationship.clientUserId) {
      throw new Error("Client must have SCRUB client access before sending");
    }

    const recipientEmail = relationship.email ?? request?.requesterEmail ?? null;
    const clientUser = await ctx.db.get(relationship.clientUserId);
    if (!recipientEmail) throw new Error("Add a client email before sending");

    return {
      recipientEmail,
      clientName: agreement.clientName ?? relationship.displayName,
      language: clientUser?.language === "es" ? "es" : "en",
      company: branding,
      agreement: {
        title: agreement.title,
        propertyAddress: agreement.propertyAddress ?? null,
        serviceFrequencyLabel: formatFrequency(agreement.serviceFrequency),
        priceSummary: agreement.priceSummary ?? null,
        billingSchedule: agreement.billingSchedule ?? agreement.paymentTerms ?? null,
        effectiveStartDate: agreement.effectiveStartDate ?? null,
      },
    };
  },
});

export const markAgreementSent = internalMutation({
  args: {
    companyId: v.id("companies"),
    agreementId: v.id("serviceAgreements"),
  },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new Error("Service agreement not found");
    if (agreement.companyId !== args.companyId) throw new Error("Access denied");
    if (agreement.status === "signed" || agreement.status === "cancelled") {
      throw new Error("Signed or cancelled agreements cannot be sent");
    }

    const now = Date.now();
    await ctx.db.patch(args.agreementId, {
      status: "sent",
      sentAt: agreement.sentAt ?? now,
      updatedAt: now,
    });

    return { sentAt: agreement.sentAt ?? now };
  },
});
