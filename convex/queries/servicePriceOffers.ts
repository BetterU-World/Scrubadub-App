import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireActiveClientRelationship, requireOwnerManagerSession, requireVerifiedClientSession } from "../lib/sessionAuth";
import { normalizedJobPrice, resolveJobInvoiceablePricing } from "../lib/jobPricing";

const staff = { userId: v.optional(v.id("users")), sessionToken: v.string() };

export const forRequest = query({
  args: { ...staff, requestId: v.id("clientRequests") },
  handler: async (ctx, args) => {
    const actor = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (actor.role === "manager" && !actor.canManageSalesAndCommercial && !actor.canViewFinancials) throw new Error("Pricing access required");
    const request = await ctx.db.get(args.requestId);
    if (!request || request.companyId !== actor.companyId) throw new Error("Access denied");
    const offer = request.currentPriceOfferId ? await ctx.db.get(request.currentPriceOfferId) : null;
    if (offer && (offer.companyId !== actor.companyId || offer.clientRequestId !== request._id)) throw new Error("Invalid price offer");
    return { offer, canManage: actor.role === "owner" || actor.canManageSalesAndCommercial === true };
  },
});

export const forJob = query({
  args: { ...staff, jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const actor = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
    if (actor.role === "manager" && !actor.canManageSalesAndCommercial && !actor.canViewFinancials) throw new Error("Pricing access required");
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== actor.companyId) throw new Error("Access denied");
    const offer = job.customerPriceOfferId ? await ctx.db.get(job.customerPriceOfferId) : null;
    const readiness = await resolveJobInvoiceablePricing(ctx, job._id, actor.companyId);
    return { status: normalizedJobPrice(job), source: job.customerPricingSource, revision: job.customerPricingRevision ?? 0, chargeCents: job.customerChargeCents, snapshot: job.customerPricingSnapshot, consent: job.customerPriceConsent, noChargeReason: job.customerNoChargeReason, offer, readiness, canManage: actor.role === "owner" || actor.canManageSalesAndCommercial === true };
  },
});

export const forClientRequest = query({
  args: { clientUserId: v.id("clientUsers"), sessionToken: v.string(), requestId: v.id("clientRequests") },
  handler: async (ctx, args) => {
    const client = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const request = await ctx.db.get(args.requestId);
    if (!request?.clientRelationshipId) throw new Error("Request unavailable");
    const relationship = await requireActiveClientRelationship(ctx, client, request.clientRelationshipId);
    if (request.companyId !== relationship.companyId) throw new Error("Request unavailable");
    const offer = request.currentPriceOfferId ? await ctx.db.get(request.currentPriceOfferId) : null;
    if (!offer || offer.companyId !== request.companyId || offer.clientRelationshipId !== relationship._id || offer.clientRequestId !== request._id) return { offer: null };
    return { offer: { _id: offer._id, version: offer.version, status: offer.status, snapshot: offer.snapshot, createdAt: offer.createdAt } };
  },
});
