import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyUnsubscribe } from "./lib/giveawayCampaignEmail";

export const handle = httpAction(async (ctx, request) => {
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'" };
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const hash = await verifyUnsubscribe(token, process.env.SCRUB_CAMPAIGN_UNSUBSCRIBE_SECRET ?? "");
  if (!hash) return new Response("Unsubscribe link is invalid. Contact SCRUB support to stop marketing emails.", { status: 400, headers });
  if (request.method === "GET") {
    // Link scanners must not change preferences. Only an explicit form or RFC 8058 POST does.
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SCRUB marketing preferences</title><h1>Stop SCRUB marketing emails?</h1><form method="post"><button type="submit">Unsubscribe from all SCRUB marketing</button></form><p>Your giveaway prize and account are unaffected.</p></html>', { headers });
  }
  await ctx.runMutation(internal.giveawayEmailCampaign.unsubscribe, { emailHash: hash });
  return new Response("You are unsubscribed from SCRUB marketing. Your giveaway prize and account are unaffected.", { headers });
});
export const providerWebhook = httpAction(async (ctx, request) => {
  const payload = await request.text();
  if (payload.length > 65536) return new Response(null, { status: 413 });
  const valid = await ctx.runAction(internal.actions.giveawayCampaignDelivery.providerSuppression, { payload, id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" });
  return new Response(null, { status: valid ? 204 : 401, headers: { "Cache-Control": "no-store" } });
});
