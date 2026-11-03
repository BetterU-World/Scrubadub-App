"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { requireSuperadminSession } from "../lib/sessions";
import { assertExternalSideEffectsAllowed } from "../lib/environment";
import { configuration, assertSendMode, outgoing, emailIdentity } from "../lib/giveawayCampaignEmail";
import { normalizeGiveawayEmail } from "../lib/giveawayCampaigns";

const campaign = internal.giveawayEmailCampaign;
export const providerSuppression = internalAction({
  args: { payload: v.string(), id: v.string(), timestamp: v.string(), signature: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const secret = process.env.SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET;
    if (!secret || args.payload.length > 65536) return false;
    try {
      // Verification is local; this never calls Resend's API or sends an email.
      const event = new Resend(process.env.RESEND_API_KEY ?? "webhook-verification-only").webhooks.verify({ payload: args.payload, headers: { id: args.id, timestamp: args.timestamp, signature: args.signature }, webhookSecret: secret });
      if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type) && "to" in event.data) {
        const recipients = event.data.to;
        if (!Array.isArray(recipients) || recipients.length > 50) return false;
        for (const email of recipients) await ctx.runMutation(campaign.providerOptOut, { emailHash: await emailIdentity(normalizeGiveawayEmail(email)) });
      }
      return true;
    } catch { return false; }
  },
});
// One explicit invocation processes at most ten messages. No scheduling or automatic retry.
export const sendBatch = action({
  args: { userId: v.id("users"), sessionToken: v.string(), runId: v.id("giveawayEmailRuns"), limit: v.number() },
  returns: v.object({ accepted: v.number(), stopped: v.boolean() }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    assertExternalSideEffectsAllowed("Giveaway email delivery");
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 10) throw new Error("Batch limit must be 1–10");
    const run = await ctx.runQuery(api.giveawayEmailCampaign.status, { userId: args.userId, sessionToken: args.sessionToken, runId: args.runId });
    assertSendMode(run.mode);
    const c = configuration(); const resend = new Resend(c.apiKey);
    let accepted = 0;
    for (let i = 0; i < args.limit; i++) {
      const reserved = await ctx.runMutation(campaign.reserve, { userId: args.userId, sessionToken: args.sessionToken, runId: args.runId });
      if (!reserved) return { accepted, stopped: true };
      let outcome: "accepted" | "rejected" | "uncertain" = "uncertain";
      let providerId: string | undefined;
      try {
        const message = await outgoing(reserved.template, c, reserved.emailHash);
        const result = await resend.emails.send({ from: `SCRUB Team <${c.sender}>`, replyTo: c.replyTo, to: reserved.email, ...message }, { idempotencyKey: reserved.key });
        if (result.data?.id && !result.error) { outcome = "accepted"; providerId = result.data.id; }
        else if (result.error && [400, 401, 403, 404, 422].includes(result.error.statusCode ?? 0)) outcome = "rejected";
      } catch {
        // Timeouts/network errors may follow acceptance. Never log provider bodies or retry here.
      }
      // If persistence fails after provider acceptance, the durable reservation remains unresolved.
      // A second invocation cannot send it again; an operator must reconcile with provider evidence.
      await ctx.runMutation(campaign.finish, { recipientId: reserved.recipientId, key: reserved.key, outcome, ...(providerId ? { providerId } : {}) });
      if (outcome !== "accepted") return { accepted, stopped: true };
      accepted++;
    }
    return { accepted, stopped: false };
  },
});
