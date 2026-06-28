import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";

const walkthroughTypeValidator = v.union(
  v.literal("commercial"),
  v.literal("residential"),
  v.literal("str"),
  v.literal("move_in_out"),
  v.literal("post_construction"),
  v.literal("inspection"),
  v.literal("custom")
);

const roomValidator = v.object({
  name: v.string(),
  roomType: v.string(),
  notes: v.optional(v.string()),
  condition: v.optional(v.string()),
  estimatedMinutes: v.optional(v.number()),
});

const photoValidator = v.object({
  url: v.string(),
  caption: v.optional(v.string()),
  uploadedAt: v.optional(v.number()),
});

const walkthroughFields = {
  propertyId: v.optional(v.id("properties")),
  commercialAccountId: v.optional(v.id("commercialAccounts")),
  proposalId: v.optional(v.id("proposals")),
  title: v.string(),
  walkthroughType: walkthroughTypeValidator,
  scheduledDate: v.optional(v.string()),
  contactName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  address: v.optional(v.string()),
  squareFootage: v.optional(v.number()),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  serviceFrequencyRecommendation: v.optional(v.string()),
  estimatedHours: v.optional(v.number()),
  recommendedCleanerCount: v.optional(v.number()),
  estimatedMonthlyValueCents: v.optional(v.number()),
  rooms: v.optional(v.array(roomValidator)),
  scopeNotes: v.optional(v.string()),
  supplyNotes: v.optional(v.string()),
  accessNotes: v.optional(v.string()),
  riskNotes: v.optional(v.string()),
  staffingNotes: v.optional(v.string()),
  proposalNotes: v.optional(v.string()),
  photos: v.optional(v.array(photoValidator)),
};

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

function cleanOptional(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function cleanNumber(value: number | undefined, label: string, max = 1_000_000_000) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  if (value > max) throw new Error(`${label} is too large`);
  return value;
}

function cleanWholeCents(value: number | undefined, label: string) {
  const cleaned = cleanNumber(value, label);
  if (cleaned === undefined) return undefined;
  if (!Number.isInteger(cleaned)) throw new Error(`${label} must be whole cents`);
  return cleaned;
}

async function assertLinkedRecords(ctx: any, companyId: any, args: any) {
  if (args.clientRequestId) {
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== companyId) throw new Error("Access denied");
  }
  if (args.propertyId) {
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.companyId !== companyId) throw new Error("Access denied");
  }
  if (args.commercialAccountId) {
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) throw new Error("Commercial account not found");
    if (account.companyId !== companyId) throw new Error("Access denied");
  }
  if (args.proposalId) {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.companyId !== companyId) throw new Error("Access denied");
    if (args.clientRequestId && proposal.clientRequestId !== args.clientRequestId) {
      throw new Error("Proposal must match the linked lead");
    }
  }
}

function buildWalkthroughPatch(args: any) {
  return {
    propertyId: args.propertyId,
    commercialAccountId: args.commercialAccountId,
    proposalId: args.proposalId,
    title: cleanRequired(args.title, "Walkthrough", 200),
    walkthroughType: args.walkthroughType,
    scheduledDate: cleanOptional(args.scheduledDate, 50),
    contactName: cleanOptional(args.contactName, 200),
    contactEmail: cleanOptional(args.contactEmail, 200)?.toLowerCase(),
    contactPhone: cleanOptional(args.contactPhone, 50),
    address: cleanOptional(args.address, 500),
    squareFootage: cleanNumber(args.squareFootage, "Square footage"),
    bedrooms: cleanNumber(args.bedrooms, "Bedrooms", 200),
    bathrooms: cleanNumber(args.bathrooms, "Bathrooms", 200),
    serviceFrequencyRecommendation: cleanOptional(args.serviceFrequencyRecommendation, 200),
    estimatedHours: cleanNumber(args.estimatedHours, "Estimated hours", 100_000),
    recommendedCleanerCount: cleanNumber(args.recommendedCleanerCount, "Cleaner count", 1_000),
    estimatedMonthlyValueCents: cleanWholeCents(
      args.estimatedMonthlyValueCents,
      "Estimated monthly value"
    ),
    rooms: (args.rooms ?? [])
      .map((room: any) => ({
        name: cleanRequired(room.name, "Room", 200),
        roomType: cleanRequired(room.roomType, "Room", 100),
        condition: cleanOptional(room.condition, 100),
        estimatedMinutes: cleanNumber(room.estimatedMinutes, "Estimated minutes", 100_000),
        notes: cleanOptional(room.notes, 1000),
      }))
      .filter((room: any) => room.name || room.notes),
    scopeNotes: cleanOptional(args.scopeNotes, 4000),
    supplyNotes: cleanOptional(args.supplyNotes, 4000),
    accessNotes: cleanOptional(args.accessNotes, 4000),
    riskNotes: cleanOptional(args.riskNotes, 4000),
    staffingNotes: cleanOptional(args.staffingNotes, 4000),
    proposalNotes: cleanOptional(args.proposalNotes, 4000),
    photos: (args.photos ?? [])
      .map((photo: any) => ({
        url: cleanRequired(photo.url, "", 1000),
        caption: cleanOptional(photo.caption, 500),
        uploadedAt: photo.uploadedAt ?? Date.now(),
      }))
      .filter((photo: any) => photo.url),
  };
}

async function getOwnedWalkthrough(ctx: any, userId: any, walkthroughId: any) {
  const owner = await requireOwnerCompany(ctx, userId);
  const walkthrough = await ctx.db.get(walkthroughId);
  if (!walkthrough) throw new Error("Walkthrough not found");
  if (walkthrough.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, walkthrough };
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.optional(v.id("clientRequests")),
    ...walkthroughFields,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const companyId = owner.companyId!;
    await assertLinkedRecords(ctx, companyId, args);
    const now = Date.now();
    const request = args.clientRequestId ? await ctx.db.get(args.clientRequestId) : null;

    return await ctx.db.insert("walkthroughs", {
      companyId,
      clientRelationshipId: request
        ? await ensureClientRelationshipForLead(ctx, request)
        : undefined,
      clientRequestId: args.clientRequestId,
      status: "draft",
      ...buildWalkthroughPatch(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createFromClientRequest = mutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const existing = await ctx.db
      .query("walkthroughs")
      .withIndex("by_clientRequest", (q: any) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .first();
    if (existing && existing.companyId === owner.companyId && existing.status !== "archived") {
      return existing._id;
    }

    const leadType = (request as any).leadType;
    const walkthroughType =
      leadType === "commercial"
        ? "commercial"
        : leadType === "str_airbnb"
          ? "str"
          : leadType === "move_out"
            ? "move_in_out"
            : leadType === "post_construction"
              ? "post_construction"
              : "residential";
    const now = Date.now();
    const clientRelationshipId = await ensureClientRelationshipForLead(ctx, request);
    const walkthroughId = await ctx.db.insert("walkthroughs", {
      companyId: request.companyId,
      clientRelationshipId,
      clientRequestId: request._id,
      propertyId: request.propertyId,
      title: `${request.businessName || request.requesterName} Walkthrough`,
      walkthroughType,
      status: "draft",
      scheduledDate: request.requestedDate,
      contactName: request.requesterName,
      contactEmail: request.requesterEmail,
      contactPhone: request.requesterPhone,
      address: request.propertySnapshot?.address,
      serviceFrequencyRecommendation: (request as any).estimatedFrequency,
      estimatedMonthlyValueCents: (request as any).estimatedContractValueCents,
      scopeNotes: request.requestedService,
      proposalNotes: (request as any).leadNotes ?? request.notes,
      rooms: [],
      photos: [],
      createdAt: now,
      updatedAt: now,
    });

    const stage = (request as any).leadStage ?? "new";
    if (["new", "contacted"].includes(stage)) {
      await ctx.db.patch(request._id, {
        leadStage: "walkthrough_scheduled",
        lastStageChangedAt: now,
      });
    }

    return walkthroughId;
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    walkthroughId: v.id("walkthroughs"),
    clientRequestId: v.optional(v.id("clientRequests")),
    ...walkthroughFields,
  },
  handler: async (ctx, args) => {
    const { owner } = await getOwnedWalkthrough(ctx, args.userId, args.walkthroughId);
    await assertLinkedRecords(ctx, owner.companyId, args);

    await ctx.db.patch(args.walkthroughId, {
      clientRequestId: args.clientRequestId,
      ...buildWalkthroughPatch(args),
      updatedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: {
    userId: v.id("users"),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    await getOwnedWalkthrough(ctx, args.userId, args.walkthroughId);
    const now = Date.now();
    await ctx.db.patch(args.walkthroughId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });
  },
});

export const archive = mutation({
  args: {
    userId: v.id("users"),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    await getOwnedWalkthrough(ctx, args.userId, args.walkthroughId);
    await ctx.db.patch(args.walkthroughId, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});
