import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { hasPlatformAdmin, hasComplimentarySubscription } from "./lib/platformEntitlements";

// Only deployment operators can invoke these internal functions. The strings
// below are attribution/intent, NOT authentication credentials. Never add public
// wrappers or schedule these functions with caller-supplied arguments.
const authorization = {
  operator: v.string(), approvalReference: v.string(), reason: v.string(),
  confirmation: v.string(), expectedRevision: v.number(), active: v.boolean(),
};
function validateOperator(args: { operator: string; approvalReference: string; reason: string; confirmation: string; expectedRevision: number; active: boolean }, kind: string, id: string) {
  for (const value of [args.operator, args.approvalReference, args.reason]) {
    if (!value.trim() || value.length > 500 || /[\r\n\x00-\x1f]/.test(value)) throw new Error("Operator attribution and approval are required (maximum 500 characters)");
  }
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0) throw new Error("Invalid expected revision");
  if (args.confirmation !== `${args.active ? "GRANT" : "REVOKE"} ${kind} ${id}`) throw new Error("Exact operator confirmation required");
}

export const setAdministrator = internalMutation({
  args: { ...authorization, userId: v.id("users") },
  handler: async (ctx, args) => {
    validateOperator(args, "ADMIN", args.userId);
    const user = await ctx.db.get(args.userId);
    if (!user || (args.active && user.status !== "active")) throw new Error("Grant requires an existing active staff user");
    const prior = await ctx.db.query("platformAdmins").withIndex("by_userId", q => q.eq("userId", args.userId)).unique();
    if ((prior?.revision ?? 0) !== args.expectedRevision) throw new Error("Entitlement changed; inspect readiness before retrying");
    const revision = (prior?.revision ?? 0) + 1;
    const updatedAt = Date.now();
    if (prior) await ctx.db.patch(prior._id, { active: args.active, revision, updatedAt });
    else await ctx.db.insert("platformAdmins", { userId: args.userId, active: args.active, revision, updatedAt });
    // Audit failure rolls back the grant/revocation in the same transaction.
    await ctx.db.insert("platformProvisioningAudit", { kind: "admin", targetId: args.userId, active: args.active, revision, operator: args.operator.trim(), approvalReference: args.approvalReference.trim(), reason: args.reason.trim(), createdAt: updatedAt });
    return { userId: args.userId, active: args.active, revision };
  },
});

export const setComplimentarySubscription = internalMutation({
  args: { ...authorization, companyId: v.id("companies") },
  handler: async (ctx, args) => {
    validateOperator(args, "BILLING", args.companyId);
    if (!await ctx.db.get(args.companyId)) throw new Error("Company not found");
    const prior = await ctx.db.query("complimentarySubscriptions").withIndex("by_companyId", q => q.eq("companyId", args.companyId)).unique();
    if ((prior?.revision ?? 0) !== args.expectedRevision) throw new Error("Exemption changed; inspect readiness before retrying");
    const revision = (prior?.revision ?? 0) + 1;
    const updatedAt = Date.now();
    if (prior) await ctx.db.patch(prior._id, { active: args.active, revision, updatedAt });
    else await ctx.db.insert("complimentarySubscriptions", { companyId: args.companyId, active: args.active, revision, updatedAt });
    await ctx.db.insert("platformProvisioningAudit", { kind: "billing", targetId: args.companyId, active: args.active, revision, operator: args.operator.trim(), approvalReference: args.approvalReference.trim(), reason: args.reason.trim(), createdAt: updatedAt });
    return { companyId: args.companyId, active: args.active, revision };
  },
});

// IDs must be manually approved outside the application. This function neither
// discovers nor automatically trusts a legacy email match. It writes nothing.
export const readiness = internalQuery({
  args: { approvedAdministratorIds: v.array(v.id("users")), approvedComplimentaryCompanyIds: v.array(v.id("companies")), confirmation: v.string(), approvalReference: v.string() },
  handler: async (ctx, args) => {
    if (args.confirmation !== "VERIFY APPROVED PLATFORM IDS" || !args.approvalReference.trim()) throw new Error("Explicit approval confirmation required");
    if (args.approvedAdministratorIds.length === 0 || args.approvedAdministratorIds.length > 100 || args.approvedComplimentaryCompanyIds.length > 100) throw new Error("Provide 1–100 approved administrators and at most 100 companies");
    if (new Set(args.approvedAdministratorIds).size !== args.approvedAdministratorIds.length || new Set(args.approvedComplimentaryCompanyIds).size !== args.approvedComplimentaryCompanyIds.length) throw new Error("Duplicate approved IDs");
    const administrators = await Promise.all(args.approvedAdministratorIds.map(async userId => {
      const entitlement = await ctx.db.query("platformAdmins").withIndex("by_userId", q => q.eq("userId", userId)).unique();
      return { userId, ready: await hasPlatformAdmin(ctx, userId), revision: entitlement?.revision ?? 0 };
    }));
    const companies = await Promise.all(args.approvedComplimentaryCompanyIds.map(async companyId => {
      const entitlement = await ctx.db.query("complimentarySubscriptions").withIndex("by_companyId", q => q.eq("companyId", companyId)).unique();
      return { companyId, ready: !!await ctx.db.get(companyId) && await hasComplimentarySubscription(ctx, companyId), revision: entitlement?.revision ?? 0 };
    }));
    return { ready: administrators.every(row => row.ready) && companies.every(row => row.ready), administrators, companies, approvalReference: args.approvalReference.trim(), checkedAt: Date.now(), warning: "Snapshot only. Freeze provisioning changes and verify all intended legacy billing exemptions separately before cutover." };
  },
});
