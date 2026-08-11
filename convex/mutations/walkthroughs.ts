import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { ensureClientRelationshipForLead } from "../lib/clientRelationships";
import { logAudit } from "../lib/helpers";

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

const structuredResponseValidator = v.object({
  key: v.string(),
  groupKey: v.string(),
  valueType: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select"),
    v.literal("multi_select")
  ),
  textValue: v.optional(v.string()),
  numberValue: v.optional(v.number()),
  booleanValue: v.optional(v.boolean()),
  stringValues: v.optional(v.array(v.string())),
});

const walkthroughFields = {
  propertyId: v.optional(v.id("properties")),
  commercialAccountId: v.optional(v.id("commercialAccounts")),
  proposalId: v.optional(v.id("proposals")),
  title: v.string(),
  walkthroughType: walkthroughTypeValidator,
  scheduledDate: v.optional(v.string()),
  scheduledStartTime: v.optional(v.string()),
  scheduledEndTime: v.optional(v.string()),
  assignedManagerId: v.optional(v.id("users")),
  appointmentStatus: v.optional(v.union(v.literal("draft"), v.literal("scheduled"), v.literal("completed"), v.literal("cancelled"))),
  schedulingNotes: v.optional(v.string()),
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
  fieldSetVersion: v.optional(v.string()),
  structuredResponses: v.optional(v.array(structuredResponseValidator)),
};

const linkedPropertyFactsValidator = v.object({
  address: v.string(),
  squareFootage: v.optional(v.number()),
  beds: v.optional(v.number()),
  baths: v.optional(v.number()),
  amenities: v.array(v.string()),
  accessInstructions: v.optional(v.string()),
  pillowCount: v.optional(v.number()),
  sheetSets: v.optional(v.number()),
  towelCount: v.optional(v.number()),
  restroomCount: v.optional(v.number()),
  trashCanCount: v.optional(v.number()),
});

type StructuredResponseValueType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multi_select";

type StructuredResponse = {
  key: string;
  groupKey: string;
  valueType: StructuredResponseValueType;
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  stringValues?: string[];
};

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  return await requireOwnerOrManagerCapability(
    ctx, sessionToken, userId, "canManageSalesAndCommercial"
  );
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

function cleanStructuredResponses(responses: any[] | undefined) {
  if (!responses) return undefined;
  return responses
    .slice(0, 200)
    .map((response) => {
      const valueType = response.valueType;
      const cleaned: StructuredResponse = {
        key: cleanRequired(response.key, "", 100),
        groupKey: cleanRequired(response.groupKey, "", 100),
        valueType,
      };

      if (!cleaned.key || !cleaned.groupKey) return null;

      if (valueType === "text") {
        cleaned.textValue = cleanOptional(response.textValue, 4000);
      } else if (valueType === "number") {
        cleaned.numberValue = cleanNumber(response.numberValue, cleaned.key, 1_000_000);
      } else if (valueType === "boolean") {
        cleaned.booleanValue = response.booleanValue === true;
      } else if (valueType === "select") {
        const value = cleanOptional(response.stringValues?.[0], 200);
        cleaned.stringValues = value ? [value] : undefined;
      } else if (valueType === "multi_select") {
        const rawValues: string[] = (response.stringValues ?? [])
          .map((value: string) => cleanOptional(value, 200))
          .filter((value: string | undefined): value is string => Boolean(value));
        const values = Array.from(new Set<string>(rawValues)).slice(0, 50);
        cleaned.stringValues = values.length ? values : undefined;
      }

      const hasValue =
        cleaned.textValue !== undefined ||
        cleaned.numberValue !== undefined ||
        cleaned.booleanValue !== undefined ||
        cleaned.stringValues !== undefined;
      return hasValue ? cleaned : null;
    })
    .filter((response): response is StructuredResponse => response !== null);
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
  if (args.assignedManagerId) {
    const manager = await ctx.db.get(args.assignedManagerId);
    if (
      !manager ||
      manager.status !== "active" ||
      manager.companyId !== companyId ||
      (manager.role !== "owner" && manager.role !== "manager")
    ) {
      throw new Error("Assigned manager is invalid");
    }
  }
}

function assertScheduledFields(args: any) {
  if (
    args.appointmentStatus === "scheduled" &&
    (!args.scheduledDate?.trim() || !args.scheduledStartTime?.trim())
  ) {
    throw new Error("A date and start time are required for a scheduled walkthrough");
  }
}

async function updateLinkedPropertyFacts(
  ctx: any,
  owner: any,
  propertyId: any,
  facts: any
) {
  const property = await ctx.db.get(propertyId);
  if (!property) throw new Error("Property not found");
  if (property.companyId !== owner.companyId) throw new Error("Access denied");

  const address = facts.address.trim();
  if (!address) throw new Error("Property address is required");
  const numericFacts = [
    facts.squareFootage, facts.beds, facts.baths, facts.pillowCount, facts.sheetSets,
    facts.towelCount, facts.restroomCount, facts.trashCanCount,
  ];
  if (numericFacts.some((value) => value !== undefined && (!Number.isFinite(value) || value < 0))) {
    throw new Error("Property counts must be non-negative numbers");
  }

  await ctx.db.patch(propertyId, {
    ...facts,
    address,
    accessInstructions: facts.accessInstructions?.trim() || undefined,
    amenities: Array.from(new Set<string>(facts.amenities.map((value: string) => value.trim()).filter(Boolean))),
  });
  await logAudit(ctx, {
    companyId: owner.companyId,
    userId: owner._id,
    action: "update_property",
    entityType: "property",
    entityId: propertyId,
    details: "Updated from linked walkthrough",
  });
}

function buildWalkthroughPatch(args: any) {
  return {
    propertyId: args.propertyId,
    commercialAccountId: args.commercialAccountId,
    proposalId: args.proposalId,
    title: cleanRequired(args.title, "Walkthrough", 200),
    walkthroughType: args.walkthroughType,
    scheduledDate: cleanOptional(args.scheduledDate, 50),
    scheduledStartTime: cleanOptional(args.scheduledStartTime, 20),
    scheduledEndTime: cleanOptional(args.scheduledEndTime, 20),
    assignedManagerId: args.assignedManagerId,
    appointmentStatus: args.appointmentStatus,
    schedulingNotes: cleanOptional(args.schedulingNotes, 2000),
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
    fieldSetVersion: cleanOptional(args.fieldSetVersion, 50),
    structuredResponses: cleanStructuredResponses(args.structuredResponses),
  };
}

async function getOwnedWalkthrough(ctx: any, sessionToken: string, userId: any, walkthroughId: any) {
  const owner = await requireOwnerCompany(ctx, sessionToken, userId);
  const walkthrough = await ctx.db.get(walkthroughId);
  if (!walkthrough) throw new Error("Walkthrough not found");
  if (walkthrough.companyId !== owner.companyId) throw new Error("Access denied");
  return { owner, walkthrough };
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.optional(v.id("clientRequests")),
    ...walkthroughFields,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const companyId = owner.companyId!;
    await assertLinkedRecords(ctx, companyId, args);
    assertScheduledFields(args);
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
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
    scheduledDate: v.string(),
    scheduledStartTime: v.string(),
    scheduledEndTime: v.optional(v.string()),
    assignedManagerId: v.optional(v.id("users")),
    schedulingNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const request = await ctx.db.get(args.clientRequestId);
    if (!request) throw new Error("Lead not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");
    await assertLinkedRecords(ctx, owner.companyId, args);
    assertScheduledFields({
      appointmentStatus: "scheduled",
      scheduledDate: args.scheduledDate,
      scheduledStartTime: args.scheduledStartTime,
    });

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
      scheduledDate: cleanRequired(args.scheduledDate, "", 50),
      scheduledStartTime: cleanRequired(args.scheduledStartTime, "", 20),
      scheduledEndTime: cleanOptional(args.scheduledEndTime, 20),
      assignedManagerId: args.assignedManagerId,
      appointmentStatus: "scheduled",
      schedulingNotes: cleanOptional(args.schedulingNotes, 2000),
      scheduledAt: now,
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
    sessionToken: v.string(),
    walkthroughId: v.id("walkthroughs"),
    clientRequestId: v.optional(v.id("clientRequests")),
    linkedPropertyFacts: v.optional(linkedPropertyFactsValidator),
    ...walkthroughFields,
  },
  handler: async (ctx, args) => {
    const { owner, walkthrough } = await getOwnedWalkthrough(ctx, args.sessionToken, args.userId, args.walkthroughId);
    await assertLinkedRecords(ctx, owner.companyId, args);
    assertScheduledFields(args);
    if (args.linkedPropertyFacts) {
      if (!walkthrough.propertyId || args.propertyId !== walkthrough.propertyId) {
        throw new Error("Linked property does not match this walkthrough");
      }
      await updateLinkedPropertyFacts(ctx, owner, walkthrough.propertyId, args.linkedPropertyFacts);
    }

    const wasScheduled = walkthrough.appointmentStatus === "scheduled";
    const scheduleChanged = walkthrough.scheduledDate !== args.scheduledDate || walkthrough.scheduledStartTime !== args.scheduledStartTime;
    await ctx.db.patch(args.walkthroughId, {
      clientRequestId: args.clientRequestId,
      ...buildWalkthroughPatch(args),
      scheduledAt: !wasScheduled && args.appointmentStatus === "scheduled" ? Date.now() : walkthrough.scheduledAt,
      rescheduledAt: wasScheduled && scheduleChanged ? Date.now() : walkthrough.rescheduledAt,
      cancelledAt: args.appointmentStatus === "cancelled" ? Date.now() : walkthrough.cancelledAt,
      updatedAt: Date.now(),
    });
  },
});

export const complete = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    await getOwnedWalkthrough(ctx, args.sessionToken, args.userId, args.walkthroughId);
    const now = Date.now();
    await ctx.db.patch(args.walkthroughId, {
      status: "completed",
      appointmentStatus: "completed",
      completedAt: now,
      updatedAt: now,
    });
  },
});

export const archive = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    walkthroughId: v.id("walkthroughs"),
  },
  handler: async (ctx, args) => {
    await getOwnedWalkthrough(ctx, args.sessionToken, args.userId, args.walkthroughId);
    await ctx.db.patch(args.walkthroughId, {
      status: "archived",
      updatedAt: Date.now(),
    });
  },
});
