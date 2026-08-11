import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

export const getSummary = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canViewFinancials");
    if (actor.companyId !== args.companyId) throw new Error("Access denied");
    const invoices = await ctx.db.query("invoices").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).collect();
    const active = invoices.filter((invoice) => invoice.status !== "void");
    const totalsByStatus = { draft: 0, issued: 0, paid: 0, void: 0 };
    for (const invoice of invoices) totalsByStatus[invoice.status] += invoice.totalCents;
    return {
      invoiceCount: invoices.length,
      invoicedCents: active.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      paidCents: totalsByStatus.paid,
      outstandingCents: totalsByStatus.issued,
      totalsByStatus,
    };
  },
});
