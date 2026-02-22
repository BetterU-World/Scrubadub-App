import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

export const listContacts = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);
    return ctx.db
      .query("partnerContacts")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();
  },
});

/** Legacy rows have no status field → treat as active */
function connStatus(c: { status?: string }): string {
  return c.status ?? "active";
}

export const listConnections = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const asA = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", owner.companyId))
      .collect();
    const asB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyBId", (q) => q.eq("companyBId", owner.companyId))
      .collect();

    const connections = [];
    for (const conn of asA) {
      if (connStatus(conn) !== "active") continue;
      const company = await ctx.db.get(conn.companyBId);
      connections.push({
        _id: conn._id,
        companyId: conn.companyBId,
        companyName: company?.name ?? "Unknown",
        createdAt: conn.createdAt,
      });
    }
    for (const conn of asB) {
      if (connStatus(conn) !== "active") continue;
      const company = await ctx.db.get(conn.companyAId);
      connections.push({
        _id: conn._id,
        companyId: conn.companyAId,
        companyName: company?.name ?? "Unknown",
        createdAt: conn.createdAt,
      });
    }
    return connections;
  },
});

export const listIncomingInvites = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const rows = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyBId", (q) => q.eq("companyBId", owner.companyId))
      .collect();

    const invites = [];
    for (const conn of rows) {
      if (connStatus(conn) !== "pending") continue;
      const company = await ctx.db.get(conn.companyAId);
      invites.push({
        _id: conn._id,
        companyId: conn.companyAId,
        companyName: company?.name ?? "Unknown",
        createdAt: conn.createdAt,
      });
    }
    return invites;
  },
});

export const listOutgoingInvites = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    const rows = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", owner.companyId))
      .collect();

    const invites = [];
    for (const conn of rows) {
      if (connStatus(conn) !== "pending") continue;
      const company = await ctx.db.get(conn.companyBId);
      invites.push({
        _id: conn._id,
        companyId: conn.companyBId,
        companyName: company?.name ?? "Unknown",
        createdAt: conn.createdAt,
      });
    }
    return invites;
  },
});

export const getSharedJobStatus = query({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await assertOwnerRole(ctx, args.userId);

    // Shared jobs originating from this job (Owner1 view)
    const outgoing = await ctx.db
      .query("sharedJobs")
      .withIndex("by_originalJobId", (q) => q.eq("originalJobId", args.jobId))
      .collect();

    const results = [];
    for (const shared of outgoing) {
      if (shared.fromCompanyId !== owner.companyId) continue;
      const toCompany = await ctx.db.get(shared.toCompanyId);
      results.push({
        _id: shared._id,
        toCompanyName: toCompany?.name ?? "Unknown",
        status: shared.status,
        sharePackage: shared.sharePackage,
        completionNotes: shared.completionNotes,
        checklistSummary: shared.checklistSummary,
        photoStorageIds: shared.photoStorageIds,
        completedAt: shared.completedAt,
      });
    }
    return results;
  },
});
