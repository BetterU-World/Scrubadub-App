"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateSecureToken, hashToken, proposalIssueToken } from "./lib/tokens";
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
    const baseUrl = appUrl();
    const tokenNonce = generateSecureToken();
    const prepared = await ctx.runMutation(
      (internal as any).proposalDeliveryInternal.prepareProposalEmail,
      { ...ownerArgs, tokenNonce, tokenHash: hashToken(proposalIssueToken(tokenNonce)) }
    );
    const viewUrl = `${baseUrl}/proposal/${proposalIssueToken(prepared.tokenNonce)}`;
    let sent = false;
    try {
      sent = await sendProposalEmail({
        email: prepared.recipientEmail,
        viewUrl,
        companyName: prepared.content.company.companyName,
        companyLogoUrl: prepared.content.company.companyLogoUrl ?? undefined,
        companyEmail: prepared.content.company.companyEmail ?? undefined,
        replyTo: prepared.replyTo ?? undefined,
        companyPhone: prepared.content.company.companyPhone ?? undefined,
        clientName: prepared.content.clientName,
        proposal: prepared.content.proposal,
      });
    } catch {
      sent = false;
    }
    if (sent) {
      try {
        const result = await ctx.runMutation(
          (internal as any).proposalDeliveryInternal.finishProposalEmail,
          { ...ownerArgs, attemptId: prepared.attemptId, result: "provider_accepted" }
        );
        return { success: true, sentAt: result.sentAt };
      } catch {
        try {
          await ctx.runMutation((internal as any).proposalDeliveryInternal.finishProposalEmail,
            { ...ownerArgs, attemptId: prepared.attemptId, result: "unknown" });
        } catch { /* The pending record remains durable for operator reconciliation. */ }
        throw new Error("The email provider accepted the proposal, but SCRUB could not confirm its final state. Retry may send a duplicate email with the same proposal link.");
      }
    }
    await ctx.runMutation((internal as any).proposalDeliveryInternal.finishProposalEmail,
      { ...ownerArgs, attemptId: prepared.attemptId, result: "failed" });
    throw new Error("The proposal email could not be sent. Please try again.");
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
