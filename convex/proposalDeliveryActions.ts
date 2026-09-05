"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateSecureToken, hashToken } from "./lib/tokens";
import { sendProposalEmail } from "./lib/email";
import { requireOwnerOrManagerCapability } from "./lib/sessions";
import { requireAppUrl } from "./lib/environment";

function appUrl() {
  return requireAppUrl();
}

function cleanToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 256) {
    throw new Error("Proposal link unavailable or expired");
  }
  return trimmed;
}

export const sendProposal = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    proposalId: v.id("proposals"),
  },
  handler: async (ctx, args): Promise<{ success: true; sentAt: number }> => {
    const owner = await requireOwnerOrManagerCapability(
      ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial"
    );
    const ownerArgs = { companyId: owner.companyId, proposalId: args.proposalId };
    const payload = await ctx.runQuery(
      (internal as any).proposalDeliveryInternal.getProposalForOwnerDelivery,
      ownerArgs
    );

    const email = payload.recipientEmail?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Add a valid client email before sending this proposal");
    }

    const token = generateSecureToken();
    const viewUrl = `${appUrl()}/proposal/${token}`;
    const result = await ctx.runMutation(
      (internal as any).proposalDeliveryInternal.setProposalDeliveryTokenAndSent,
      {
        ...ownerArgs,
        proposalTokenHash: hashToken(token),
      }
    );

    const sent = await sendProposalEmail({
      email,
      viewUrl,
      companyName: payload.company.companyName,
      companyLogoUrl: payload.company.companyLogoUrl ?? undefined,
      companyEmail: payload.company.companyEmail ?? undefined,
      replyTo: payload.company.replyTo ?? undefined,
      companyPhone: payload.company.companyPhone ?? undefined,
      clientName: payload.clientName,
      proposal: payload.proposal,
      walkthroughSummary: payload.walkthroughSummary ?? undefined,
    });

    if (!sent) {
      throw new Error("Proposal was prepared, but the email could not be sent. Please try resend.");
    }

    return { success: true, sentAt: result.sentAt };
  },
});

export const getProposalByToken = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const token = cleanToken(args.token);
    return await ctx.runQuery(
      (internal as any).proposalDeliveryInternal.getClientProposalByTokenHash,
      { proposalTokenHash: hashToken(token) }
    );
  },
});

export const respondToProposal = action({
  args: {
    token: v.string(),
    decision: v.union(v.literal("accepted"), v.literal("declined")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const token = cleanToken(args.token);
    await ctx.runMutation((internal as any).rateLimitInternal.enforce, {
      key: `proposal:${token.slice(0, 12)}:respond`,
      limit: 5,
      windowMs: 60_000,
    });

    return await ctx.runMutation(
      (internal as any).proposalDeliveryInternal.respondToProposalByTokenHash,
      {
        proposalTokenHash: hashToken(token),
        decision: args.decision,
        note: args.note,
      }
    );
  },
});
