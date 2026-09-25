import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireActiveClientRelationship, requireOwnerManagerSession, requireVerifiedClientSession } from "../lib/sessionAuth";
import { checkedPriceSnapshot } from "../lib/jobPricing";

const staff = { userId: v.optional(v.id("users")), sessionToken: v.string() };
const pricedAddOns = v.array(v.object({ name: v.string(), amountCents: v.number(), quantity: v.optional(v.number()), unitLabel: v.optional(v.string()) }));

async function pricingActor(ctx: any, args: any) {
  const actor = await requireOwnerManagerSession(ctx, args.sessionToken, args.userId);
  if (actor.role === "manager" && !actor.canManageSalesAndCommercial) throw new Error("Pricing permission required");
  return actor;
}

async function assertNotInvoiced(ctx: any, job: any) {
  if (!job) return;
  const invoices = await ctx.db.query("invoices").withIndex("by_company", (q: any) => q.eq("companyId", job.companyId)).collect();
  if (invoices.some((invoice: any) => invoice.status !== "void" && invoice.jobIds.includes(job._id))) throw new Error("Void or resolve the existing invoice before changing this price");
}

async function applyAccepted(ctx: any, offer: any, consent: any) {
  if (offer.jobId) {
    const job = await ctx.db.get(offer.jobId) as any;
    if (!job || job.companyId !== offer.companyId || job.clientRelationshipId !== offer.clientRelationshipId || job.customerPriceOfferId !== offer._id || job.customerPricingRevision !== offer.version) throw new Error("Price offer is no longer current");
    await ctx.db.patch(job._id, { customerChargeCents: offer.snapshot.totalCents, customerPricingStatus: "accepted", customerPricingSnapshot: offer.snapshot, customerPriceConsent: consent, customerPricingSource: offer.source });
  }
}

export const issue = mutation({
  args: { ...staff, requestId: v.optional(v.id("clientRequests")), jobId: v.optional(v.id("jobs")), expectedRevision: v.number(), baseChargeCents: v.number(), addOns: pricedAddOns },
  handler: async (ctx, args) => {
    const actor = await pricingActor(ctx, args);
    if (!!args.requestId === !!args.jobId) throw new Error("Choose a request or a job");
    const request = args.requestId ? await ctx.db.get(args.requestId) as any : null;
    const job = args.jobId ? await ctx.db.get(args.jobId) as any : null;
    const subject = request ?? job;
    if (!subject || subject.companyId !== actor.companyId || !subject.clientRelationshipId) throw new Error("Client service not found");
    if (request?.commercialAccountId || job?.commercialAccountId) throw new Error("Commercial pricing is managed by account billing");
    if (request && ["declined", "archived"].includes(request.status)) throw new Error("Request is closed");
    if (job?.status === "cancelled") throw new Error("Job is cancelled");
    const relationship = await ctx.db.get(subject.clientRelationshipId) as any;
    if (!relationship || relationship.companyId !== actor.companyId || relationship.status !== "active") throw new Error("Active client relationship required");
    const linked = request ? await ctx.db.query("jobs").withIndex("by_sourceClientRequestId", (q: any) => q.eq("sourceClientRequestId", request._id)).first() as any : null;
    await assertNotInvoiced(ctx, job ?? linked);
    const oldId = linked?.customerPriceOfferId ?? request?.currentPriceOfferId ?? job?.customerPriceOfferId;
    const old = oldId ? await ctx.db.get(oldId) as any : null;
    if (old && (old.companyId !== actor.companyId || old.clientRelationshipId !== relationship._id)) throw new Error("Invalid current price offer");
    const revision = request ? Math.max(old?.version ?? 0, linked?.customerPricingRevision ?? 0) : (job?.customerPricingRevision ?? 0);
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== revision) throw new Error("Price changed; refresh before continuing");
    const addOns = args.addOns.map((line) => ({ ...line, snapshotId: crypto.randomUUID(), name: line.name.trim(), unitLabel: line.unitLabel?.trim() || undefined }));
    const snapshot = checkedPriceSnapshot(args.baseChargeCents, addOns);
    if (snapshot.totalCents <= 0) throw new Error("Use the no-charge action for free work");
    if (old?.status === "issued" || old?.status === "accepted") await ctx.db.patch(old._id, { status: "superseded" });
    const source = (job ?? linked) && ["submitted", "approved"].includes((job ?? linked).status) ? "post_service_quote" : "direct_quote";
    const offerId = await ctx.db.insert("servicePriceOffers", { companyId: actor.companyId, clientRelationshipId: relationship._id, clientRequestId: request?._id ?? job?.sourceClientRequestId, jobId: job?._id, version: revision + 1, source, snapshot, status: "issued", createdByUserId: actor._id, createdAt: Date.now() });
    if (request) {
      await ctx.db.patch(request._id, { currentPriceOfferId: offerId });
      if (linked) {
        if (linked.companyId !== actor.companyId || linked.clientRelationshipId !== relationship._id || linked.commercialAccountId) throw new Error("Linked job is invalid");
        await ctx.db.patch(linked._id, { customerChargeCents: undefined, customerPricingStatus: "awaiting_acceptance", customerPricingRevision: revision + 1, customerPricingSource: source, customerPricingSnapshot: undefined, customerPriceConsent: undefined, customerPriceOfferId: offerId, customerNoChargeReason: undefined, customerAddOnsFinalizedRevision: undefined });
        await ctx.db.patch(offerId, { jobId: linked._id });
      }
    } else {
      await ctx.db.patch(job._id, { customerChargeCents: undefined, customerPricingStatus: "awaiting_acceptance", customerPricingRevision: revision + 1, customerPricingSource: source, customerPricingSnapshot: undefined, customerPriceConsent: undefined, customerPriceOfferId: offerId, customerNoChargeReason: undefined, customerAddOnsFinalizedRevision: undefined });
      if (job.sourceClientRequestId) {
        const sourceRequest = await ctx.db.get(job.sourceClientRequestId) as any;
        if (!sourceRequest || sourceRequest.companyId !== actor.companyId || sourceRequest.clientRelationshipId !== relationship._id) throw new Error("Source request is invalid");
        await ctx.db.patch(sourceRequest._id, { currentPriceOfferId: offerId });
      }
    }
    return offerId;
  },
});

export const respond = mutation({
  args: { clientUserId: v.id("clientUsers"), sessionToken: v.string(), offerId: v.id("servicePriceOffers"), decision: v.union(v.literal("accepted"), v.literal("declined")) },
  handler: async (ctx, args) => {
    const client = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    const offer = await ctx.db.get(args.offerId) as any;
    if (!offer) throw new Error("Price offer unavailable");
    await requireActiveClientRelationship(ctx, client, offer.clientRelationshipId);
    const request = offer.clientRequestId ? await ctx.db.get(offer.clientRequestId) as any : null;
    const job = offer.jobId ? await ctx.db.get(offer.jobId) as any : null;
    if (request && (request.companyId !== offer.companyId || request.clientRelationshipId !== offer.clientRelationshipId || request.currentPriceOfferId !== offer._id)) throw new Error("Price offer is no longer current");
    if (job && (job.companyId !== offer.companyId || job.clientRelationshipId !== offer.clientRelationshipId || job.customerPriceOfferId !== offer._id || job.customerPricingRevision !== offer.version)) throw new Error("Price offer is no longer current");
    if (offer.status !== "issued") throw new Error("Price offer is no longer current");
    const now = Date.now();
    await ctx.db.patch(offer._id, { status: args.decision, respondedAt: now, acceptedByClientUserId: args.decision === "accepted" ? client._id : undefined });
    if (args.decision === "accepted") await applyAccepted(ctx, offer, { source: "client_in_app", acceptedAt: now, acceptedAmountCents: offer.snapshot.totalCents, clientUserId: client._id, offerId: offer._id });
    else if (job) await ctx.db.patch(job._id, { customerChargeCents: undefined, customerPricingStatus: "pending", customerPricingSnapshot: undefined, customerPriceConsent: undefined });
    return { status: args.decision };
  },
});

export const recordOutsideAcceptance = mutation({
  args: { ...staff, offerId: v.id("servicePriceOffers"), expectedRevision: v.number(), evidenceNote: v.string() },
  handler: async (ctx, args) => {
    const actor = await pricingActor(ctx, args);
    const offer = await ctx.db.get(args.offerId) as any;
    if (!offer || offer.companyId !== actor.companyId || offer.status !== "issued" || offer.version !== args.expectedRevision) throw new Error("Price offer is no longer current");
    const relationship = await ctx.db.get(offer.clientRelationshipId) as any;
    if (!relationship || relationship.companyId !== actor.companyId || relationship.status !== "active") throw new Error("Active client relationship required");
    const note = args.evidenceNote.trim();
    if (note.length < 5 || note.length > 500) throw new Error("Describe how the client agreed outside SCRUB");
    const request = offer.clientRequestId ? await ctx.db.get(offer.clientRequestId) as any : null;
    const job = offer.jobId ? await ctx.db.get(offer.jobId) as any : null;
    if (request && (request.companyId !== actor.companyId || request.clientRelationshipId !== relationship._id || request.currentPriceOfferId !== offer._id)) throw new Error("Price offer is no longer current");
    if (job && (job.companyId !== actor.companyId || job.clientRelationshipId !== relationship._id || job.customerPriceOfferId !== offer._id || job.customerPricingRevision !== offer.version)) throw new Error("Price offer is no longer current");
    const now = Date.now();
    await ctx.db.patch(offer._id, { status: "accepted", respondedAt: now, outsideRecordedByUserId: actor._id, outsideEvidenceNote: note });
    await applyAccepted(ctx, offer, { source: "owner_reported_outside", acceptedAt: now, acceptedAmountCents: offer.snapshot.totalCents, recordedByUserId: actor._id, evidenceNote: note, offerId: offer._id });
    return offer._id;
  },
});

export const markNoCharge = mutation({
  args: { ...staff, jobId: v.id("jobs"), expectedRevision: v.number(), reason: v.union(v.literal("complimentary"), v.literal("waived"), v.literal("discounted_to_zero")) },
  handler: async (ctx, args) => {
    const actor = await pricingActor(ctx, args);
    const job = await ctx.db.get(args.jobId) as any;
    if (!job || job.companyId !== actor.companyId || job.commercialAccountId || !job.clientRelationshipId || job.status === "cancelled") throw new Error("Job unavailable");
    if ((job.customerPricingRevision ?? 0) !== args.expectedRevision) throw new Error("Price changed; refresh before continuing");
    const relationship = await ctx.db.get(job.clientRelationshipId) as any;
    if (!relationship || relationship.companyId !== actor.companyId || relationship.status !== "active") throw new Error("Active client relationship required");
    await assertNotInvoiced(ctx, job);
    const current = job.customerPriceOfferId ? await ctx.db.get(job.customerPriceOfferId) as any : null;
    if (current?.status === "issued" || current?.status === "accepted") await ctx.db.patch(current._id, { status: "superseded" });
    if (job.sourceClientRequestId) {
      const sourceRequest = await ctx.db.get(job.sourceClientRequestId) as any;
      if (sourceRequest?.companyId === actor.companyId && sourceRequest.currentPriceOfferId === job.customerPriceOfferId) await ctx.db.patch(sourceRequest._id, { currentPriceOfferId: undefined });
    }
    await ctx.db.patch(job._id, { customerChargeCents: 0, customerPricingStatus: "no_charge", customerPricingSource: undefined, customerPricingRevision: args.expectedRevision + 1, customerNoChargeReason: args.reason, customerNoChargeRecordedByUserId: actor._id, customerNoChargeRecordedAt: Date.now(), customerPricingSnapshot: undefined, customerPriceConsent: undefined, customerPriceOfferId: undefined });
  },
});

export const confirmDeliveredAddOns = mutation({
  args: { ...staff, jobId: v.id("jobs"), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const actor = await pricingActor(ctx, args);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== actor.companyId || job.commercialAccountId || job.customerPricingStatus !== "accepted" || !job.customerPricingSnapshot?.addOns.length || job.customerPricingRevision !== args.expectedRevision) throw new Error("Current accepted job price with add-ons required");
    await assertNotInvoiced(ctx, job);
    await ctx.db.patch(job._id, { customerAddOnsFinalizedRevision: args.expectedRevision, customerAddOnsFinalizedAt: Date.now(), customerAddOnsFinalizedByUserId: actor._id });
  },
});
