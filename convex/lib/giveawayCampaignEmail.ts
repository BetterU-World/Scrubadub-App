import { emails, render } from "./giveawayEmailTemplates.js";
import { giveawayCampaigns, normalizeGiveawayEmail } from "./giveawayCampaigns";

export const CAMPAIGN = "scrub-giveaway-2026-001";
// Increment whenever content or selection requirements change. Approval binds to this version.
export const CONTENT_VERSION = "giveaway-email-v4-freescrub";
export type Template = "winner" | "marketing";
export type Mode = "test" | "production";
export const approvalPhrase = (mode: Mode) => `APPROVE ${mode.toUpperCase()} SCRUB GIVEAWAY A AND C`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function digest(s: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");
}
// Stable across auth-pepper rotations: signing, rather than obscuring this identifier,
// authorizes opt-out. Stored only privately and in the recipient's signed link.
export async function emailIdentity(email: string) {
  return digest(`scrub-marketing-email-v1:${normalizeGiveawayEmail(email)}`);
}
export function configuration(env: Record<string, string | undefined> = process.env) {
  const value = (name: string) => { const result = env[name]?.trim(); if (!result || /[\r\n]/.test(result)) throw new Error(`Missing or invalid campaign configuration: ${name}`); return result; };
  const mailbox = (name: string) => normalizeGiveawayEmail(value(name));
  const from = value("RESEND_FROM_EMAIL");
  const sender = normalizeGiveawayEmail(from.match(/<([^<>]+)>$/)?.[1] ?? from);
  const replyTo = mailbox("SCRUB_CAMPAIGN_REPLY_TO");
  const postalAddress = value("SCRUB_CAMPAIGN_POSTAL_ADDRESS");
  if (postalAddress.length > 500 || /\[|\]/.test(postalAddress)) throw new Error("Invalid campaign postal configuration");
  let site: URL;
  try { site = new URL(value("CONVEX_SITE_URL")); } catch { throw new Error("Invalid campaign HTTPS site configuration"); }
  if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash || site.pathname !== "/") throw new Error("Invalid campaign HTTPS site configuration");
  const secret = value("SCRUB_CAMPAIGN_UNSUBSCRIBE_SECRET");
  if (secret.length < 32) throw new Error("Campaign unsubscribe secret must have at least 32 characters");
  return { sender, replyTo, postalAddress, site: site.origin, secret,
    winner: mailbox("SCRUB_GIVEAWAY_WINNER_EMAIL"),
    apiKey: value("RESEND_API_KEY"),
    webhookSecret: value("SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET"),
    testRecipients: (env.SCRUB_CAMPAIGN_TEST_RECIPIENTS ?? "").split(",").filter(s => s.trim()).map(s => normalizeGiveawayEmail(s)),
  };
}
export type Config = ReturnType<typeof configuration>;
export async function configDigest(c: Config) {
  return digest(JSON.stringify({ ...c, contentVersion: CONTENT_VERSION, content: (["winner", "marketing"] as const).map(preview) }));
}
export function assertSendMode(mode: Mode, env: Record<string, string | undefined> = process.env) {
  if (env.SCRUB_CAMPAIGN_ALLOWED_SEND_MODE !== mode) throw new Error("Campaign sending is disabled for this mode");
}
export async function unsubscribeToken(emailHash: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`scrub-marketing-unsubscribe-v1:${emailHash}`));
  return `${emailHash}.${Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function verifyUnsubscribe(token: string, secret: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token) || secret.length < 32) return null;
  const [hash, signature] = token.split(".");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(signature.match(/../g)!.map(b => parseInt(b, 16)));
  return await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(`scrub-marketing-unsubscribe-v1:${hash}`)) ? hash : null;
}
export function preview(template: Template) {
  const e = emails.find(e => e.id === template)!;
  return { subject: e.subject, preheader: e.preheader, html: render(e), text: textFromHtml(render(e)) };
}
function textFromHtml(html: string) {
  return html.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<div style="display:none[\s\S]*?<\/div>/, "").replace(/<!--[^]*?-->/g, "").replace(/<(br|\/p|\/h[12]|\/td)[^>]*>/g, "\n").replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "$2 ($1)").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
export async function outgoing(template: Template, c: Config, emailHash: string) {
  const draft = preview(template);
  const token = await unsubscribeToken(emailHash, c.secret);
  const url = `${c.site}/giveaway/unsubscribe?token=${token}`;
  const footer = `Promotional preferences: <a href="${escape(url)}" style="color:#065f46;text-decoration:underline">Unsubscribe from SCRUB marketing</a><br>Scrubadub Solutions LLC · ${escape(c.postalAddress)}`;
  let html = draft.html;
  // Replace the whole footer marker, so no outgoing message can retain a preview placeholder.
  const marker = template === "marketing"
    ? 'Promotional email from SCRUB Team. You opted in to marketing. <span style="text-decoration:underline">Unsubscribe — preview placeholder</span><br>Scrubadub Solutions LLC · [private mailing address inserted at delivery]'
    : 'Please reply to claim your prize. No account, subscription, purchase, or bonus acceptance is required.';
  if (!html.includes(marker)) throw new Error("Campaign template version mismatch");
  html = html.replace(marker, template === "winner" ? `${marker}<br>${footer}<br>Marketing preferences do not affect your prize.` : `Promotional email from SCRUB Team. You opted in to marketing. ${footer}`);
  if (/preview placeholder|\[private mailing/.test(html)) throw new Error("Campaign footer is incomplete");
  return { subject: draft.subject, html, text: textFromHtml(html), headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}
export type Entry = { campaignId: string; normalizedEmail: string; originalEmail: string; status: string; rulesVersion: string; qualifiedAt: number; eligibilityConfirmedAt: number; marketingConsent?: unknown; marketingConsentAt?: number; consentVersion?: string };
export function category(e: Entry, winner: string, duplicates: number, suppressed: boolean) {
  const rules = giveawayCampaigns[CAMPAIGN];
  let email: string;
  try { email = normalizeGiveawayEmail(e.originalEmail); } catch { return "invalid" as const; }
  if (e.campaignId !== CAMPAIGN || email !== e.normalizedEmail || e.status !== "qualified" || e.rulesVersion !== rules.rulesVersion || !Number.isFinite(e.eligibilityConfirmedAt) || e.eligibilityConfirmedAt <= 0 || e.eligibilityConfirmedAt > Date.now() || !Number.isFinite(e.qualifiedAt) || e.qualifiedAt < rules.startsAt! || e.qualifiedAt >= rules.endsAt) return "invalid" as const;
  if (duplicates !== 1) return "duplicate" as const;
  if (email === winner) return "winner" as const; // Prize administration remains independent of marketing suppression.
  if (e.marketingConsent !== true) return e.marketingConsent === false ? "noConsent" as const : "invalidConsent" as const;
  if (!Number.isFinite(e.marketingConsentAt) || !e.marketingConsentAt || e.marketingConsentAt <= 0 || e.marketingConsentAt > Date.now() || e.consentVersion !== "giveaway_followup_v1") return "invalidConsent" as const;
  return suppressed ? "suppressed" as const : "marketing" as const;
}
