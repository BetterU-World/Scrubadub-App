import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { ensureClientRelationshipForLead } from "./lib/clientRelationships";
import { logAudit } from "./lib/helpers";
import { hasOwnerOrManagerPermission } from "./lib/auth";

export const getClientUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const getClientUserById = internalQuery({
  args: { clientUserId: v.id("clientUsers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.clientUserId);
  },
});

export const getClientUserByResetToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => await ctx.db
    .query("clientUsers")
    .withIndex("by_resetToken", (q) => q.eq("resetToken", args.tokenHash))
    .first(),
});

export const setClientResetToken = internalMutation({
  args: {
    clientUserId: v.id("clientUsers"),
    resetToken: v.string(),
    resetTokenExpiry: v.number(),
  },
  handler: async (ctx, args) => ctx.db.patch(args.clientUserId, {
    resetToken: args.resetToken,
    resetTokenExpiry: args.resetTokenExpiry,
    updatedAt: Date.now(),
  }),
});

export const consumeClientResetToken = internalMutation({
  args: { clientUserId: v.id("clientUsers"), passwordHash: v.string() },
  handler: async (ctx, args) => ctx.db.patch(args.clientUserId, {
    passwordHash: args.passwordHash,
    resetToken: undefined,
    resetTokenExpiry: undefined,
    updatedAt: Date.now(),
  }),
});

export const getRelationshipForOwner = internalQuery({
  args: {
    userId: v.id("users"),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.userId);
    if (!owner || owner.status !== "active" || !owner.companyId ||
        !hasOwnerOrManagerPermission(owner, "canManageClients")) {
      throw new Error("Client management permission required");
    }
    const relationship = await ctx.db.get(args.relationshipId);
    if (!relationship) throw new Error("Client relationship not found");
    if (relationship.companyId !== owner.companyId) throw new Error("Access denied");
    return { owner, relationship };
  },
});

export const resolveRelationshipForRequest = internalMutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status !== "active" || !user.companyId ||
        !hasOwnerOrManagerPermission(user, "canManageClients")) {
      throw new Error("Client management permission required");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== user.companyId) throw new Error("Access denied");
    if (request.status === "archived") throw new Error("Archived requests cannot invite clients");
    if (!request.requesterEmail?.trim()) throw new Error("Client email is required");

    const relationshipId = await ensureClientRelationshipForLead(ctx, request);
    const relationship: any = await ctx.db.get(relationshipId);
    if (!relationship || relationship.companyId !== user.companyId) throw new Error("Access denied");
    if (relationship.status === "archived") throw new Error("Archived client relationships cannot invite clients");
    if (!relationship.clientUserId && !relationship.pendingInviteClientUserId && !relationship.inviteTokenHash) {
      await ctx.db.patch(relationshipId, {
        email: request.requesterEmail.trim().toLowerCase(),
        updatedAt: Date.now(),
      });
    }
    return relationshipId;
  },
});

export const recordRequestInvitationAudit = internalMutation({
  args: {
    userId: v.id("users"),
    requestId: v.id("clientRequests"),
    relationshipId: v.id("clientRelationships"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const request = await ctx.db.get(args.requestId);
    const relationship = await ctx.db.get(args.relationshipId);
    if (!user?.companyId || request?.companyId !== user.companyId || relationship?.companyId !== user.companyId) {
      throw new Error("Access denied");
    }
    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: "client_portal_invitation_sent_from_request",
      entityType: "clientRequest",
      entityId: args.requestId,
      details: String(args.relationshipId),
    });
  },
});

export const getRelationshipByInviteToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientRelationships")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", args.tokenHash))
      .first();
  },
});

export const createClientUser = internalMutation({
  args: {
    email: v.string(),
    displayName: v.string(),
    phone: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("disabled"), v.literal("pending")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("clientUsers", {
      email: args.email,
      displayName: args.displayName,
      phone: args.phone,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setRelationshipInvite = internalMutation({
  args: {
    relationshipId: v.id("clientRelationships"),
    clientUserId: v.optional(v.id("clientUsers")),
    pendingInviteClientUserId: v.optional(v.id("clientUsers")),
    inviteTokenHash: v.string(),
    inviteTokenExpiry: v.number(),
    inviteSentAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.relationshipId, {
      clientUserId: args.clientUserId,
      pendingInviteClientUserId: args.pendingInviteClientUserId,
      inviteTokenHash: args.inviteTokenHash,
      inviteTokenExpiry: args.inviteTokenExpiry,
      inviteSentAt: args.inviteSentAt,
      updatedAt: Date.now(),
    });
  },
});

export const acceptRelationshipInvite = internalMutation({
  args: {
    relationshipId: v.id("clientRelationships"),
    clientUserId: v.id("clientUsers"),
    passwordHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.passwordHash) {
      await ctx.db.patch(args.clientUserId, {
        passwordHash: args.passwordHash,
        status: "active",
        inviteTokenHash: undefined,
        inviteTokenExpiry: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.clientUserId, {
        status: "active",
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch(args.relationshipId, {
      clientUserId: args.clientUserId,
      pendingInviteClientUserId: undefined,
      inviteTokenHash: undefined,
      inviteTokenExpiry: undefined,
      inviteSentAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
