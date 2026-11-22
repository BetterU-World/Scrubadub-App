import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireSmartEstimatePreview, smartEstimatePermissions } from "../lib/smartEstimateAccess";
import { StaffAuthorizationDenied } from "../lib/sessionAuth";
import { estimateBaseValidator, estimateOverrideValidator } from "../lib/smartEstimatePricing";
import { proposalAddOnLineValidator } from "../lib/proposalAddOnLineItems";
import { eligibleEstimateReplacement, estimateContext, fingerprintAddOns } from "../mutations/smartEstimates";

const auth = { userId: v.id("users"), sessionToken: v.string() };
const noAccess = { sales: false, configuration: false };

export const access = query({
  args: auth, returns: v.object({ sales: v.boolean(), configuration: v.boolean() }),
  handler: async (ctx, args) => {
    try {
      return smartEstimatePermissions(await requireSmartEstimatePreview(ctx, args, "either"));
    } catch (error) {
      if (error instanceof StaffAuthorizationDenied) return noAccess;
      throw error;
    }
  },
});

export const profiles = query({
  args: auth,
  returns: v.array(v.object({ profileId: v.id("smartPricingProfiles"), revisionId: v.id("smartPricingProfileRevisions"), name: v.string(), defaults: estimateBaseValidator })),
  handler: async (ctx, args) => {
    const actor = await requireSmartEstimatePreview(ctx, args, "either");
    const records = await ctx.db.query("smartPricingProfiles").withIndex("by_companyId_archivedAt", q => q.eq("companyId", actor.companyId).eq("archivedAt", undefined)).take(100);
    const revisions = await Promise.all(records.map(record => record.currentRevisionId ? ctx.db.get(record.currentRevisionId) : null));
    return revisions.flatMap((revision, index) => revision?.companyId === actor.companyId && revision.profileId === records[index]._id
      ? [{ profileId: revision.profileId, revisionId: revision._id, name: revision.name, defaults: revision.defaults }]
      : []);
  },
});

const fact = v.optional(v.object({ value: v.number(), source: v.union(v.literal("walkthrough"), v.literal("property")) }));

function propertyFact(measured: number | undefined, stored: number | undefined, scale: number) {
  const value = measured ?? stored;
  if (value === undefined || !Number.isFinite(value) || value < 0 || value * scale > 1e9) return undefined;
  return { value: Math.round(value * scale), source: measured === undefined ? "property" as const : "walkthrough" as const };
}

export const workspace = query({
  args: { ...auth, clientRequestId: v.id("clientRequests"), walkthroughId: v.optional(v.id("walkthroughs")) },
  returns: v.object({
    draft: v.union(v.null(), v.object({
      id: v.id("smartEstimates"), draftRevision: v.number(), input: estimateBaseValidator,
      override: v.optional(estimateOverrideValidator), profileRevisionId: v.optional(v.id("smartPricingProfileRevisions")),
      profileName: v.optional(v.string()), walkthroughId: v.optional(v.id("walkthroughs")),
    })),
    facts: v.object({ areaHundredths: fact, bedrooms: fact, bathHalves: fact }),
    address: v.optional(v.string()),
    walkthroughId: v.optional(v.id("walkthroughs")),
    walkthroughArchived: v.boolean(),
    replacement: v.union(v.null(), v.object({ id: v.id("walkthroughs"), title: v.string() })),
    propertyChanged: v.boolean(),
    propertyType: v.union(v.null(), v.string()),
    approval: v.union(v.null(), v.object({ id: v.id("smartEstimateRevisions"), stale: v.boolean() })),
    proposal: v.union(v.null(), v.object({
      id: v.id("proposals"), updatedAt: v.number(), editable: v.boolean(), lines: v.array(proposalAddOnLineValidator),
    })),
  }),
  handler: async (ctx, args) => {
    const actor = await requireSmartEstimatePreview(ctx, args, "sales");
    const [draft, proposal] = await Promise.all([
      ctx.db.query("smartEstimates").withIndex("by_companyId_clientRequestId", q => q.eq("companyId", actor.companyId).eq("clientRequestId", args.clientRequestId)).unique(),
      ctx.db.query("proposals").withIndex("by_clientRequestId", q => q.eq("clientRequestId", args.clientRequestId)).first(),
    ]);
    if (proposal && proposal.companyId !== actor.companyId) throw new StaffAuthorizationDenied("Access denied");
    const walkthroughId = draft?.walkthroughId ?? args.walkthroughId ?? proposal?.sourceWalkthroughId;
    const linked = await estimateContext(ctx, actor.companyId, args.clientRequestId, walkthroughId);
    const candidateId = args.walkthroughId ?? proposal?.sourceWalkthroughId;
    const replacement = draft && candidateId ? await eligibleEstimateReplacement(ctx, draft, linked, candidateId) : null;
    const { property, walkthrough, request } = replacement ?? linked;
    const [approval, profile] = await Promise.all([
      draft ? ctx.db.query("smartEstimateRevisions").withIndex("by_estimateId", q => q.eq("estimateId", draft._id)).order("desc").first() : null,
      draft?.profileRevisionId ? ctx.db.get(draft.profileRevisionId) : null,
    ]);
    const lines = proposal?.addOnLineItems ?? [];
    return {
      draft: draft ? { id: draft._id, draftRevision: draft.draftRevision, input: draft.input, override: draft.override,
        profileRevisionId: draft.profileRevisionId, profileName: profile?.companyId === actor.companyId ? profile.name : undefined, walkthroughId: draft.walkthroughId } : null,
      facts: {
        areaHundredths: propertyFact(walkthrough?.squareFootage, property?.squareFootage, 100),
        bedrooms: propertyFact(walkthrough?.bedrooms, property?.bedrooms?.length, 1),
        bathHalves: propertyFact(walkthrough?.bathrooms, property?.baths, 2),
      },
      address: walkthrough?.address || property?.address || request.propertySnapshot.address,
      walkthroughId,
      walkthroughArchived: linked.walkthrough?.status === "archived",
      replacement: replacement ? { id: replacement.walkthrough._id, title: replacement.walkthrough.title } : null,
      propertyChanged: draft !== null && draft.propertyId !== linked.propertyId,
      propertyType: linked.propertyType,
      approval: approval && approval.companyId === actor.companyId ? { id: approval._id, stale:
        linked.walkthrough?.status === "archived" || approval.draftRevision !== draft?.draftRevision || approval.propertyId !== linked.propertyId ||
        (approval.clientRelationshipId !== undefined && approval.clientRelationshipId !== linked.relationshipId) ||
        (approval.proposalId !== undefined && approval.proposalId !== proposal?._id) ||
        fingerprintAddOns(approval.addOnSnapshot) !== fingerprintAddOns(lines) } : null,
      proposal: proposal ? { id: proposal._id, updatedAt: proposal.updatedAt,
        editable: proposal.status === "draft" && !proposal.pendingDeliveryAttemptId, lines } : null,
    };
  },
});
