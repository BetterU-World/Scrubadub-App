import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/** Reserve an auditable owner/company flow before any account creation request. */
export const reserveCompanyConnectFlow = internalMutation({
  args: { companyId: v.id("companies"), ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");
    const owner = await ctx.db.get(args.ownerId);
    if (!owner || owner.role !== "owner" || owner.status === "inactive" || owner.companyId !== company._id) throw new Error("Owner access required");
    if (company.stripeConnectArchitecture === "merchant_direct_v2") throw new Error("Company already uses the current payment account");
    if (company.stripeConnectFlowId) {
      const flow = await ctx.db.get(company.stripeConnectFlowId);
      if (!flow || flow.ownerId !== owner._id || flow.companyId !== company._id || flow.status === "active") throw new Error("Onboarding flow requires review");
      return flow;
    }
    const flowId = await ctx.db.insert("companyConnectFlows", { ...args, previousAccountId: company.stripeConnectAccountId, status: "creating", createdAt: Date.now() });
    await ctx.db.patch(company._id, { stripeConnectFlowId: flowId });
    return (await ctx.db.get(flowId))!;
  },
});

export const recordCompanyConnectPending = internalMutation({
  args: { flowId: v.id("companyConnectFlows"), accountId: v.string() },
  handler: async (ctx, args) => {
    const flow = await ctx.db.get(args.flowId);
    const company = flow ? await ctx.db.get(flow.companyId) : null;
    if (!flow || !company || company.stripeConnectFlowId !== flow._id || flow.status === "active" || (flow.accountId && flow.accountId !== args.accountId)) throw new Error("Onboarding identity changed");
    await ctx.db.patch(flow._id, { accountId: args.accountId, status: "onboarding" });
    await ctx.db.patch(company._id, { stripeConnectPendingAccountId: args.accountId });
  },
});

export const activateCompanyMerchant = internalMutation({
  args: { companyId: v.id("companies"), ownerId: v.id("users"), flowId: v.id("companyConnectFlows"), accountId: v.string(), observedAt: v.number() },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    const owner = await ctx.db.get(args.ownerId);
    const flow = await ctx.db.get(args.flowId);
    if (!company || !owner || owner.role !== "owner" || owner.status === "inactive" || owner.companyId !== company._id || !flow || flow.companyId !== company._id || flow.ownerId !== owner._id || flow.accountId !== args.accountId || flow.status !== "onboarding" || company.stripeConnectFlowId !== flow._id || company.stripeConnectPendingAccountId !== args.accountId || company.stripeConnectAccountId !== flow.previousAccountId) throw new Error("Onboarding activation identity changed");
    const unresolved = (await ctx.db.query("invoicePaymentAttempts").withIndex("by_companyId", q => q.eq("companyId", company._id)).collect()).some(a => a.status === "creating" || a.status === "open");
    if (unresolved) throw new Error("Previous payment sessions must be resolved before activation");
    await ctx.db.patch(company._id, { stripeConnectAccountId: args.accountId, stripeConnectArchitecture: "merchant_direct_v2", stripeConnectModernReady: true, stripeConnectPendingAccountId: undefined, stripeConnectFlowId: undefined, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectRequirementsDue: false, stripeConnectDisabledReason: undefined, stripeConnectOnboardedAt: Date.now(), stripeConnectLastSyncAt: Date.now(), stripeConnectStatusObservedAt: args.observedAt });
    await ctx.db.patch(flow._id, { status: "active", activatedAt: Date.now() });
  },
});

export const syncCompanyStripeConnectStatus = internalMutation({
  args: {
    stripeConnectAccountId: v.string(),
    observedAt: v.number(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
    detailsSubmitted: v.boolean(),
    requirementsDue: v.boolean(),
    disabledReason: v.optional(v.string()),
    modernReady: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.query("companies")
      .withIndex("by_stripeConnectAccountId", q => q.eq("stripeConnectAccountId", args.stripeConnectAccountId))
      .unique();
    if (!company) return false;
    if ((company.stripeConnectStatusObservedAt ?? 0) > args.observedAt) return false;
    await ctx.db.patch(company._id, {
      stripeConnectChargesEnabled: args.chargesEnabled,
      stripeConnectPayoutsEnabled: args.payoutsEnabled,
      stripeConnectDetailsSubmitted: args.detailsSubmitted,
      stripeConnectRequirementsDue: args.requirementsDue,
      stripeConnectDisabledReason: args.disabledReason,
      stripeConnectLastSyncAt: Date.now(),
      stripeConnectStatusObservedAt: args.observedAt,
      // V1 account.updated can revoke readiness but cannot certify V2 economics.
      stripeConnectModernReady: args.modernReady ?? (args.chargesEnabled && args.payoutsEnabled && !args.requirementsDue && !args.disabledReason ? company.stripeConnectModernReady : false),
    });
    return true;
  },
});
